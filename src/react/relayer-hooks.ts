import { useState, useCallback, useEffect, useRef } from 'react'
import type { Address, Hex } from 'viem'
import type {
  RelayerClient,
  PaymentMode,
  EstimateResponse,
  RelayResponse,
  StatusResponse,
  TransactionStatus,
  Authorization7702,
  SolanaRelayInfo,
  SolanaEstimateResponse,
  SolanaRelayResponse,
  SolanaStatusResponse,
  SolanaTransactionStatus,
} from '../relayer-client'
import type { ExecutionIntent, SignedIntent } from '../intent'

/**
 * Hook for relaying intents through the relayer
 */
export interface UseRelayIntentResult {
  /** Relay a signed intent */
  relay: (
    chainId: number,
    accountAddress: Address,
    signedIntent: SignedIntent,
    paymentMode: PaymentMode,
    authorization?: Authorization7702
  ) => Promise<RelayResponse>
  /** Whether a relay is in progress */
  isRelaying: boolean
  /** Last relay response */
  response: RelayResponse | null
  /** Last error */
  error: Error | null
  /** Reset state */
  reset: () => void
}

/**
 * Hook for relaying signed intents through the Kentucky Signer Relayer
 *
 * @param client - Relayer client instance
 * @returns Relay functions and state
 *
 * @example
 * ```tsx
 * const relayer = useRelayerClient('https://relayer.example.com')
 * const { relay, isRelaying, response, error } = useRelayIntent(relayer)
 *
 * const handleSubmit = async () => {
 *   const result = await relay(42161, accountAddress, signedIntent, 'sponsored')
 *   if (result.success) {
 *     console.log('TX:', result.txHash)
 *   }
 * }
 * ```
 */
export function useRelayIntent(client: RelayerClient): UseRelayIntentResult {
  const [isRelaying, setIsRelaying] = useState(false)
  const [response, setResponse] = useState<RelayResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const relay = useCallback(
    async (
      chainId: number,
      accountAddress: Address,
      signedIntent: SignedIntent,
      paymentMode: PaymentMode,
      authorization?: Authorization7702
    ): Promise<RelayResponse> => {
      setIsRelaying(true)
      setError(null)

      try {
        const result = await client.relay(chainId, accountAddress, signedIntent, paymentMode, authorization)
        setResponse(result)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Relay failed')
        setError(error)
        return { success: false, error: error.message }
      } finally {
        setIsRelaying(false)
      }
    },
    [client]
  )

  const reset = useCallback(() => {
    setResponse(null)
    setError(null)
  }, [])

  return { relay, isRelaying, response, error, reset }
}

/**
 * Hook for tracking transaction status
 */
export interface UseTransactionStatusResult {
  /** Current transaction status */
  status: TransactionStatus | null
  /** Full status response */
  statusResponse: StatusResponse | null
  /** Whether status is being fetched */
  isLoading: boolean
  /** Last error */
  error: Error | null
  /** Manually refresh status */
  refresh: () => void
}

/**
 * Hook for tracking transaction status with polling
 *
 * @param client - Relayer client instance
 * @param chainId - Chain ID
 * @param txHash - Transaction hash to track (null to disable)
 * @param pollInterval - Polling interval in ms (default: 3000)
 * @returns Transaction status and state
 *
 * @example
 * ```tsx
 * const { status, statusResponse, isLoading } = useTransactionStatus(
 *   relayer,
 *   42161,
 *   txHash
 * )
 *
 * if (status === 'confirmed') {
 *   console.log('Transaction confirmed in block:', statusResponse?.blockNumber)
 * }
 * ```
 */
