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
