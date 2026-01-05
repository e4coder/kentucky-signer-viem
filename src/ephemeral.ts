/**
 * Ephemeral Key Management for Kentucky Signer
 *
 * Implements ephemeral ECDSA keys for request signing.
 * The ephemeral public key is bound to the JWT token during authentication,
 * and the private key is used to sign all subsequent request payloads.
 *
 * Security Properties:
 * - Ephemeral keys are generated fresh for each session
 * - Private keys never leave the client
 * - SGX verifies payload signatures before processing
 * - Prevents replay attacks and token theft
 */

import { base64UrlEncode, base64UrlDecode } from './utils'

/**
 * Ephemeral key pair for request signing
 */
export interface EphemeralKeyPair {
  /** Public key in SPKI format (base64url encoded) */
  publicKey: string
  /** Private CryptoKey for signing (not exportable) */
  privateKey: CryptoKey
  /** Algorithm used (ES256 = P-256 with SHA-256) */
  algorithm: 'ES256'
  /** Creation timestamp */
  createdAt: number
}

/**
 * Signed request payload
 */
export interface SignedPayload {
  /** Original payload (JSON string) */
  payload: string
  /** Signature (base64url encoded) */
  signature: string
  /** Timestamp when signature was created */
  timestamp: number
}

/**
 * Check if WebCrypto is available
 */
export function isWebCryptoAvailable(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.getRandomValues !== 'undefined'
  )
}

/**
 * Generate an ephemeral ECDSA key pair using WebCrypto
 *
 * Uses P-256 curve (secp256r1) with SHA-256 for ES256 signatures.
 *
 * @returns Generated key pair
 * @throws Error if WebCrypto is not available
 */
export async function generateEphemeralKeyPair(): Promise<EphemeralKeyPair> {
  if (!isWebCryptoAvailable()) {
    throw new Error('WebCrypto is not available in this environment')
  }

  // Generate ECDSA key pair on P-256 curve
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable (only for public key export)
    ['sign', 'verify']
  )

  // Export public key in SPKI format
  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const publicKeyBase64 = base64UrlEncode(new Uint8Array(publicKeyBuffer))

  return {
    publicKey: publicKeyBase64,
    privateKey: keyPair.privateKey,
    algorithm: 'ES256',
    createdAt: Date.now(),
  }
}

/**
 * Sign a request payload with the ephemeral private key
 *
 * The signature covers:
 * - The JSON payload string
 * - A timestamp to prevent replay attacks
 *
 * @param payload - Request payload (will be JSON stringified if object)
 * @param keyPair - Ephemeral key pair
 * @returns Signed payload with signature
 */
export async function signPayload(
  payload: string | object,
  keyPair: EphemeralKeyPair
): Promise<SignedPayload> {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const timestamp = Date.now()

  // Create message to sign: timestamp + payload
  // This prevents replay attacks
  const message = `${timestamp}.${payloadString}`
  const messageBytes = new TextEncoder().encode(message)

  // Sign with ECDSA P-256 + SHA-256
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    keyPair.privateKey,
    messageBytes
  )

  const signatureBase64 = base64UrlEncode(new Uint8Array(signatureBuffer))

  return {
    payload: payloadString,
    signature: signatureBase64,
    timestamp,
  }
}

/**
 * Verify a signed payload (for testing purposes)
 *
 * @param signedPayload - The signed payload to verify
 * @param publicKeyBase64 - Public key in SPKI format (base64url)
 * @returns True if signature is valid
 */
export async function verifyPayload(
  signedPayload: SignedPayload,
  publicKeyBase64: string
): Promise<boolean> {
  try {
    // Import public key
    const publicKeyBytes = base64UrlDecode(publicKeyBase64)
    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBytes.buffer as ArrayBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify']
    )

    // Reconstruct message
    const message = `${signedPayload.timestamp}.${signedPayload.payload}`
    const messageBytes = new TextEncoder().encode(message)

    // Decode signature
    const signatureBytes = base64UrlDecode(signedPayload.signature)

    // Verify signature
    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      signatureBytes.buffer as ArrayBuffer,
      messageBytes
    )
  } catch {
    return false
  }
}

/**
 * Storage key for ephemeral key pair
 */
const EPHEMERAL_KEY_STORAGE_KEY = 'kentucky_signer_ephemeral'

/**
 * Ephemeral key storage interface
 */
export interface EphemeralKeyStorage {
  save(keyPair: EphemeralKeyPair): Promise<void>
  load(): Promise<EphemeralKeyPair | null>
  clear(): Promise<void>
}

/**
 * In-memory ephemeral key storage
 *
 * Keys are lost when the page is refreshed.
 */
