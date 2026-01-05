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
} from './account'

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
