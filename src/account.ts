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
  hashMessage,
  hashTypedData,
  keccak256,
  serializeTransaction,
  toHex,
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
export interface KentuckySignerAccount extends LocalAccount<'kentuckySigner'> {
  /** Account ID */
  accountId: string
  /** Current session */
  session: AuthSession
  /** Update the session (e.g., after refresh) */
  updateSession: (session: AuthSession) => void
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
   * Sign a hash using Kentucky Signer and return full signature
   * Handles 2FA by detecting the error and calling the callback
   */
  async function signHash(hash: Hex, chainId: number): Promise<Hex> {
    const token = await getToken()

    // First attempt without 2FA codes
    try {
      const response = await client.signEvmTransaction(
        { tx_hash: hash, chain_id: chainId },
        token
      )
      return response.signature.full
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
          { tx_hash: hash, chain_id: chainId, totp_code: codes.totpCode, pin: codes.pin },
          token
        )
        return response.signature.full
      }
      throw err
    }
  }

  /**
   * Sign a hash using Kentucky Signer and return signature components
   * Handles 2FA by detecting the error and calling the callback
   */
  async function signHashWithComponents(hash: Hex, chainId: number): Promise<{ r: Hex; s: Hex; v: number }> {
    const token = await getToken()

    // First attempt without 2FA codes
    try {
      const response = await client.signEvmTransaction(
        { tx_hash: hash, chain_id: chainId },
        token
      )
      return {
        r: response.signature.r,
        s: response.signature.s,
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
          { tx_hash: hash, chain_id: chainId, totp_code: codes.totpCode, pin: codes.pin },
          token
        )
        return {
          r: response.signature.r,
          s: response.signature.s,
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
      return signHash(messageHash, defaultChainId)
    },

    /**
     * Sign a transaction
     *
     * Serializes the transaction, hashes it, signs via Kentucky Signer,
     * and returns the signed serialized transaction.
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

      // Sign the hash and get components directly from API
      const { r, s, v } = await signHashWithComponents(txHash, chainId)

      // For EIP-1559 and EIP-2930 transactions, v is 0 or 1
      // For legacy transactions, v is chainId * 2 + 35 + recovery
      let yParity: number
      if (
        transaction.type === 'eip1559' ||
        transaction.type === 'eip2930' ||
        transaction.type === 'eip4844' ||
        transaction.type === 'eip7702'
      ) {
        yParity = v >= 27 ? v - 27 : v // Convert from 27/28 to 0/1 if needed
      } else {
        // Legacy transaction - v already includes chain ID
        yParity = v
      }

      // Serialize with signature
      const serializedSigned = serializeTransaction(transaction, {
        r,
        s,
        v: BigInt(yParity),
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
      return signHash(hash, defaultChainId)
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