export function useTransactionStatus(
  client: RelayerClient,
  chainId: number,
  txHash: Hex | null,
  pollInterval: number = 3000
): UseTransactionStatusResult {
  const [status, setStatus] = useState<TransactionStatus | null>(null)
  const [statusResponse, setStatusResponse] = useState<StatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!txHash) return

    setIsLoading(true)
    try {
      const response = await client.getStatus(chainId, txHash)
      setStatusResponse(response)
      setStatus(response.status)
      setError(null)

      // Stop polling if transaction is finalized
      if (response.status === 'confirmed' || response.status === 'failed') {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch status'))
    } finally {
      setIsLoading(false)
    }
  }, [client, chainId, txHash])

  // Start polling when txHash is set
  useEffect(() => {
    if (!txHash) {
      setStatus(null)
      setStatusResponse(null)
      return
    }

    // Fetch immediately
    fetchStatus()

    // Start polling
    intervalRef.current = setInterval(fetchStatus, pollInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [txHash, pollInterval, fetchStatus])

  return { status, statusResponse, isLoading, error, refresh: fetchStatus }
}

/**
 * Hook for estimating gas and fees
 */
export interface UseEstimateResult {
  /** Estimate gas and fees */
  estimate: (
    chainId: number,
    accountAddress: Address,
    intent: ExecutionIntent
  ) => Promise<EstimateResponse | null>
  /** Last estimate response */
  estimateResponse: EstimateResponse | null
  /** Whether estimate is in progress */
  isEstimating: boolean
  /** Last error */
  error: Error | null
}

/**
 * Hook for estimating gas and token fees
 *
 * @param client - Relayer client instance
 * @returns Estimate functions and state
 *
 * @example
 * ```tsx
 * const { estimate, estimateResponse, isEstimating } = useEstimate(relayer)
 *
 * useEffect(() => {
 *   estimate(42161, accountAddress, intent)
 * }, [intent])
 *
 * if (estimateResponse) {
 *   console.log('Gas:', estimateResponse.gasEstimate)
 *   console.log('Tokens:', estimateResponse.tokenOptions)
 * }
 * ```
 */
export function useEstimate(client: RelayerClient): UseEstimateResult {
  const [estimateResponse, setEstimateResponse] = useState<EstimateResponse | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const estimate = useCallback(
    async (
      chainId: number,
      accountAddress: Address,
      intent: ExecutionIntent
    ): Promise<EstimateResponse | null> => {
      setIsEstimating(true)
      setError(null)

      try {
        const response = await client.estimate(chainId, accountAddress, intent)
        setEstimateResponse(response)
        return response
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Estimate failed')
        setError(error)
        return null
      } finally {
        setIsEstimating(false)
      }
    },
    [client]
  )

  return { estimate, estimateResponse, isEstimating, error }
}

/**
 * Hook for fetching account nonce
 */
export interface UseNonceResult {
  /** Current nonce */
  nonce: bigint | null
  /** Whether nonce is being fetched */
  isLoading: boolean
  /** Last error */
  error: Error | null
  /** Refresh nonce */
  refresh: () => void
}

/**
 * Hook for fetching account nonce
 *
 * @param client - Relayer client instance
 * @param chainId - Chain ID
 * @param address - Account address (null to disable)
 * @returns Nonce and state
 */
export function useNonce(
  client: RelayerClient,
  chainId: number,
  address: Address | null
): UseNonceResult {
  const [nonce, setNonce] = useState<bigint | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchNonce = useCallback(async () => {
    if (!address) return

    setIsLoading(true)
    try {
      const result = await client.getNonce(chainId, address)
      setNonce(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch nonce'))
    } finally {
      setIsLoading(false)
    }
  }, [client, chainId, address])

  useEffect(() => {
    if (address) {
      fetchNonce()
    } else {
      setNonce(null)
    }
  }, [address, fetchNonce])

  return { nonce, isLoading, error, refresh: fetchNonce }
}

// ============================================================================
// Solana Relay Hooks
// ============================================================================

/**
 * Hook for getting Solana relayer info
 */
export interface UseSolanaRelayInfoResult {
  /** Solana relayer info */
  info: SolanaRelayInfo | null
  /** Whether info is being fetched */
  isLoading: boolean
  /** Last error */
  error: Error | null
  /** Refresh info */
  refresh: () => void
}

/**
 * Hook for getting Solana relayer info (auto-fetches on mount)
 *
 * @param client - Relayer client instance
 * @returns Solana relayer info and state
 *
 * @example
 * ```tsx
 * const { info, isLoading } = useSolanaRelayInfo(relayer)
 *
 * if (info) {
 *   console.log('Relayer pubkey:', info.relayerPublicKey)
 *   console.log('Network:', info.network)
 * }
 * ```
 */
export function useSolanaRelayInfo(
  client: RelayerClient
): UseSolanaRelayInfoResult {
  const [info, setInfo] = useState<SolanaRelayInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchInfo = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await client.getSolanaInfo()
      setInfo(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch Solana relay info'))
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchInfo()
  }, [fetchInfo])

  return { info, isLoading, error, refresh: fetchInfo }
}

/**
 * Hook for estimating Solana relay fees
 */
export interface UseSolanaEstimateResult {
  /** Estimate Solana relay fees */
  estimate: (transaction?: string, versioned?: boolean) => Promise<SolanaEstimateResponse | null>
  /** Last estimate response */
  estimateResponse: SolanaEstimateResponse | null
  /** Whether estimate is in progress */
  isEstimating: boolean
  /** Last error */
  error: Error | null
}

/**
 * Hook for estimating Solana relay fees
 *
 * @param client - Relayer client instance
 * @returns Estimate functions and state
 *
 * @example
 * ```tsx
 * const { estimate, estimateResponse, isEstimating } = useSolanaEstimate(relayer)
 *
 * const handleEstimate = async () => {
 *   await estimate(base64Transaction)
 * }
 *
 * if (estimateResponse) {
 *   console.log('Fee:', estimateResponse.feeSol, 'SOL')
 * }
 * ```
 */
export function useSolanaEstimate(
  client: RelayerClient
): UseSolanaEstimateResult {
  const [estimateResponse, setEstimateResponse] = useState<SolanaEstimateResponse | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const estimate = useCallback(
    async (
      transaction?: string,
      versioned?: boolean
    ): Promise<SolanaEstimateResponse | null> => {
      setIsEstimating(true)
      setError(null)

      try {
        const response = await client.estimateSolana(transaction, versioned)
        setEstimateResponse(response)
        return response
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Solana estimate failed')
        setError(error)
        return null
      } finally {
        setIsEstimating(false)
      }
    },
    [client]
  )

  return { estimate, estimateResponse, isEstimating, error }
}

/**
 * Hook for relaying Solana transactions
 */
export interface UseRelaySolanaResult {
  /** Relay a Solana transaction */
  relay: (transaction: string, versioned?: boolean) => Promise<SolanaRelayResponse>
  /** Whether a relay is in progress */
  isRelaying: boolean
  /** Last relay response */
  response: SolanaRelayResponse | null
  /** Last error */
  error: Error | null
  /** Reset state */
  reset: () => void
}

/**
 * Hook for relaying Solana transactions through the Kentucky Signer Relayer
 *
 * @param client - Relayer client instance
 * @returns Relay functions and state
 *
 * @example
 * ```tsx
 * const { relay, isRelaying, response, error } = useRelaySolana(relayer)
 *
 * const handleRelay = async () => {
 *   const result = await relay(base64Transaction)
 *   if (result.success) {
 *     console.log('Signature:', result.signature)
 *   }
 * }
 * ```
 */
export function useRelaySolana(
  client: RelayerClient
): UseRelaySolanaResult {
  const [isRelaying, setIsRelaying] = useState(false)
  const [response, setResponse] = useState<SolanaRelayResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const relay = useCallback(
    async (
      transaction: string,
      versioned?: boolean
    ): Promise<SolanaRelayResponse> => {
      setIsRelaying(true)
      setError(null)

      try {
        const result = await client.relaySolana(transaction, versioned)
        setResponse(result)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Solana relay failed')
        setError(error)
        return { success: false, error: error.message }
      } finally {
        setIsRelaying(false)
      }
    },
    [client]
  )

  const reset = useCallback(() => {
    setResponse(null)
    setError(null)
  }, [])

  return { relay, isRelaying, response, error, reset }
}

/**
 * Hook for tracking Solana transaction status
 */
export interface UseSolanaTransactionStatusResult {
  /** Current transaction status */
  status: SolanaTransactionStatus | null
  /** Full status response */
  statusResponse: SolanaStatusResponse | null
  /** Whether status is being fetched */
  isLoading: boolean
  /** Last error */
  error: Error | null
  /** Manually refresh status */
  refresh: () => void
}

/**
 * Hook for tracking Solana transaction status with polling
 *
 * @param client - Relayer client instance
 * @param signature - Transaction signature to track (null to disable)
 * @param pollInterval - Polling interval in ms (default: 3000)
 * @returns Transaction status and state
 *
 * @example
 * ```tsx
 * const { status, statusResponse, isLoading } = useSolanaTransactionStatus(
 *   relayer,
 *   signature
 * )
 *
 * if (status === 'confirmed') {
 *   console.log('Confirmed in slot:', statusResponse?.slot)
 * }
 * ```
 */
export function useSolanaTransactionStatus(
  client: RelayerClient,
  signature: string | null,
  pollInterval: number = 3000
): UseSolanaTransactionStatusResult {
  const [status, setStatus] = useState<SolanaTransactionStatus | null>(null)
  const [statusResponse, setStatusResponse] = useState<SolanaStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!signature) return

    setIsLoading(true)
    try {
      const response = await client.getSolanaStatus(signature)
      setStatusResponse(response)
      setStatus(response.status)
      setError(null)

      // Stop polling if transaction is finalized
      if (response.status === 'confirmed' || response.status === 'failed') {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch Solana status'))
    } finally {
      setIsLoading(false)
    }
  }, [client, signature])

  // Start polling when signature is set
  useEffect(() => {
    if (!signature) {
      setStatus(null)
      setStatusResponse(null)
      return
    }

    // Fetch immediately
    fetchStatus()

    // Start polling
    intervalRef.current = setInterval(fetchStatus, pollInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [signature, pollInterval, fetchStatus])

  return { status, statusResponse, isLoading, error, refresh: fetchStatus }
}
