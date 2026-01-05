import type {
  ClientOptions,
  ChallengeResponse,
  AuthResponse,
  AccountInfoResponse,
  AccountInfoExtendedResponse,
  EvmSignatureResponse,
  ApiErrorResponse,
  PasskeyCredential,
  AccountCreationResponse,
  SignEvmRequest,
  CreatePasswordAccountRequest,
  PasswordAuthRequest,
  AddPasswordRequest,
  AddPasswordResponse,
  AddPasskeyRequest,
  AddPasskeyResponse,
  RemovePasskeyResponse,
} from './types'
import type { Hex } from 'viem'

/**
 * Kentucky Signer API error
 */
export class KentuckySignerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: string
  ) {
    super(message)
    this.name = 'KentuckySignerError'
  }
}

/**
 * Kentucky Signer API client
 *
 * Handles communication with the Kentucky Signer API for authentication,
 * account management, and transaction signing.
 */
export class KentuckySignerClient {
  private baseUrl: string
  private fetchImpl: typeof fetch
  private timeout: number

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '') // Remove trailing slash
    // Bind fetch to globalThis to avoid "Illegal invocation" in browsers
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.timeout = options.timeout ?? 30000
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    path: string,
    options: RequestInit & { token?: string } = {}
  ): Promise<T> {
    const { token, ...fetchOptions } = options

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    if (token) {
      ;(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      })

      const data = await response.json()

      if (!response.ok || data.success === false) {
        const error = data as ApiErrorResponse
        throw new KentuckySignerError(
          error.error?.message ?? 'Unknown error',
          error.error?.code ?? 'UNKNOWN_ERROR',
          error.error?.details
        )
      }

      return data as T
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Get a challenge for passkey authentication
   *
   * @param accountId - Account ID to authenticate
   * @returns Challenge response with 32-byte challenge
   */
  async getChallenge(accountId: string): Promise<ChallengeResponse> {
    return this.request<ChallengeResponse>('/api/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId }),
    })
  }

  /**
   * Authenticate with a passkey credential
   *
   * @param accountId - Account ID to authenticate
   * @param credential - WebAuthn credential from navigator.credentials.get()
   * @param ephemeralPublicKey - Optional ephemeral public key for secure mode binding
   * @returns Authentication response with JWT token
   */
  async authenticatePasskey(
    accountId: string,
    credential: PasskeyCredential,
    ephemeralPublicKey?: string
  ): Promise<AuthResponse> {
    const body: Record<string, string | undefined> = {
      account_id: accountId,
      credential_id: credential.credentialId,
      client_data_json: credential.clientDataJSON,
      authenticator_data: credential.authenticatorData,
      signature: credential.signature,
      user_handle: credential.userHandle,
    }

    if (ephemeralPublicKey) {
      body.ephemeral_public_key = ephemeralPublicKey
    }

    return this.request<AuthResponse>('/api/auth/passkey', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  /**
   * Refresh an authentication token
   *
   * @param token - Current JWT token
   * @returns New authentication response with fresh token
   */
  async refreshToken(token: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/auth/refresh', {
      method: 'POST',
      token,
    })
  }

  /**
   * Logout and invalidate token
   *
   * @param token - JWT token to invalidate
   */
  async logout(token: string): Promise<void> {
    await this.request('/api/auth/logout', {
      method: 'POST',
      token,
    })
  }

  /**
   * Get account information
   *
   * @param accountId - Account ID
   * @param token - JWT token
   * @returns Account info with addresses and passkeys
   */
  async getAccountInfo(accountId: string, token: string): Promise<AccountInfoResponse> {
    return this.request<AccountInfoResponse>(`/api/accounts/${accountId}`, {
      method: 'GET',
      token,
    })
  }

  /**
   * Check if an account exists
   *
   * @param accountId - Account ID
   * @param token - JWT token
   * @returns True if account exists
   */
  async accountExists(accountId: string, token: string): Promise<boolean> {
    try {
      await this.request(`/api/accounts/${accountId}`, {
        method: 'HEAD',
        token,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Sign an EVM transaction hash
   *
   * @param request - Sign request with tx_hash and chain_id
   * @param token - JWT token
   * @returns Signature response with r, s, v components
   */
  async signEvmTransaction(
    request: SignEvmRequest,
    token: string
  ): Promise<EvmSignatureResponse> {
    return this.request<EvmSignatureResponse>('/api/sign/evm', {
      method: 'POST',
      token,
      body: JSON.stringify(request),
    })
  }

  /**
   * Sign a raw hash for EVM
   *
   * Convenience method that wraps signEvmTransaction.
   *
   * @param hash - 32-byte hash to sign (hex encoded with 0x prefix)
   * @param chainId - Chain ID
   * @param token - JWT token
   * @returns Full signature (hex encoded with 0x prefix)
   */
  async signHash(hash: Hex, chainId: number, token: string): Promise<Hex> {
    const response = await this.signEvmTransaction(
      { tx_hash: hash, chain_id: chainId },
      token
    )
    return response.signature.full
  }

  /**
   * Create a new account with passkey authentication
   *
   * @param attestationObject - Base64url encoded attestation object from WebAuthn
   * @param label - Optional label for the passkey (defaults to "Owner Passkey")
   * @returns Account creation response with account ID and addresses
   */
  async createAccountWithPasskey(
    attestationObject: string,
    label?: string
  ): Promise<AccountCreationResponse> {
    const body: Record<string, string> = {
      attestation_object: attestationObject,
    }
    if (label) {
      body.label = label
    }
    return this.request<AccountCreationResponse>('/api/accounts/create/passkey', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  /**
   * Create a new account with password authentication
   *
   * @param request - Password and confirmation
   * @returns Account creation response with account ID and addresses
   */
  async createAccountWithPassword(
    request: CreatePasswordAccountRequest
  ): Promise<AccountCreationResponse> {
    return this.request<AccountCreationResponse>('/api/accounts/create/password', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  /**
   * Authenticate with password
   *
   * @param request - Account ID and password
   * @returns Authentication response with JWT token
   */
  async authenticatePassword(request: PasswordAuthRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  /**
   * Add password authentication to an existing account
   *
   * Enables password-based authentication for an account that was created
   * with passkey-only authentication.
   *
   * @param accountId - Account ID
   * @param request - Password and confirmation
   * @param token - JWT token
   * @returns Success response
   */
  async addPassword(
    accountId: string,
    request: AddPasswordRequest,
    token: string
  ): Promise<AddPasswordResponse> {
    return this.request<AddPasswordResponse>(`/api/accounts/${accountId}/password`, {
      method: 'POST',
      token,
      body: JSON.stringify(request),
    })
  }

  /**
   * Get extended account information including auth config
   *
   * @param accountId - Account ID
   * @param token - JWT token
   * @returns Extended account info with auth config and passkey count
   */
  async getAccountInfoExtended(accountId: string, token: string): Promise<AccountInfoExtendedResponse> {
    return this.request<AccountInfoExtendedResponse>(`/api/accounts/${accountId}`, {
      method: 'GET',
      token,
    })
  }

  /**
   * Add a recovery passkey to an existing account
   *
   * @param accountId - Account ID
   * @param request - Passkey data (COSE public key, credential ID, algorithm, label)
   * @param token - JWT token
   * @returns Success response with label
   */
  async addPasskey(
    accountId: string,
    request: AddPasskeyRequest,
    token: string
  ): Promise<AddPasskeyResponse> {
    return this.request<AddPasskeyResponse>(`/api/accounts/${accountId}/passkeys`, {
      method: 'POST',
      token,
      body: JSON.stringify(request),
    })
  }

  /**
   * Remove a passkey from an account
   *
   * Note: Cannot remove the owner passkey (index 0)
   *
   * @param accountId - Account ID
   * @param passkeyIndex - Index of passkey to remove (1-3 for recovery passkeys)
   * @param token - JWT token
   * @returns Success response
   */
  async removePasskey(
    accountId: string,
    passkeyIndex: number,
    token: string
  ): Promise<RemovePasskeyResponse> {
    return this.request<RemovePasskeyResponse>(`/api/accounts/${accountId}/passkeys/${passkeyIndex}`, {
      method: 'DELETE',
      token,
    })
  }

  /**
   * Health check
   *
   * @returns True if the API is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request<{ status: string }>('/api/health', {
        method: 'GET',
      })
      return response.status === 'ok'
    } catch {
      return false
    }
  }

  /**
   * Get API version
   *
   * @returns Version string
   */
  async getVersion(): Promise<string> {
    const response = await this.request<{ version: string }>('/api/version', {
      method: 'GET',
    })
    return response.version
  }
}

/**
 * Create a new Kentucky Signer client
 *
 * @param options - Client options
 * @returns Kentucky Signer client instance
 */
export function createClient(options: ClientOptions): KentuckySignerClient {
  return new KentuckySignerClient(options)
}
