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

// ============================================================================
// Solana Relay Types
// ============================================================================

/**
 * Solana relayer info
 */
export interface SolanaRelayInfo {
  /** Relayer's Solana public key (base58) */
  relayerPublicKey: string
  /** Solana network (mainnet-beta, devnet, etc.) */
  network: string
}

/**
 * Solana fee estimate response
 */
export interface SolanaEstimateResponse {
  /** Estimated fee in lamports */
  feeLamports: string
  /** Estimated fee in SOL */
  feeSol: string
  /** Priority fee in lamports */
  priorityFee: string
  /** Relayer public key to use as feePayer */
  relayerPublicKey: string
}

/**
 * Solana relay response
 */
export interface SolanaRelayResponse {
  /** Whether the relay was successful */
  success: boolean
  /** Transaction signature if successful */
  signature?: string
  /** Error message if failed */
  error?: string
}

/**
 * Solana transaction status
 */
export type SolanaTransactionStatus = 'pending' | 'confirmed' | 'failed'

/**
 * Solana transaction status response
 */
export interface SolanaStatusResponse {
  /** Current status */
  status: SolanaTransactionStatus
  /** Transaction signature */
  signature: string
  /** Slot number if confirmed */
  slot?: number
  /** Block time (unix timestamp) if confirmed */
  blockTime?: number
  /** Transaction fee in lamports if confirmed */
  fee?: number
  /** Error message if failed */
  error?: string
}

/**
 * Relayer client options
 */
export interface RelayerClientOptions {
  /** Relayer API base URL */
  baseUrl: string
  /** Request timeout in ms, bounds time to response headers (default: 120000) */
  timeout?: number
  /** Custom fetch implementation (for Node.js or testing) */
  fetch?: typeof fetch
}

/**
 * Error thrown when a relayer API request fails
 *
 * Carries the full error context from the relayer: the HTTP status, the
 * request path, the structured failure fields (`phase`, `intentIndex`) when
 * the relayer reports them, the parsed response body when it is JSON, and
 * the raw response text always.
 */
export class RelayerError extends Error {
  readonly name = 'RelayerError'
  /** HTTP status code of the response */
  readonly status: number
  /** Request path (e.g. '/relay-batch') */
  readonly path: string
  /** Pipeline phase reported by the relayer, if any */
  readonly phase?: string
  /** Index of the failing intent in a batch, if reported */
  readonly intentIndex?: number
  /** Parsed JSON response body, when parseable */
  readonly body?: unknown
  /** Raw response text, always */
  readonly raw: string

  constructor(
    message: string,
    details: {
      status: number
      path: string
      phase?: string
      intentIndex?: number
      body?: unknown
      raw: string
    }
  ) {
    super(message)
    this.status = details.status
    this.path = details.path
    this.phase = details.phase
    this.intentIndex = details.intentIndex
    this.body = details.body
    this.raw = details.raw
  }
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
  private fetchImpl: typeof fetch

  constructor(options: RelayerClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.timeout = options.timeout ?? 120000
    // Bind fetch to globalThis to avoid "Illegal invocation" in browsers
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
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
   * Relay a batch of signed intents for atomic execution via smartExecuteBatch
   *
   * @param chainId - Chain ID
   * @param accountAddress - Account address
   * @param signedIntents - Array of signed execution intents
   * @param paymentMode - Payment mode
   * @param authorization - Optional EIP-7702 authorization for gasless onboarding
   * @returns Relay response with single txHash for the batch
   */
  async relayBatch(
    chainId: number,
    accountAddress: Address,
    signedIntents: SignedIntent[],
    paymentMode: PaymentMode,
    authorization?: Authorization7702
  ): Promise<RelayResponse> {
    const body: any = {
      chainId,
      accountAddress,
      intents: signedIntents.map(si => ({
        nonce: si.intent.nonce.toString(),
        deadline: si.intent.deadline.toString(),
        target: si.intent.target,
        value: si.intent.value.toString(),
        data: si.intent.data,
      })),
      ownerSignatures: signedIntents.map(si => si.signature),
      paymentMode,
    }

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

    const response = await this.fetch('/relay-batch', {
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

  // ==========================================================================
  // Solana Relay Methods
  // ==========================================================================

  /**
   * Get Solana relayer info (relayer public key + network)
   *
   * @returns Solana relayer info
   */
  async getSolanaInfo(): Promise<SolanaRelayInfo> {
    const response = await this.fetch('/solana/info')
    return response
  }

  /**
   * Estimate Solana relay fees
   *
   * @param transaction - Optional base64-encoded serialized transaction
   * @param versioned - Whether this is a versioned (v0) transaction (default: false)
   * @returns Fee estimate with relayer public key
   */
  async estimateSolana(
    transaction?: string,
    versioned?: boolean
  ): Promise<SolanaEstimateResponse> {
    const response = await this.fetch('/solana/estimate', {
      method: 'POST',
      body: JSON.stringify({ transaction, versioned }),
    })
    return response
  }

  /**
   * Relay a user-signed Solana transaction
   *
   * @param transaction - Base64-encoded serialized transaction (user-signed, relayer as feePayer)
   * @param versioned - Whether this is a versioned (v0) transaction (default: false)
   * @returns Relay response with transaction signature
   *
   * @example
   * ```typescript
   * // 1. Get relayer info to use as feePayer
   * const info = await relayer.getSolanaInfo()
   *
   * // 2. Build transaction with relayer as feePayer
   * // 3. User partially signs the transaction
   * // 4. Serialize and relay
   * const result = await relayer.relaySolana(base64Transaction)
   * console.log('Signature:', result.signature)
   * ```
   */
  async relaySolana(
    transaction: string,
    versioned?: boolean
  ): Promise<SolanaRelayResponse> {
    const response = await this.fetch('/solana/relay', {
      method: 'POST',
      body: JSON.stringify({ transaction, versioned }),
    })
    return response
  }

  /**
   * Get Solana transaction status by signature
   *
   * @param signature - Transaction signature to check
   * @returns Transaction status
   */
  async getSolanaStatus(signature: string): Promise<SolanaStatusResponse> {
    const response = await this.fetch(`/solana/status/${signature}`)
    return response
  }

  /**
   * Make a fetch request to the relayer API
   */
  private async fetch(path: string, options?: RequestInit): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        signal: controller.signal,
      })
    } finally {
      // Disarm the abort timer as soon as headers arrive (or the request
      // fails) so it cannot tear down the body stream mid-read
      clearTimeout(timeoutId)
    }

    const raw = await response.text()
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      data = undefined
    }

    if (!response.ok) {
      const body = data as
        | { error?: unknown; phase?: unknown; intentIndex?: unknown }
        | undefined
      throw new RelayerError(
        typeof body?.error === 'string' && body.error
          ? body.error
          : `Request failed: ${response.status}`,
        {
          status: response.status,
          path,
          phase: typeof body?.phase === 'string' ? body.phase : undefined,
          intentIndex:
            typeof body?.intentIndex === 'number' ? body.intentIndex : undefined,
          body: data,
          raw,
        }
      )
    }

    if (data === undefined) {
      throw new RelayerError(`Invalid JSON response: ${response.status}`, {
        status: response.status,
        path,
        raw,
      })
    }

    return data
  }
}

/**
 * Create a relayer client
 *
 * @param baseUrl - Relayer API base URL
 * @param options - Optional client options (timeout, custom fetch)
 * @returns Relayer client instance
 */
export function createRelayerClient(
  baseUrl: string,
  options?: Omit<RelayerClientOptions, 'baseUrl'>
): RelayerClient {
  return new RelayerClient({ baseUrl, ...options })
}
