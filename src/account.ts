import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type LocalAccount,
  type SignableMessage,
  type TransactionSerializable,
  type TypedData,
  type TypedDataDefinition,
  type SignedAuthorizationList,
  hashMessage,
  hashTypedData,
  keccak256,
  serializeTransaction,
  toHex,
  toRlp,
  concat,
  numberToHex,
} from 'viem'
import { toAccount } from 'viem/accounts'
import type { AuthSession, KentuckySignerConfig } from './types'
import { KentuckySignerClient, KentuckySignerError } from './client'
import { SecureKentuckySignerClient } from './secure-client'
import type { EphemeralKeyManager } from './ephemeral'

/**
 * 2FA codes for signing operations
 */
export interface TwoFactorCodes {
  /** TOTP code from authenticator app */
  totpCode?: string
  /** PIN code */
  pin?: string
}

/**
 * Callback to request 2FA codes from the user
 * Returns null/undefined if user cancels
 */
export type TwoFactorCallback = (requirements: {
  totpRequired: boolean
  pinRequired: boolean
  pinLength: number
}) => Promise<TwoFactorCodes | null | undefined>

/**
 * EIP-7702 Magic byte used in authorization hash
 * @see https://eips.ethereum.org/EIPS/eip-7702
 */
const EIP7702_MAGIC = '0x05' as const

/**
 * Parameters for signing an EIP-7702 authorization
 */
export interface SignAuthorizationParameters {
  /** The contract address to delegate to */
  contractAddress: Address
  /** Chain ID (0 for all chains, defaults to client chain) */
  chainId?: number
  /** Nonce for the authorization (defaults to account's current nonce) */
  nonce?: bigint
  /**
   * Whether the authorization will be executed by the signer themselves.
   * If 'self', the nonce in the authorization will be incremented by 1
   * over the transaction nonce.
   */
  executor?: 'self'
}

/**
 * Signed EIP-7702 authorization
 * Compatible with viem's SignedAuthorizationList
 */
export interface SignedAuthorization {
  /** Chain ID (0 for all chains) */
  chainId: number
  /** Contract address to delegate to */
  contractAddress: Address
  /** Nonce for the authorization */
  nonce: bigint
  /** Recovery identifier (0 or 1) */
  yParity: number
  /** Signature r component */
  r: Hex
  /** Signature s component */
  s: Hex
}

/**
 * Compute the hash for an EIP-7702 authorization
 * Hash = keccak256(0x05 || rlp([chain_id, address, nonce]))
 */
function hashAuthorization(params: {
  contractAddress: Address
  chainId: number
  nonce: bigint
}): Hex {
  const rlpEncoded = toRlp([
    params.chainId === 0 ? '0x' : numberToHex(params.chainId),
    params.contractAddress,
    params.nonce === 0n ? '0x' : numberToHex(params.nonce),
  ])
  return keccak256(concat([EIP7702_MAGIC, rlpEncoded]))
}

/**
 * Options for creating a Kentucky Signer account
 */
export interface KentuckySignerAccountOptions {
  /** Kentucky Signer configuration */
  config: KentuckySignerConfig
  /** Authenticated session */
  session: AuthSession
  /** Default chain ID for signing (can be overridden per-transaction) */
  defaultChainId?: number
  /** Callback when session needs refresh */
  onSessionExpired?: () => Promise<AuthSession>
  /** Optional secure client for ephemeral key signing */
  secureClient?: SecureKentuckySignerClient
  /** Callback to request 2FA codes when required */
  on2FARequired?: TwoFactorCallback
}

/**
 * Extended account type with Kentucky Signer specific properties
 */
export interface KentuckySignerAccount extends Omit<LocalAccount<'kentuckySigner'>, 'signAuthorization'> {
  /** Account ID */
  accountId: string
  /** Current session */
  session: AuthSession
  /** Update the session (e.g., after refresh) */
  updateSession: (session: AuthSession) => void
  /**
   * Sign an EIP-7702 authorization to delegate code to this account
   *
   * @param params - Authorization parameters
   * @param nonce - Current account nonce (required if params.nonce not specified)
   * @returns Signed authorization compatible with viem's authorizationList
   *
   * @example
   * ```typescript
   * // Get current nonce
   * const nonce = await publicClient.getTransactionCount({ address: account.address })
   *
   * // Sign authorization
   * const authorization = await account.sign7702Authorization({
   *   contractAddress: '0x69007702764179f14F51cdce752f4f775d74E139', // Alchemy MA v2
   *   chainId: 1,
   *   executor: 'self', // Account will execute the tx
   * }, nonce)
   *
   * // Send EIP-7702 transaction
   * const hash = await walletClient.sendTransaction({
   *   authorizationList: [authorization],
   *   to: account.address,
   *   data: initializeCalldata,
   * })
   * ```
   */
  sign7702Authorization: (
    params: SignAuthorizationParameters,
    nonce: bigint
  ) => Promise<SignedAuthorization>
}

