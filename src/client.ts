import type {
  ClientOptions,
  ChallengeResponse,
  AuthResponse,
  AccountInfoResponse,
  EvmSignatureResponse,
  ApiErrorResponse,
  PasskeyCredential,
  AccountCreationResponse,
  SignEvmRequest,
  CreatePasswordAccountRequest,
  PasswordAuthRequest,
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
    this.fetchImpl = options.fetch ?? globalThis.fetch
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
   * @returns Authentication response with JWT token
   */
  async authenticatePasskey(
    accountId: string,
    credential: PasskeyCredential
  ): Promise<AuthResponse> {
    return this.request<AuthResponse>('/api/auth/passkey', {
      method: 'POST',
      body: JSON.stringify({
        account_id: accountId,
        credential_id: credential.credentialId,
        client_data_json: credential.clientDataJSON,
        authenticator_data: credential.authenticatorData,
        signature: credential.signature,
        user_handle: credential.userHandle,
      }),
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
   * @param credential - WebAuthn credential from navigator.credentials.create()
   * @returns Account creation response with account ID and addresses
   */
  async createAccountWithPasskey(
    credential: PasskeyCredential & { publicKey: string }
  ): Promise<AccountCreationResponse> {
    return this.request<AccountCreationResponse>('/api/accounts/create/passkey', {
      method: 'POST',
      body: JSON.stringify({
        credential_id: credential.credentialId,
        public_key: credential.publicKey,
        client_data_json: credential.clientDataJSON,
        authenticator_data: credential.authenticatorData,
      }),
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
