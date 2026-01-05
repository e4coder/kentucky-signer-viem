/**
 * Secure Kentucky Signer Client with Ephemeral Key Signing
 *
 * This client automatically:
 * - Generates an ephemeral key pair on initialization
 * - Sends the public key during authentication
 * - Signs all request payloads with the ephemeral private key
 */

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
  AuthResponseWithEphemeral,
} from './types'
import type { Hex } from 'viem'
import {
  EphemeralKeyManager,
  type SignedPayload,
  MemoryEphemeralKeyStorage,
  type EphemeralKeyStorage,
} from './ephemeral'
import { KentuckySignerError } from './client'

/**
 * Options for the secure client
 */
export interface SecureClientOptions extends ClientOptions {
  /** Custom ephemeral key storage (defaults to memory storage) */
  ephemeralKeyStorage?: EphemeralKeyStorage
  /** Shared ephemeral key manager (takes precedence over storage) */
  ephemeralKeyManager?: EphemeralKeyManager
  /** Whether to require ephemeral key verification (default: true) */
  requireEphemeralSigning?: boolean
}

/**
 * Secure Kentucky Signer API client with ephemeral key signing
 *
 * All requests to authenticated endpoints are automatically signed
 * with the ephemeral private key bound during authentication.
 */
export class SecureKentuckySignerClient {
  private baseUrl: string
  private fetchImpl: typeof fetch
  private timeout: number
  private keyManager: EphemeralKeyManager
  private requireSigning: boolean

  constructor(options: SecureClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.timeout = options.timeout ?? 30000
    // Use shared manager if provided, otherwise create one with the storage
    this.keyManager = options.ephemeralKeyManager ?? new EphemeralKeyManager(
      options.ephemeralKeyStorage ?? new MemoryEphemeralKeyStorage()
    )
    this.requireSigning = options.requireEphemeralSigning ?? true
  }

  /**
   * Get the ephemeral key manager for advanced usage
   */
  getKeyManager(): EphemeralKeyManager {
    return this.keyManager
  }

  /**
   * Make a signed request to the API
   */
  private async request<T>(
    path: string,
    options: RequestInit & { token?: string; skipSigning?: boolean } = {}
  ): Promise<T> {
    const { token, skipSigning, ...fetchOptions } = options

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    if (token) {
      ;(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
    }

    let body = options.body

    // Sign the request body if token is present and signing is required
    if (token && !skipSigning && this.requireSigning && body) {
      const signedPayload = await this.keyManager.signPayload(body as string)

      // Add signature headers - body is NOT modified
      // The enclave verifies the signature against the original body
      ;(headers as Record<string, string>)['X-Ephemeral-Signature'] =
        signedPayload.signature
      ;(headers as Record<string, string>)['X-Ephemeral-Timestamp'] =
        signedPayload.timestamp.toString()
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...fetchOptions,
        headers,
        body,
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
   */
  async getChallenge(accountId: string): Promise<ChallengeResponse> {
    return this.request<ChallengeResponse>('/api/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId }),
      skipSigning: true, // No token yet
    })
  }

  /**
   * Authenticate with a passkey credential
   *
   * Automatically sends the ephemeral public key for binding.
   */
  async authenticatePasskey(
    accountId: string,
    credential: PasskeyCredential
  ): Promise<AuthResponseWithEphemeral> {
    // Get ephemeral public key for binding
    const ephemeralPublicKey = await this.keyManager.getPublicKey()

    return this.request<AuthResponseWithEphemeral>('/api/auth/passkey', {
      method: 'POST',
      body: JSON.stringify({
        account_id: accountId,
        credential_id: credential.credentialId,
        client_data_json: credential.clientDataJSON,
        authenticator_data: credential.authenticatorData,
        signature: credential.signature,
        user_handle: credential.userHandle,
        ephemeral_public_key: ephemeralPublicKey,
      }),
      skipSigning: true, // No token yet
    })
  }

  /**
   * Authenticate with password
   *
   * Automatically sends the ephemeral public key for binding.
   */
  async authenticatePassword(
    request: PasswordAuthRequest
  ): Promise<AuthResponseWithEphemeral> {
    // Get ephemeral public key for binding
    const ephemeralPublicKey = await this.keyManager.getPublicKey()

    return this.request<AuthResponseWithEphemeral>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({
        ...request,
        ephemeral_public_key: ephemeralPublicKey,
      }),
      skipSigning: true, // No token yet
    })
  }

