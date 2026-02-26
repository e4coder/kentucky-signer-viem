import type {
  AuthSession,
  PasskeyAuthOptions,
  PasskeyCredential,
  PasskeyRegistrationOptions,
  TokenStorage,
  PasswordAuthOptions,
  PasswordAccountCreationOptions,
  AccountCreationResponse,
} from './types'
import { KentuckySignerClient, KentuckySignerError } from './client'
import type { SecureKentuckySignerClient } from './secure-client'
import { base64UrlEncode, base64UrlDecode } from './utils'
import type { Address } from 'viem'

/**
 * Check if WebAuthn is available in the current environment
 */
export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials !== 'undefined'
  )
}

/**
 * In-memory token storage (default implementation)
 */
export class MemoryTokenStorage implements TokenStorage {
  private token: string | null = null
  private expiresAt: number = 0

  async getToken(): Promise<string | null> {
    if (this.token && Date.now() < this.expiresAt) {
      return this.token
    }
    return null
  }

  async setToken(token: string, expiresAt: number): Promise<void> {
    this.token = token
    this.expiresAt = expiresAt
  }

  async clearToken(): Promise<void> {
    this.token = null
    this.expiresAt = 0
  }
}

/**
 * Browser localStorage token storage
 */
export class LocalStorageTokenStorage implements TokenStorage {
  private keyPrefix: string

  constructor(keyPrefix: string = 'kentucky_signer') {
    this.keyPrefix = keyPrefix
  }

  async getToken(): Promise<string | null> {
    if (typeof localStorage === 'undefined') return null

    const token = localStorage.getItem(`${this.keyPrefix}_token`)
    const expiresAt = localStorage.getItem(`${this.keyPrefix}_expires`)

    if (token && expiresAt && Date.now() < parseInt(expiresAt, 10)) {
      return token
    }

    // Clear expired token
    await this.clearToken()
    return null
  }

  async setToken(token: string, expiresAt: number): Promise<void> {
    if (typeof localStorage === 'undefined') return

    localStorage.setItem(`${this.keyPrefix}_token`, token)
    localStorage.setItem(`${this.keyPrefix}_expires`, expiresAt.toString())
  }

  async clearToken(): Promise<void> {
    if (typeof localStorage === 'undefined') return

    localStorage.removeItem(`${this.keyPrefix}_token`)
    localStorage.removeItem(`${this.keyPrefix}_expires`)
  }
}

/**
 * Convert a PublicKeyCredential to our PasskeyCredential format
 */
function credentialToPasskey(credential: PublicKeyCredential): PasskeyCredential {
  const response = credential.response as AuthenticatorAssertionResponse

  return {
    credentialId: base64UrlEncode(new Uint8Array(credential.rawId)),
    clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
    authenticatorData: base64UrlEncode(new Uint8Array(response.authenticatorData)),
    signature: base64UrlEncode(new Uint8Array(response.signature)),
    userHandle: response.userHandle
      ? base64UrlEncode(new Uint8Array(response.userHandle))
      : undefined,
  }
}

/**
 * Authenticate with a passkey (browser only)
 *
 * This function handles the full WebAuthn authentication flow:
 * 1. Request a challenge from the Kentucky Signer
 * 2. Prompt the user to authenticate with their passkey
 * 3. Send the credential to the Kentucky Signer
 * 4. Return an authenticated session
 *
 * @param options - Passkey authentication options
 * @returns Authenticated session
 */