/**
 * Create a custom Viem account backed by Kentucky Signer
 *
 * This account implementation uses the Kentucky Signer API to sign
 * transactions, messages, and typed data using passkey authentication.
 *
 * @param options - Account options
 * @returns Viem-compatible account
 *
 * @example
 * ```typescript
 * const account = createKentuckySignerAccount({
 *   config: {
 *     baseUrl: 'https://signer.example.com',
 *     accountId: '0x...',
 *   },
 *   session: authenticatedSession,
 *   defaultChainId: 1,
 * })
 *
 * const walletClient = createWalletClient({
 *   account,
 *   chain: mainnet,
 *   transport: http(),
 * })
 *
 * const hash = await walletClient.sendTransaction({
 *   to: '0x...',
 *   value: parseEther('0.1'),
 * })
 * ```
 */
export function createKentuckySignerAccount(
  options: KentuckySignerAccountOptions
): KentuckySignerAccount {
  const { config, defaultChainId = 1, onSessionExpired, secureClient, on2FARequired } = options
  let session = options.session

  // Use secure client if provided, otherwise use standard client
  const client = secureClient ?? new KentuckySignerClient({ baseUrl: config.baseUrl })

  /**
   * Get current token, refreshing if needed
   */
  async function getToken(): Promise<string> {
    // Check if session is about to expire (within 60 seconds)
    if (Date.now() + 60000 >= session.expiresAt) {
      if (onSessionExpired) {
        session = await onSessionExpired()
      } else {
        throw new KentuckySignerError(
          'Session expired',
          'SESSION_EXPIRED',
          'Please re-authenticate with your passkey'
        )
      }
    }
    return session.token
  }

  /**
   * Ensure a value is properly formatted as a Hex string with 0x prefix
   */
  function ensureHexPrefix(value: string): Hex {
    return (value.startsWith('0x') ? value : `0x${value}`) as Hex
  }

  /**
   * Sign a hash using Kentucky Signer and return full signature
   * Handles 2FA by detecting the error and calling the callback
   *
   * Note: v in returned signature is always 27 or 28 (standard format)
   */
  async function signHash(hash: Hex): Promise<Hex> {
    const token = await getToken()

    // First attempt without 2FA codes
    try {
      const response = await client.signEvmTransaction(
        { tx_hash: hash },
        token
      )
      // Ensure the signature has 0x prefix
      return ensureHexPrefix(response.signature.full)
    } catch (err) {
      // Check if 2FA is required
      if (err instanceof KentuckySignerError && err.code === '2FA_REQUIRED' && on2FARequired) {
        // Parse requirements from error details
        const totpRequired = err.message.includes('TOTP') || (err.details?.includes('totp_code') ?? false)
        const pinRequired = err.message.includes('PIN') || (err.details?.includes('pin') ?? false)
        // Default to 6-digit PIN if required
        const pinLength = err.details?.match(/(\d)-digit/)?.[1] ? parseInt(err.details.match(/(\d)-digit/)![1]) : 6

        // Request 2FA codes from user
        const codes = await on2FARequired({ totpRequired, pinRequired, pinLength })
        if (!codes) {
          throw new KentuckySignerError('2FA verification cancelled', '2FA_CANCELLED', 'User cancelled 2FA input')
        }

        // Retry with 2FA codes
        const response = await client.signEvmTransactionWith2FA(
          { tx_hash: hash, totp_code: codes.totpCode, pin: codes.pin },
          token
        )
        // Ensure the signature has 0x prefix
        return ensureHexPrefix(response.signature.full)
      }
      throw err
    }
  }

  /**
   * Sign a hash using Kentucky Signer and return signature components
   * Handles 2FA by detecting the error and calling the callback
   *
   * Note: v is always 27 or 28 (standard format, recovery_id + 27)
   */
  async function signHashWithComponents(hash: Hex): Promise<{ r: Hex; s: Hex; v: number }> {
    const token = await getToken()

    // First attempt without 2FA codes
    try {
      const response = await client.signEvmTransaction(
        { tx_hash: hash },
        token
      )
      return {
        r: ensureHexPrefix(response.signature.r),
        s: ensureHexPrefix(response.signature.s),
        v: response.signature.v,
      }
    } catch (err) {
      // Check if 2FA is required
      if (err instanceof KentuckySignerError && err.code === '2FA_REQUIRED' && on2FARequired) {
        // Parse requirements from error details
        const totpRequired = err.message.includes('TOTP') || (err.details?.includes('totp_code') ?? false)
        const pinRequired = err.message.includes('PIN') || (err.details?.includes('pin') ?? false)
        // Default to 6-digit PIN if required
        const pinLength = err.details?.match(/(\d)-digit/)?.[1] ? parseInt(err.details.match(/(\d)-digit/)![1]) : 6

        // Request 2FA codes from user
        const codes = await on2FARequired({ totpRequired, pinRequired, pinLength })
        if (!codes) {
          throw new KentuckySignerError('2FA verification cancelled', '2FA_CANCELLED', 'User cancelled 2FA input')
        }

        // Retry with 2FA codes
        const response = await client.signEvmTransactionWith2FA(
          { tx_hash: hash, totp_code: codes.totpCode, pin: codes.pin },
          token
        )
        return {
          r: ensureHexPrefix(response.signature.r),
          s: ensureHexPrefix(response.signature.s),
          v: response.signature.v,
        }
      }
      throw err
    }
  }

  const account = toAccount({
    address: session.evmAddress,

    /**
     * Sign a message
     *
     * Supports string messages, hex messages, and raw bytes.
     */
    async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
      const messageHash = hashMessage(message)
      return signHash(messageHash)
    },

    /**
     * Sign a transaction
     *
     * Serializes the transaction, hashes it, signs via Kentucky Signer,
     * and returns the signed serialized transaction.
     *
     * For legacy transactions, applies EIP-155 encoding (v = chainId * 2 + 35 + recoveryId)
     * For modern transactions (EIP-1559, EIP-2930, etc.), uses yParity (0 or 1)
     */
    async signTransaction(
      transaction: TransactionSerializable
    ): Promise<Hex> {
      // Get chain ID from transaction or use default
      const chainId = transaction.chainId ?? defaultChainId

      // Serialize unsigned transaction
      const serializedUnsigned = serializeTransaction(transaction)

      // Hash the serialized transaction
      const txHash = keccak256(serializedUnsigned)

      // Sign the hash - v is always 27 or 28 (recovery_id + 27)
      const { r, s, v } = await signHashWithComponents(txHash)

      // Convert v (27/28) to recovery ID (0/1)
      const recoveryId = v - 27

      // Determine signature format based on transaction type
      let signatureV: bigint
      let yParity: number

      if (
        transaction.type === 'eip1559' ||
        transaction.type === 'eip2930' ||
        transaction.type === 'eip4844' ||
        transaction.type === 'eip7702'
      ) {
        // Modern transactions use yParity directly (0 or 1)
        yParity = recoveryId
        signatureV = BigInt(yParity)
      } else {
        // Legacy transaction - apply EIP-155 encoding
        // v = chainId * 2 + 35 + recoveryId
        signatureV = BigInt(chainId * 2 + 35 + recoveryId)
        yParity = recoveryId
      }

      // Serialize with signature
      const serializedSigned = serializeTransaction(transaction, {
        r,
        s,
        v: signatureV,
        yParity,
      } as any)

      return serializedSigned
    },

    /**
     * Sign typed data (EIP-712)
     */
    async signTypedData<
      const TTypedData extends TypedData | Record<string, unknown>,
      TPrimaryType extends keyof TTypedData | 'EIP712Domain' = keyof TTypedData
    >(
      typedData: TypedDataDefinition<TTypedData, TPrimaryType>
    ): Promise<Hex> {
      const hash = hashTypedData(typedData)
      return signHash(hash)
    },
  }) as KentuckySignerAccount

  // Add Kentucky Signer specific properties
  account.source = 'kentuckySigner'
  account.accountId = config.accountId
  account.session = session
  account.updateSession = (newSession: AuthSession) => {
    session = newSession
    // Update address if changed (shouldn't happen but handle it)
    if (newSession.evmAddress !== account.address) {
      ;(account as any).address = newSession.evmAddress
    }
  }

  /**
   * Sign an EIP-7702 authorization
   *
   * This allows the EOA to delegate its code to a smart contract,
   * enabling smart account features like batching and gas sponsorship.
   */
  account.sign7702Authorization = async (
    params: SignAuthorizationParameters,
    currentNonce: bigint
  ): Promise<SignedAuthorization> => {
    // Determine the nonce for the authorization
    // If executor is 'self', increment by 1 because the tx will use currentNonce
    const authNonce = params.executor === 'self'
      ? currentNonce + 1n
      : (params.nonce ?? currentNonce)

    // Use provided chainId or default
    const chainId = params.chainId ?? defaultChainId

    // Compute the authorization hash
    const authHash = hashAuthorization({
      contractAddress: params.contractAddress,
      chainId,
      nonce: authNonce,
    })

    // Sign the hash using Kentucky Signer
    // v is always 27 or 28 (recovery_id + 27)
    const { r, s, v } = await signHashWithComponents(authHash)

    // Convert v (27/28) to yParity (0/1) for EIP-7702
    const yParity = v - 27

    return {
      chainId,
      contractAddress: params.contractAddress,
      nonce: authNonce,
      yParity,
      r,
      s,
    }
  }

  return account
}

/**
 * Create a Kentucky Signer account for server-side use
 *
 * Convenience function for Node.js environments where you have
 * a pre-existing JWT token.
 *
 * @param baseUrl - Kentucky Signer API URL
 * @param accountId - Account ID
 * @param token - JWT token
 * @param evmAddress - EVM address for the account
 * @param chainId - Default chain ID
 * @returns Kentucky Signer account
 */
export function createServerAccount(
  baseUrl: string,
  accountId: string,
  token: string,
  evmAddress: Address,
  chainId: number = 1
): KentuckySignerAccount {
  const session: AuthSession = {
    token,
    accountId,
    evmAddress,
    expiresAt: Date.now() + 3600000, // 1 hour default
  }

  return createKentuckySignerAccount({
    config: { baseUrl, accountId },
    session,
    defaultChainId: chainId,
  })
}
