/**
 * Kentucky Signer Viem Integration
 *
 * A custom Viem account implementation for signing EVM transactions
 * using the Kentucky Signer service with passkey authentication.
 *
 * @packageDocumentation
 */

// Account
export {
  createKentuckySignerAccount,
  createServerAccount,
  type KentuckySignerAccount,
  type KentuckySignerAccountOptions,
  type TwoFactorCodes,
  type TwoFactorCallback,
  // EIP-7702 types
  type SignAuthorizationParameters,
  type SignedAuthorization,
} from './account'

// EIP-7702 Constants
/** Alchemy's SemiModularAccount7702 implementation address (same across all EVM chains) */
export const ALCHEMY_SEMI_MODULAR_ACCOUNT_7702 = '0x69007702764179f14F51cdce752f4f775d74E139' as const

// Client
export {
  KentuckySignerClient,
  KentuckySignerError,
  createClient,
} from './client'

// Secure Client (with ephemeral key signing)
export {
  SecureKentuckySignerClient,
  createSecureClient,
  type SecureClientOptions,
} from './secure-client'

// Ephemeral Key Management
export {
  generateEphemeralKeyPair,
  signPayload,
  verifyPayload,
  isWebCryptoAvailable,
  EphemeralKeyManager,
  MemoryEphemeralKeyStorage,
  IndexedDBEphemeralKeyStorage,
  type EphemeralKeyPair,
  type SignedPayload,
  type EphemeralKeyStorage,
} from './ephemeral'

// Authentication
export {
  authenticateWithPasskey,
  authenticateWithPassword,
  authenticateWithToken,
  createAccountWithPassword,
  registerPasskey,
  isSessionValid,
  refreshSessionIfNeeded,
  isWebAuthnAvailable,
  MemoryTokenStorage,
  LocalStorageTokenStorage,
} from './auth'

// Types
export type {
  KentuckySignerConfig,
  AuthSession,
  ChallengeResponse,
  AuthResponse,
  AccountInfoResponse,
  AccountInfoExtendedResponse,
  AuthConfig,
  EvmSignatureResponse,
  ApiErrorResponse,
  PasskeyCredential,
  PasskeyAuthOptions,
  PasskeyRegistrationOptions,
  PasswordAuthOptions,
  PasswordAccountCreationOptions,
  TokenStorage,
  ClientOptions,
  SignEvmRequest,
  AccountCreationResponse,
  CreatePasswordAccountRequest,
  PasswordAuthRequest,
  AddPasswordRequest,
  AddPasswordResponse,
  AddPasskeyRequest,
  AddPasskeyResponse,
  RemovePasskeyResponse,
  AuthResponseWithEphemeral,
  // Guardian types
  GuardianInfo,
  AddGuardianRequest,
  AddGuardianResponse,
  RemoveGuardianResponse,
  GetGuardiansResponse,
  // Recovery types
  InitiateRecoveryRequest,
  InitiateRecoveryResponse,
  VerifyGuardianRequest,
  VerifyGuardianResponse,
  RecoveryStatusRequest,
  RecoveryStatusResponse,
  CompleteRecoveryRequest,
  CompleteRecoveryResponse,
  CancelRecoveryResponse,
  // 2FA types
  TwoFactorStatusResponse,
  TotpSetupResponse,
  TotpEnableRequest,
  TwoFactorResponse,
  TwoFactorVerifyResponse,
  PinSetupRequest,
  PinSetupResponse,
  SignEvmRequestWith2FA,
} from './types'

// Utilities
export {
  base64UrlEncode,
  base64UrlDecode,
  hexToBytes,
  bytesToHex,
  isValidAccountId,
  isValidEvmAddress,
  parseJwt,
  getJwtExpiration,
  formatError,
  withRetry,
} from './utils'

// Intent signing for relayer integration
export {
  createExecutionIntent,
  signIntent,
  signBatchIntents,
  hashIntent,
  hashBatchIntents,
  // EIP-712 helpers
  getKentuckyDelegateDomain,
  EXECUTION_INTENT_TYPES,
  type ExecutionIntent,
  type SignedIntent,
  type CreateIntentParams,
} from './intent'

// Relayer client
export {
  RelayerClient,
  createRelayerClient,
  type PaymentMode,
  type TokenOption,
  type EstimateResponse,
  type RelayResponse,
  type TransactionStatus,
  type StatusResponse,
  type RelayerClientOptions,
} from './relayer-client'
