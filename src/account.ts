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
  const { config, defaultChainId = 1, onSessionExpired } = options
  let session = options.session

  const client = new KentuckySignerClient({ baseUrl: config.baseUrl })

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
   * Sign a hash using Kentucky Signer
   */
  async function signHash(hash: Hex, chainId: number): Promise<Hex> {
    const token = await getToken()
    const response = await client.signEvmTransaction(
      { tx_hash: hash, chain_id: chainId },
      token
    )
    return response.signature.full
  }

  /**
   * Parse signature components from full signature
   */
  function parseSignature(signature: Hex): { r: Hex; s: Hex; v: bigint } {
    // Signature is 65 bytes: r (32) + s (32) + v (1)
    const r = `0x${signature.slice(2, 66)}` as Hex
    const s = `0x${signature.slice(66, 130)}` as Hex
    const v = BigInt(`0x${signature.slice(130, 132)}`)
    return { r, s, v }
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

      // Sign the hash
      const signature = await signHash(txHash, chainId)

      // Parse signature components
      const { r, s, v } = parseSignature(signature)

      // For EIP-1559 and EIP-2930 transactions, v is 0 or 1
      // For legacy transactions, v is chainId * 2 + 35 + recovery
      let yParity: number
      if (
        transaction.type === 'eip1559' ||
        transaction.type === 'eip2930' ||
        transaction.type === 'eip4844' ||
        transaction.type === 'eip7702'
      ) {
        yParity = Number(v) - 27 // Convert from 27/28 to 0/1
      } else {
        // Legacy transaction - v already includes chain ID
        yParity = Number(v)
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