export async function authenticateWithPasskey(
  options: PasskeyAuthOptions
): Promise<AuthSession> {
  if (!isWebAuthnAvailable()) {
    throw new KentuckySignerError(
      'WebAuthn is not available in this environment',
      'WEBAUTHN_NOT_AVAILABLE',
      'Use authenticateWithToken() for server-side authentication'
    )
  }

  const client = new KentuckySignerClient({ baseUrl: options.baseUrl })

  // Step 1: Get challenge
  const challengeResponse = await client.getChallenge(options.accountId)
  const challengeBytes = base64UrlDecode(challengeResponse.challenge)

  // Step 2: Build credential request options
  const credentialRequestOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: challengeBytes.buffer as ArrayBuffer,
      timeout: 60000,
      rpId: options.rpId ?? window.location.hostname,
      userVerification: 'preferred',
      allowCredentials: options.allowCredentials?.map((id) => ({
        type: 'public-key' as const,
        id: base64UrlDecode(id).buffer as ArrayBuffer,
      })),
    },
  }

  // Step 3: Request credential from user
  const credential = (await navigator.credentials.get(
    credentialRequestOptions
  )) as PublicKeyCredential | null

  if (!credential) {
    throw new KentuckySignerError(
      'User cancelled passkey authentication',
      'USER_CANCELLED'
    )
  }

  // Step 4: Authenticate with Kentucky Signer
  const passkeyCredential = credentialToPasskey(credential)
  const authResponse = await client.authenticatePasskey(
    options.accountId,
    passkeyCredential,
    options.ephemeralPublicKey
  )

  // Step 5: Get account info to retrieve addresses
  const accountInfo = await client.getAccountInfo(
    options.accountId,
    authResponse.token
  )

  // Step 6: Build and return session
  const expiresAt = Date.now() + authResponse.expires_in * 1000

  return {
    token: authResponse.token,
    accountId: options.accountId,
    evmAddress: accountInfo.addresses.evm as Address,
    btcAddress: accountInfo.addresses.bitcoin,
    solAddress: accountInfo.addresses.solana,
    tronAddress: accountInfo.addresses.tron,
    expiresAt,
  }
}

/**
 * Create an authenticated session from an existing JWT token (Node.js compatible)
 *
 * Use this for server-side applications where you already have a JWT token.
 *
 * @param baseUrl - Kentucky Signer API URL
 * @param accountId - Account ID
 * @param token - JWT token
 * @param expiresAt - Token expiration timestamp (Unix ms), optional
 * @returns Authenticated session
 */
export async function authenticateWithToken(
  baseUrl: string,
  accountId: string,
  token: string,
  expiresAt?: number
): Promise<AuthSession> {
  const client = new KentuckySignerClient({ baseUrl })

  // Get account info to retrieve addresses
  const accountInfo = await client.getAccountInfo(accountId, token)

  return {
    token,
    accountId,
    evmAddress: accountInfo.addresses.evm as Address,
    btcAddress: accountInfo.addresses.bitcoin,
    solAddress: accountInfo.addresses.solana,
    tronAddress: accountInfo.addresses.tron,
    expiresAt: expiresAt ?? Date.now() + 3600000, // Default 1 hour if not specified
  }
}

/**
 * Register a new passkey for account creation (browser only)
 *
 * @param options - Registration options
 * @returns Registration credential with public key and attestation object
 */
