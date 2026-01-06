import type { Address, Hex } from 'viem'
import type { ExecutionIntent, SignedIntent } from './intent'

/**
 * Payment mode for relaying
 */
export type PaymentMode = 'sponsored' | { token: Address }

/**
 * EIP-7702 Authorization for gasless onboarding
 * When provided to relay(), allows users with 0 ETH to delegate their EOA
 * to the smart account delegate in the same transaction as execution
 */
export interface Authorization7702 {
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
 * Token payment option returned by estimate
 */
export interface TokenOption {
  /** Token address */
  token: Address
  /** Token symbol */
  symbol: string
  /** Estimated fee in token units */
  estimatedFee: string
  /** Fee percentage (e.g., 5 = 5%) */
  feePercentage: number
}

/**
 * Gas estimate response
 */
export interface EstimateResponse {
  /** Estimated gas units */
  gasEstimate: string
  /** Estimated gas cost in wei */
  gasCostWei: string
  /** Whether sponsored mode is available */
  sponsoredAvailable: boolean
  /** Available token payment options */
  tokenOptions: TokenOption[]
}

/**
 * Relay response
 */
export interface RelayResponse {
  /** Whether the relay was successful */
  success: boolean
  /** Transaction hash if successful */
  txHash?: Hex
  /** Error message if failed */
  error?: string
}

/**
 * Transaction status
 */
export type TransactionStatus = 'pending' | 'confirmed' | 'failed'

/**
 * Status response
 */
export interface StatusResponse {
  /** Current status */
  status: TransactionStatus
  /** Transaction hash */
  txHash: Hex
  /** Block number if confirmed */
  blockNumber?: number
  /** Gas used if confirmed */
  gasUsed?: string
  /** Token amount paid if applicable */
  tokenPaid?: string
}

/**
 * Relayer client options
 */
export interface RelayerClientOptions {
  /** Relayer API base URL */
  baseUrl: string
  /** Request timeout in ms (default: 30000) */
  timeout?: number
}

/**
 * Client for interacting with the Kentucky Signer Relayer API
 *
 * @example
 * ```typescript
 * const relayer = new RelayerClient({ baseUrl: 'https://relayer.example.com' })
 *
 * // Get nonce
 * const nonce = await relayer.getNonce(42161, accountAddress)
 *
 * // Create and sign intent
 * const intent = createExecutionIntent({ nonce, target: '0x...' })
 * const signed = await signIntent(account, intent)
 *
 * // Estimate fees
 * const estimate = await relayer.estimate(42161, accountAddress, intent)
 *
 * // Relay transaction
 * const result = await relayer.relay(42161, accountAddress, signed, 'sponsored')
 * console.log('TX Hash:', result.txHash)
 *
 * // Check status
 * const status = await relayer.getStatus(42161, result.txHash!)
 * ```
 */
export class RelayerClient {
  private baseUrl: string
  private timeout: number

  constructor(options: RelayerClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.timeout = options.timeout ?? 30000
  }

  /**
   * Check if the relayer is healthy
   */
  async health(): Promise<{ status: string; relayer: Address; timestamp: string }> {
    const response = await this.fetch('/health')
    return response
  }

  /**
   * Get the current nonce for an account
   *
   * @param chainId - Chain ID
   * @param address - Account address
   * @returns Current nonce as bigint
   */
  async getNonce(chainId: number, address: Address): Promise<bigint> {
    const response = await this.fetch(`/nonce/${chainId}/${address}`)
    return BigInt(response.nonce)
  }

  /**
   * Estimate gas and fees for an intent
   *
   * @param chainId - Chain ID
   * @param accountAddress - Account address (the delegated EOA)
   * @param intent - Execution intent
   * @returns Estimate response
   */
  async estimate(
    chainId: number,
    accountAddress: Address,
    intent: ExecutionIntent
  ): Promise<EstimateResponse> {
    const response = await this.fetch('/estimate', {
      method: 'POST',
      body: JSON.stringify({
        chainId,
        accountAddress,
        intent: {
          nonce: intent.nonce.toString(),
          deadline: intent.deadline.toString(),
          target: intent.target,
          value: intent.value.toString(),
          data: intent.data,
        },
      }),
    })
    return response
  }

  /**
   * Relay a signed intent
   *
   * @param chainId - Chain ID
   * @param accountAddress - Account address (the delegated EOA)
   * @param signedIntent - Signed execution intent
   * @param paymentMode - Payment mode ('sponsored' or { token: Address })
   * @param authorization - Optional EIP-7702 authorization for gasless onboarding
   * @returns Relay response with transaction hash
   *
   * @example Gasless onboarding (delegate + execute in one tx)
   * ```typescript
   * // Get current nonce for authorization
   * const txNonce = await publicClient.getTransactionCount({ address: accountAddress })
   *
   * // Sign EIP-7702 authorization
   * const authorization = await account.sign7702Authorization({
   *   contractAddress: delegateAddress,
   *   chainId: 42161,
   * }, txNonce)
   *
   * // Relay with authorization
   * const result = await relayer.relay(
   *   42161,
   *   accountAddress,
   *   signedIntent,
   *   'sponsored',
   *   authorization
   * )
   * ```
   */
  async relay(
    chainId: number,
    accountAddress: Address,
    signedIntent: SignedIntent,
    paymentMode: PaymentMode,
    authorization?: Authorization7702
  ): Promise<RelayResponse> {
    const body: any = {
      chainId,
      accountAddress,
      intent: {
        nonce: signedIntent.intent.nonce.toString(),
        deadline: signedIntent.intent.deadline.toString(),
        target: signedIntent.intent.target,
        value: signedIntent.intent.value.toString(),
        data: signedIntent.intent.data,
      },
      ownerSignature: signedIntent.signature,
      paymentMode,
    }

    // Include authorization for gasless onboarding if provided
    if (authorization) {
      body.authorization = {
        chainId: authorization.chainId,
        contractAddress: authorization.contractAddress,
        nonce: authorization.nonce.toString(),
        yParity: authorization.yParity,
        r: authorization.r,
        s: authorization.s,
      }
    }

    const response = await this.fetch('/relay', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return response
  }

  /**
   * Get transaction status
   *
   * @param chainId - Chain ID
   * @param txHash - Transaction hash
   * @returns Status response
   */
  async getStatus(chainId: number, txHash: Hex): Promise<StatusResponse> {
    const response = await this.fetch(`/status/${chainId}/${txHash}`)
    return response
  }

  /**
   * Make a fetch request to the relayer API
   */
  private async fetch(path: string, options?: RequestInit): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        signal: controller.signal,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Request failed: ${response.status}`)
      }

      return data
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Create a relayer client
 *
 * @param baseUrl - Relayer API base URL
 * @returns Relayer client instance
 */
export function createRelayerClient(baseUrl: string): RelayerClient {
  return new RelayerClient({ baseUrl })
}
