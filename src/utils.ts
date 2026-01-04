/**
 * Utility functions for Kentucky Signer Viem integration
 */

/**
 * Base64URL encode a Uint8Array
 *
 * @param data - Data to encode
 * @returns Base64URL encoded string (no padding)
 */
export function base64UrlEncode(data: Uint8Array): string {
  // Convert to regular base64
  let base64: string
  if (typeof Buffer !== 'undefined') {
    // Node.js
    base64 = Buffer.from(data).toString('base64')
  } else {
    // Browser
    const binary = Array.from(data)
      .map((byte) => String.fromCharCode(byte))
      .join('')
    base64 = btoa(binary)
  }

  // Convert to base64url (replace + with -, / with _, remove padding)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Base64URL decode a string to Uint8Array
 *
 * @param str - Base64URL encoded string
 * @returns Decoded bytes
 */
export function base64UrlDecode(str: string): Uint8Array {
  // Convert base64url to regular base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')

  // Add padding if needed
  const padding = (4 - (base64.length % 4)) % 4
  base64 += '='.repeat(padding)

  if (typeof Buffer !== 'undefined') {
    // Node.js
    return new Uint8Array(Buffer.from(base64, 'base64'))
  } else {
    // Browser
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
}

/**
 * Convert a hex string to Uint8Array
 *
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Byte array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Convert a Uint8Array to hex string
 *
 * @param bytes - Byte array
 * @param withPrefix - Include 0x prefix (default: true)
 * @returns Hex string
 */
export function bytesToHex(bytes: Uint8Array, withPrefix: boolean = true): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return withPrefix ? `0x${hex}` : hex
}

/**
 * Validate an account ID format
 *
 * Account IDs are 64-character hex strings (32 bytes).
 *
 * @param accountId - Account ID to validate
 * @returns True if valid
 */
export function isValidAccountId(accountId: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(accountId)
}

/**
 * Validate an EVM address format
 *
 * @param address - Address to validate
 * @returns True if valid
 */
export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in ms (default: 1000)
 * @returns Result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt)
        await sleep(delay)
      }
    }
  }

  throw lastError
}

/**
 * Parse a JWT token (without validation)
 *
 * @param token - JWT token string
 * @returns Decoded payload
 */
export function parseJwt(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const payload = base64UrlDecode(parts[1])
  const text = new TextDecoder().decode(payload)
  return JSON.parse(text)
}

/**
 * Get JWT expiration time
 *
 * @param token - JWT token string
 * @returns Expiration timestamp in milliseconds, or null if no exp claim
 */
export function getJwtExpiration(token: string): number | null {
  try {
    const payload = parseJwt(token)
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000 // Convert seconds to milliseconds
    }
    return null
  } catch {
    return null
  }
}

/**
 * Format an error for display
 *
 * @param error - Error to format
 * @returns Formatted error message
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unknown error occurred'
}
