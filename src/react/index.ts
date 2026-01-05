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
