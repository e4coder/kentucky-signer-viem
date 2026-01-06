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
} from '../relayer-client'

// Re-export intent types needed by hooks
export {
  createExecutionIntent,
  signIntent,
  type ExecutionIntent,
  type SignedIntent,
} from '../intent'