export async function registerPasskey(
  options: PasskeyRegistrationOptions
): Promise<PasskeyCredential & { publicKey: string; attestationObject: string }> {
  if (!isWebAuthnAvailable()) {
    throw new KentuckySignerError(
      'WebAuthn is not available in this environment',
      'WEBAUTHN_NOT_AVAILABLE'
    )
  }

  // Generate a random user ID
  const userId = new Uint8Array(32)
  crypto.getRandomValues(userId)

  // Generate a random challenge
  const challenge = new Uint8Array(32)
  crypto.getRandomValues(challenge)

  const createOptions: CredentialCreationOptions = {
    publicKey: {
      challenge,
      rp: {
        name: options.rpName ?? 'Kentucky Signer',
        id: options.rpId ?? window.location.hostname,
      },
      user: {
        id: userId,
        name: options.username ?? 'user@example.com',
        displayName: options.username ?? 'User',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256 (P-256)
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  }

  const credential = (await navigator.credentials.create(
    createOptions
  )) as PublicKeyCredential | null

  if (!credential) {
    throw new KentuckySignerError(
      'User cancelled passkey registration',
      'USER_CANCELLED'
    )
  }

  const response = credential.response as AuthenticatorAttestationResponse

  // Extract public key from attestation object
  const publicKeyBytes = response.getPublicKey?.()
  if (!publicKeyBytes) {
    throw new KentuckySignerError(
      'Failed to get public key from credential',
      'PUBLIC_KEY_ERROR'
    )
  }

  return {
    credentialId: base64UrlEncode(new Uint8Array(credential.rawId)),
    clientDataJSON: base64UrlEncode(new Uint8Array(response.clientDataJSON)),
    authenticatorData: base64UrlEncode(new Uint8Array(response.getAuthenticatorData())),
    attestationObject: base64UrlEncode(new Uint8Array(response.attestationObject)),
    signature: '', // Not applicable for registration
    publicKey: base64UrlEncode(new Uint8Array(publicKeyBytes)),
  }
}

/**
 * Check if a session is still valid
 *
 * @param session - Session to check
 * @param bufferMs - Buffer time before expiration (default 60 seconds)
 * @returns True if session is valid
 */
export function isSessionValid(session: AuthSession, bufferMs: number = 60000): boolean {
  return Date.now() + bufferMs < session.expiresAt
}

/**
 * Refresh a session if needed
 *
 * @param session - Current session
 * @param baseUrl - Kentucky Signer API URL
 * @param bufferMs - Buffer time before expiration (default 60 seconds)
 * @param secureClient - Optional secure client for ephemeral key rotation in secure mode
 * @returns Updated session (or original if still valid)
 */
export async function refreshSessionIfNeeded(
  session: AuthSession,
  baseUrl: string,
  bufferMs: number = 60000,
  secureClient?: SecureKentuckySignerClient
): Promise<AuthSession> {
  if (isSessionValid(session, bufferMs)) {
    return session
  }

  let authResponse
  if (secureClient) {
    // Use secure client which rotates ephemeral key
    authResponse = await secureClient.refreshToken(session.token)
  } else {
    // Standard client for non-secure mode
    const client = new KentuckySignerClient({ baseUrl })
    authResponse = await client.refreshToken(session.token)
  }

  return {
    ...session,
    token: authResponse.token,
    expiresAt: Date.now() + authResponse.expires_in * 1000,
  }
}

/**
 * Authenticate with password (works in browser and Node.js)
 *
 * @param options - Password authentication options
 * @returns Authenticated session
 *
 * @example
 * ```typescript
 * const session = await authenticateWithPassword({
 *   baseUrl: 'https://signer.example.com',
 *   accountId: '0123456789abcdef...',
 *   password: 'your-secure-password',
 * })
 * ```
 */
export async function authenticateWithPassword(
  options: PasswordAuthOptions
): Promise<AuthSession> {
  const client = new KentuckySignerClient({ baseUrl: options.baseUrl })

  // Build auth request with optional ephemeral key
  const authRequest: { account_id: string; password: string; ephemeral_public_key?: string } = {
    account_id: options.accountId,
    password: options.password,
  }

  // Add ephemeral public key if provided (for secure mode binding)
  if (options.ephemeralPublicKey) {
    authRequest.ephemeral_public_key = options.ephemeralPublicKey
  }

  // Authenticate with password
  const authResponse = await client.authenticatePassword(authRequest)

  // Get account info to retrieve addresses
  const accountInfo = await client.getAccountInfo(
    options.accountId,
    authResponse.token
  )

  // Build and return session
  const expiresAt = Date.now() + authResponse.expires_in * 1000

  return {
    token: authResponse.token,
    accountId: options.accountId,
    evmAddress: accountInfo.addresses.evm as Address,
    btcAddress: accountInfo.addresses.bitcoin,
    solAddress: accountInfo.addresses.solana,
    tronAddress: accountInfo.addresses.tron,
    expiresAt,
  }
}

/**
 * Create a new account with password authentication (works in browser and Node.js)
 *
 * @param options - Account creation options with password
 * @returns Account creation response with account ID and addresses
 *
 * @example
 * ```typescript
 * const account = await createAccountWithPassword({
 *   baseUrl: 'https://signer.example.com',
 *   password: 'your-secure-password',
 *   confirmation: 'your-secure-password',
 * })
 * console.log('Account ID:', account.account_id)
 * console.log('EVM Address:', account.addresses.evm)
 * ```
 */
export async function createAccountWithPassword(
  options: PasswordAccountCreationOptions
): Promise<AccountCreationResponse> {
  // Validate password matches confirmation
  if (options.password !== options.confirmation) {
    throw new KentuckySignerError(
      'Password and confirmation do not match',
      'PASSWORD_MISMATCH'
    )
  }

  // Validate password length
  if (options.password.length < 8 || options.password.length > 128) {
    throw new KentuckySignerError(
      'Password must be 8-128 characters',
      'INVALID_PASSWORD'
    )
  }

  const client = new KentuckySignerClient({ baseUrl: options.baseUrl })

  return client.createAccountWithPassword({
    password: options.password,
    confirmation: options.confirmation,
  })
}