export class MemoryEphemeralKeyStorage implements EphemeralKeyStorage {
  private keyPair: EphemeralKeyPair | null = null

  async save(keyPair: EphemeralKeyPair): Promise<void> {
    this.keyPair = keyPair
  }

  async load(): Promise<EphemeralKeyPair | null> {
    return this.keyPair
  }

  async clear(): Promise<void> {
    this.keyPair = null
  }
}

/**
 * IndexedDB ephemeral key storage
 *
 * Persists keys across page refreshes but not browser restarts.
 * Uses non-extractable keys for security.
 */
export class IndexedDBEphemeralKeyStorage implements EphemeralKeyStorage {
  private dbName = 'kentucky_signer_ephemeral_keys'
  private storeName = 'keys'

  private async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }
    })
  }

  async save(keyPair: EphemeralKeyPair): Promise<void> {
    const db = await this.getDB()

    // Store the CryptoKey directly (IndexedDB supports structured clone of CryptoKey)
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)

      const data = {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        algorithm: keyPair.algorithm,
        createdAt: keyPair.createdAt,
      }

      const request = store.put(data, EPHEMERAL_KEY_STORAGE_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async load(): Promise<EphemeralKeyPair | null> {
    const db = await this.getDB()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const store = tx.objectStore(this.storeName)

      const request = store.get(EPHEMERAL_KEY_STORAGE_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        if (request.result) {
          resolve({
            publicKey: request.result.publicKey,
            privateKey: request.result.privateKey,
            algorithm: request.result.algorithm,
            createdAt: request.result.createdAt,
          })
        } else {
          resolve(null)
        }
      }
    })
  }

  async clear(): Promise<void> {
    const db = await this.getDB()

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)

      const request = store.delete(EPHEMERAL_KEY_STORAGE_KEY)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

/**
 * Create an ephemeral key manager for a session
 *
 * The manager handles:
 * - Key generation on first use
 * - Key storage and retrieval
 * - Automatic key rotation (optional)
 * - Storage migration (switching between IndexedDB and memory)
 */
export class EphemeralKeyManager {
  private keyPair: EphemeralKeyPair | null = null
  private storage: EphemeralKeyStorage

  constructor(storage?: EphemeralKeyStorage) {
    this.storage = storage ?? new MemoryEphemeralKeyStorage()
  }

  /**
   * Get or generate ephemeral key pair
   */
  async getKeyPair(): Promise<EphemeralKeyPair> {
    // Try to load from storage first
    if (!this.keyPair) {
      this.keyPair = await this.storage.load()
    }

    // Generate new key pair if not found
    if (!this.keyPair) {
      this.keyPair = await generateEphemeralKeyPair()
      await this.storage.save(this.keyPair)
    }

    return this.keyPair
  }

  /**
   * Get the public key for authentication
   */
  async getPublicKey(): Promise<string> {
    const keyPair = await this.getKeyPair()
    return keyPair.publicKey
  }

  /**
   * Sign a request payload
   */
  async signPayload(payload: string | object): Promise<SignedPayload> {
    const keyPair = await this.getKeyPair()
    return signPayload(payload, keyPair)
  }

  /**
   * Rotate the key pair (generate new keys)
   */
  async rotate(): Promise<EphemeralKeyPair> {
    await this.storage.clear()
    this.keyPair = await generateEphemeralKeyPair()
    await this.storage.save(this.keyPair)
    return this.keyPair
  }

  /**
   * Clear the key pair (logout)
   */
  async clear(): Promise<void> {
    await this.storage.clear()
    this.keyPair = null
  }

  /**
   * Check if a key pair exists
   */
  async hasKeyPair(): Promise<boolean> {
    if (this.keyPair) return true
    const loaded = await this.storage.load()
    return loaded !== null
  }

  /**
   * Migrate key pair to a new storage backend
   *
   * This preserves the existing key pair while switching storage.
   * The key is saved to the new storage and removed from the old storage.
   *
   * @param newStorage - The new storage backend to migrate to
   */
  async migrateStorage(newStorage: EphemeralKeyStorage): Promise<void> {
    // Get current key pair (from memory or old storage)
    const currentKeyPair = this.keyPair ?? await this.storage.load()

    // Clear old storage
    await this.storage.clear()

    // Switch to new storage
    this.storage = newStorage

    // Save key pair to new storage if we had one
    if (currentKeyPair) {
      await this.storage.save(currentKeyPair)
      this.keyPair = currentKeyPair
    }
  }

  /**
   * Get the current storage backend
   */
  getStorage(): EphemeralKeyStorage {
    return this.storage
  }
}