  /**
   * Refresh an authentication token
   *
   * Generates a new ephemeral key pair and binds it to the new token.
   */
  async refreshToken(token: string): Promise<AuthResponseWithEphemeral> {
    // Rotate ephemeral key on refresh
    await this.keyManager.rotate()
    const ephemeralPublicKey = await this.keyManager.getPublicKey()

    return this.request<AuthResponseWithEphemeral>('/api/auth/refresh', {
      method: 'POST',
      token,
      body: JSON.stringify({
        ephemeral_public_key: ephemeralPublicKey,
      }),
      skipSigning: true, // Use old token, but send new key
    })
  }

  /**
   * Logout and invalidate token
   *
   * Clears the ephemeral key pair.
   */
  async logout(token: string): Promise<void> {
    await this.request('/api/auth/logout', {
      method: 'POST',
      token,
      skipSigning: true,
    })
    await this.keyManager.clear()
  }

  /**
   * Get account information (signed request)
   */
  async getAccountInfo(
    accountId: string,
    token: string
  ): Promise<AccountInfoResponse> {
    // GET requests don't have a body, so we can't sign them the normal way
    // For now, skip signing for GET requests
    return this.request<AccountInfoResponse>(`/api/accounts/${accountId}`, {
      method: 'GET',
      token,
      skipSigning: true,
    })
  }

  /**
   * Get extended account information (signed request)
   */
  async getAccountInfoExtended(
    accountId: string,
    token: string
  ): Promise<AccountInfoExtendedResponse> {
    return this.request<AccountInfoExtendedResponse>(
      `/api/accounts/${accountId}`,
      {
        method: 'GET',
        token,
        skipSigning: true,
      }
    )
  }

  /**
   * Sign an EVM transaction hash (signed request)
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
   * Sign a raw hash for EVM (signed request)
   */
  async signHash(hash: Hex, chainId: number, token: string): Promise<Hex> {
    const response = await this.signEvmTransaction(
      { tx_hash: hash, chain_id: chainId },
      token
    )
    return response.signature.full
  }

  /**
   * Add password to account (signed request)
   */
  async addPassword(
    accountId: string,
    request: AddPasswordRequest,
    token: string
  ): Promise<AddPasswordResponse> {
    return this.request<AddPasswordResponse>(
      `/api/accounts/${accountId}/password`,
      {
        method: 'POST',
        token,
        body: JSON.stringify(request),
      }
    )
  }

  /**
   * Add passkey to account (signed request)
   */
  async addPasskey(
    accountId: string,
    request: AddPasskeyRequest,
    token: string
  ): Promise<AddPasskeyResponse> {
    return this.request<AddPasskeyResponse>(
      `/api/accounts/${accountId}/passkeys`,
      {
        method: 'POST',
        token,
        body: JSON.stringify(request),
      }
    )
  }

  /**
   * Remove passkey from account (signed request)
   */
  async removePasskey(
    accountId: string,
    passkeyIndex: number,
    token: string
  ): Promise<RemovePasskeyResponse> {
    return this.request<RemovePasskeyResponse>(
      `/api/accounts/${accountId}/passkeys/${passkeyIndex}`,
      {
        method: 'DELETE',
        token,
        body: JSON.stringify({ passkey_index: passkeyIndex }),
      }
    )
  }

  /**
   * Create account with passkey (public endpoint, no signing)
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
      skipSigning: true,
    })
  }

  /**
   * Create account with password (public endpoint, no signing)
   */
  async createAccountWithPassword(
    request: CreatePasswordAccountRequest
  ): Promise<AccountCreationResponse> {
    return this.request<AccountCreationResponse>('/api/accounts/create/password', {
      method: 'POST',
      body: JSON.stringify(request),
      skipSigning: true,
    })
  }

  /**
   * Health check (public endpoint)
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request<{ status: string }>('/api/health', {
        method: 'GET',
        skipSigning: true,
      })
      return response.status === 'ok'
    } catch {
      return false
    }
  }
}

/**
 * Create a new secure Kentucky Signer client
 */
export function createSecureClient(
  options: SecureClientOptions
): SecureKentuckySignerClient {
  return new SecureKentuckySignerClient(options)
}
