import type { Address, Hex } from 'viem'

/**
 * Configuration for Kentucky Signer client
 */
export interface KentuckySignerConfig {
  /** Base URL of the Kentucky Signer API (e.g., "https://signer.example.com") */
  baseUrl: string
  /** Account ID (64-character hex string) */
  accountId: string
}

/**
 * Authenticated session with Kentucky Signer
 */
export interface AuthSession {
  /** JWT access token */
  token: string
  /** Account ID this session is authenticated for */
  accountId: string
  /** EVM address derived from the account */
  evmAddress: Address
  /** Bitcoin address derived from the account */
  btcAddress?: string
  /** Solana address derived from the account */
  solAddress?: string
  /** Token expiration timestamp (Unix ms) */
  expiresAt: number
}

/**
 * Challenge response from Kentucky Signer
 */
export interface ChallengeResponse {
  success: boolean
  challenge: string
  expires_at: number
}

/**
 * Authentication response from Kentucky Signer
 */
export interface AuthResponse {
  success: boolean
  token: string
  expires_in: number
  account_id: string
}

/**
 * Account info response from Kentucky Signer
 */
export interface AccountInfoResponse {
  success: boolean
  account_id: string
  addresses: {
    evm: string
    bitcoin: string
    solana: string
  }
  passkeys: Array<{
    credential_id: string
    created_at: number
  }>
}

/**
 * EVM signature response from Kentucky Signer
 */
export interface EvmSignatureResponse {
  success: boolean
  signature: {
    r: Hex
    s: Hex
    v: number
    full: Hex
  }
  chain_id: number
  signer_address: string
}

/**
 * Error response from Kentucky Signer API
 */
export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: string
  }
}

/**
 * WebAuthn credential for passkey authentication
 */
export interface PasskeyCredential {
  /** Credential ID (base64url encoded) */
  credentialId: string
  /** Client data JSON (base64url encoded) */
  clientDataJSON: string
  /** Authenticator data (base64url encoded) */
  authenticatorData: string
  /** Signature (base64url encoded) */
  signature: string
  /** User handle (base64url encoded, optional) */
  userHandle?: string
}

/**
 * Options for creating a Kentucky Signer account
 */
export interface CreateAccountOptions {
  /** Kentucky Signer configuration */
  config: KentuckySignerConfig
  /** Authenticated session */
  session: AuthSession
}

/**
 * Options for passkey authentication
 */
export interface PasskeyAuthOptions {
  /** Base URL of the Kentucky Signer API */
  baseUrl: string
  /** Account ID to authenticate */
  accountId: string
  /** Relying Party ID for WebAuthn (defaults to current domain) */
  rpId?: string
  /** Credential IDs to allow (if known) */
  allowCredentials?: string[]
}

/**
 * Token storage interface for custom token persistence
 */
export interface TokenStorage {
  /** Get stored token */
  getToken(): Promise<string | null>
  /** Store token */
  setToken(token: string, expiresAt: number): Promise<void>
  /** Clear stored token */
  clearToken(): Promise<void>
}

/**
 * Kentucky Signer client options
 */
export interface ClientOptions {
  /** Base URL of the Kentucky Signer API */
  baseUrl: string
  /** Custom fetch implementation (for Node.js or testing) */
  fetch?: typeof fetch
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
}

/**
 * Sign EVM transaction request
 */
export interface SignEvmRequest {
  /** Transaction hash to sign (32 bytes, hex encoded) */
  tx_hash: Hex
  /** Chain ID */
  chain_id: number
}

/**
 * Passkey registration options (for account creation)
 */
export interface PasskeyRegistrationOptions {
  /** Base URL of the Kentucky Signer API */
  baseUrl: string
  /** Username for the account */
  username?: string
  /** Relying Party ID for WebAuthn (defaults to current domain) */
  rpId?: string
  /** Relying Party name for WebAuthn */
  rpName?: string
}

/**
 * Account creation response
 */
export interface AccountCreationResponse {
  success: boolean
  account_id: string
  addresses: {
    evm: string
    bitcoin: string
    solana: string
  }
}

/**
 * Options for password authentication
 */
export interface PasswordAuthOptions {
  /** Base URL of the Kentucky Signer API */
  baseUrl: string
  /** Account ID to authenticate */
  accountId: string
  /** Password for authentication */
  password: string
}

/**
 * Options for creating an account with password
 */
export interface PasswordAccountCreationOptions {
  /** Base URL of the Kentucky Signer API */
  baseUrl: string
  /** Password for the account (8-128 characters) */
  password: string
  /** Password confirmation (must match password) */
  confirmation: string
}

/**
 * Password account creation request
 */
export interface CreatePasswordAccountRequest {
  /** Password for the account */
  password: string
  /** Password confirmation */
  confirmation: string
}

/**
 * Password authentication request
 */
export interface PasswordAuthRequest {
  /** Account ID */
  account_id: string
  /** Password */
  password: string
}
