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
  /** TRON address derived from the account */
  tronAddress?: string
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
    tron: string
  }
  passkeys: Array<{
    credential_id: string
    created_at: number
  }>
}

/**
 * EVM signature response from Kentucky Signer
 *
 * Note: v is always 27 or 28 (standard format).
 * EIP-155 encoding should be applied by the caller when needed for legacy transactions.
 */
export interface EvmSignatureResponse {
  success: boolean
  signature: {
    r: Hex
    s: Hex
    /** v value: 27 or 28 (recovery_id + 27) */
    v: number
    full: Hex
  }
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
  /** Optional ephemeral public key for secure mode binding (base64url encoded) */
  ephemeralPublicKey?: string
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
    tron: string
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
  /** Optional ephemeral public key for secure mode binding (base64url encoded) */
  ephemeralPublicKey?: string
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

/**
 * Add password request
 */
export interface AddPasswordRequest {
  /** Password for the account (8-128 characters) */
  password: string
  /** Password confirmation (must match password) */
  confirmation: string
}

/**
 * Add password response
 */
export interface AddPasswordResponse {
  success: boolean
  message: string
}

/**
 * Add passkey request (using attestation object - simpler)
 */
export interface AddPasskeyRequest {
  /** WebAuthn attestation object (base64url) - server extracts COSE key automatically */
  attestation_object: string
  /** User-friendly label for the passkey */
  label?: string
}

/**
 * Add passkey response
 */
export interface AddPasskeyResponse {
  success: boolean
  message: string
  label: string
}

/**
 * Remove passkey response
 */
export interface RemovePasskeyResponse {
  success: boolean
  message: string
  passkey_index: number
}

/**
 * Extended authentication response with ephemeral key binding
 */
export interface AuthResponseWithEphemeral extends AuthResponse {
  /** Whether ephemeral key was bound to the token */
  ephemeral_bound: boolean
}

/**
 * Auth configuration from account info
 */
export interface AuthConfig {
  passkey: boolean
  password: boolean
  pin_4: boolean
  pin_6: boolean
  totp: boolean
}

/**
 * Extended account info response with auth config
 */
export interface AccountInfoExtendedResponse {
  success: boolean
  account_id: string
  addresses: {
    evm: string
    bitcoin: string
    solana: string
    tron: string
  }
  auth_config: AuthConfig
  passkey_count: number
  guardian_count?: number
  recovery_active?: boolean
}

// ============================================================================
// Guardian Management Types
// ============================================================================

/**
 * Guardian info
 */
export interface GuardianInfo {
  index: number
  label: string
}

/**
 * Add guardian request
 */
export interface AddGuardianRequest {
  /** WebAuthn attestation object (base64url) */
  attestation_object: string
  /** User-friendly label for the guardian */
  label?: string
}

/**
 * Add guardian response
 */
export interface AddGuardianResponse {
  success: boolean
  guardian_index: number
  guardian_count: number
}

/**
 * Remove guardian response
 */
export interface RemoveGuardianResponse {
  success: boolean
  guardian_count: number
}

/**
 * Get guardians response
 */
export interface GetGuardiansResponse {
  success: boolean
  guardian_count: number
  guardians: GuardianInfo[]
}

// ============================================================================
// Account Recovery Types
// ============================================================================

/**
 * Initiate recovery request
 */
export interface InitiateRecoveryRequest {
  /** Account ID to recover */
  account_id: string
  /** WebAuthn attestation object for new owner passkey (base64url) */
  attestation_object: string
  /** Label for new owner passkey */
  label?: string
}

/**
 * Initiate recovery response
 */
export interface InitiateRecoveryResponse {
  success: boolean
  /** Challenges for each guardian to sign (base64url) */
  challenges: string[]
  /** Number of guardians registered */
  guardian_count: number
  /** Number of guardian signatures required */
  threshold: number
  /** Seconds to wait after threshold reached before completion */
  timelock_seconds: number
}

/**
 * Verify guardian signature request
 */
export interface VerifyGuardianRequest {
  /** Account ID being recovered */
  account_id: string
  /** Index of guardian (1-3) */
  guardian_index: number
  /** WebAuthn authenticator data (base64url) */
  authenticator_data: string
  /** WebAuthn client data JSON (base64url) */
  client_data_json: string
  /** WebAuthn signature (base64url) */
  signature: string
}

/**
 * Verify guardian response
 */
export interface VerifyGuardianResponse {
  success: boolean
  /** Number of guardians who have verified */
  verified_count: number
  /** Number of guardians required */
  threshold: number
}

/**
 * Recovery status request
 */
export interface RecoveryStatusRequest {
  /** Account ID to check */
  account_id: string
}

/**
 * Recovery status response
 */
export interface RecoveryStatusResponse {
  success: boolean
  /** Whether recovery is in progress */
  recovery_active: boolean
  /** Number of guardians who have verified */
  verified_count: number
  /** Number of guardians required */
  threshold: number
  /** Whether recovery can be completed now */
  can_complete: boolean
  /** Seconds remaining until timelock expires (0 if expired) */
  timelock_remaining: number
  /** Number of guardians on this account */
  guardian_count: number
  /** Challenge for each guardian to sign (base64url encoded) */
  guardian_challenges: string[]
  /** Indices of guardians who have verified */
  verified_guardians: number[]
}

/**
 * Complete recovery request
 */
export interface CompleteRecoveryRequest {
  /** Account ID to complete recovery for */
  account_id: string
}

/**
 * Complete recovery response
 */
export interface CompleteRecoveryResponse {
  success: boolean
  message: string
}

/**
 * Cancel recovery response
 */
export interface CancelRecoveryResponse {
  success: boolean
  message: string
}

// ============================================================================
// Two-Factor Authentication (2FA)
// ============================================================================

/**
 * 2FA status response
 */
export interface TwoFactorStatusResponse {
  success: boolean
  /** Whether TOTP is enabled */
  totp_enabled: boolean
  /** Whether PIN is enabled */
  pin_enabled: boolean
  /** PIN length if enabled (4 or 6), 0 if not enabled */
  pin_length: number
}

/**
 * TOTP setup response
 */
export interface TotpSetupResponse {
  success: boolean
  /** otpauth:// URI for QR code generation */
  uri: string
  /** Base32 encoded secret for manual entry */
  secret: string
  /** Instructions for the user */
  message: string
}

/**
 * TOTP enable request
 */
export interface TotpEnableRequest {
  /** 6-digit TOTP code from authenticator app */
  code: string
}

/**
 * Generic 2FA response
 */
export interface TwoFactorResponse {
  success: boolean
  message: string
}

/**
 * TOTP/PIN verify response
 */
export interface TwoFactorVerifyResponse {
  success: boolean
  /** Whether the code/pin was valid */
  valid: boolean
  /** Optional message if invalid */
  message?: string
}

/**
 * PIN setup request
 */
export interface PinSetupRequest {
  /** PIN (4 or 6 digits) */
  pin: string
}

/**
 * PIN setup response
 */
export interface PinSetupResponse {
  success: boolean
  message: string
  /** Length of the PIN that was set */
  pin_length: number
}

/**
 * Sign request with optional 2FA codes
 */
export interface SignEvmRequestWith2FA extends SignEvmRequest {
  /** TOTP code (required if TOTP is enabled) */
  totp_code?: string
  /** PIN (required if PIN is enabled) */
  pin?: string
}

// ============================================================================
// Bitcoin Signing Types
// ============================================================================

/**
 * Sign Bitcoin transaction request
 */
export interface SignBitcoinRequest {
  /** Transaction sighash to sign (32 bytes, hex encoded) */
  sighash: string
  /** Sighash type: 1=ALL, 2=NONE, 3=SINGLE */
  sighash_type: number
}

/**
 * Sign Bitcoin request with optional 2FA codes
 */
export interface SignBitcoinRequestWith2FA extends SignBitcoinRequest {
  /** TOTP code (required if TOTP is enabled) */
  totp_code?: string
  /** PIN (required if PIN is enabled) */
  pin?: string
}

/**
 * Bitcoin signature response from Kentucky Signer
 */
export interface BitcoinSignatureResponse {
  success: boolean
  signature: {
    /** DER-encoded signature (hex) */
    der: string
    /** Signature byte length */
    length: number
  }
  /** Echoed sighash type */
  sighash_type: number
}

// ============================================================================
// Solana Signing Types
// ============================================================================

/**
 * Sign Solana transaction request
 */
export interface SignSolanaRequest {
  /** Base64url-encoded transaction message to sign */
  message: string
}

/**
 * Sign Solana request with optional 2FA codes
 */
export interface SignSolanaRequestWith2FA extends SignSolanaRequest {
  /** TOTP code (required if TOTP is enabled) */
  totp_code?: string
  /** PIN (required if PIN is enabled) */
  pin?: string
}

/**
 * Solana signature response from Kentucky Signer
 */
export interface SolanaSignatureResponse {
  success: boolean
  /** Base64-encoded Ed25519 signature (64 bytes) */
  signature: string
}

// ============================================================================
// TRON Signing Types
// ============================================================================

/**
 * Sign TRON transaction request
 */
export interface SignTronRequest {
  /** Transaction hash to sign (32 bytes, hex encoded) */
  tx_hash: string
}

/**
 * Sign TRON request with optional 2FA codes
 */
export interface SignTronRequestWith2FA extends SignTronRequest {
  /** TOTP code (required if TOTP is enabled) */
  totp_code?: string
  /** PIN (required if PIN is enabled) */
  pin?: string
}

/**
 * TRON signature response from Kentucky Signer
 */
export interface TronSignatureResponse {
  success: boolean
  signature: {
    /** R component (hex) */
    r: string
    /** S component (hex) */
    s: string
    /** Recovery ID */
    v: number
    /** Full 65-byte signature (hex) */
    full: string
  }
  signer_address: string
}
