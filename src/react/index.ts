/**
 * Kentucky Signer React Integration
 *
 * React hooks and context for integrating Kentucky Signer authentication
 * and signing into React applications.
 *
 * @packageDocumentation
 */

// Context
export {
  KentuckySignerProvider,
  useKentuckySignerContext,
  type KentuckySignerProviderProps,
  type KentuckySignerState,
  type KentuckySignerActions,
  type KentuckySignerContextValue,
  type TwoFactorPromptState,
} from './context'

// Hooks
export {
  useKentuckySigner,
  useKentuckySignerAccount,
  useWalletClient,
  usePasskeyAuth,
  useSignMessage,
  useSignTypedData,
  useIsReady,
  useAddress,
  // Multi-chain hooks
  useMultiChainAddresses,
  useSignBitcoin,
  useSignSolana,
  useSignTron,
  type UseWalletClientOptions,
} from './hooks'

// Relayer Hooks
export {
  useRelayIntent,
  useTransactionStatus,
  useEstimate,
  useNonce,
  type UseRelayIntentResult,
  type UseTransactionStatusResult,
  type UseEstimateResult,
  type UseNonceResult,
  // Solana Relay Hooks
  useSolanaRelayInfo,
  useSolanaEstimate,
  useRelaySolana,
  useSolanaTransactionStatus,
  type UseSolanaRelayInfoResult,
  type UseSolanaEstimateResult,
  type UseRelaySolanaResult,
  type UseSolanaTransactionStatusResult,
} from './relayer-hooks'

// Re-export relayer types needed by hooks
export {
  RelayerClient,
  createRelayerClient,
  type PaymentMode,
  type TokenOption,
  type EstimateResponse,
  type RelayResponse,
  type TransactionStatus,
  type StatusResponse,
  type Authorization7702,
  // Solana relay types
  type SolanaRelayInfo,
  type SolanaEstimateResponse,
  type SolanaRelayResponse,
  type SolanaTransactionStatus,
  type SolanaStatusResponse,
} from '../relayer-client'

// Re-export intent types needed by hooks
export {
  createExecutionIntent,
  signIntent,
  type ExecutionIntent,
  type SignedIntent,
} from '../intent'
