# Secure Mode (Ephemeral Key Signing)

Secure mode adds an extra layer of security by requiring client-side ephemeral key signatures for all API requests. Even if an attacker obtains your JWT token, they cannot make requests without access to your device's ephemeral key.

## How It Works

1. **Key Generation**: Client generates an ECDSA P-256 key pair using Web Crypto API
2. **Key Binding**: Public key is bound to the JWT during authentication
3. **Request Signing**: Every API request is signed with the ephemeral private key
4. **Server Verification**: Server verifies the signature matches the bound public key

## Quick Start

### Basic Setup

```typescript
import {
  SecureKentuckySignerClient,
  EphemeralKeyManager,
  createKentuckySignerAccount,
  authenticateWithPasskey,
} from 'kentucky-signer-viem'

// 1. Create ephemeral key manager
const keyManager = new EphemeralKeyManager()

// 2. Get public key for binding
const publicKey = await keyManager.getPublicKey()

// 3. Authenticate with key binding
const session = await authenticateWithPasskey({
  baseUrl: 'https://signer.example.com',
  accountId: 'account_id',
  ephemeralPublicKey: publicKey, // Bind the key
})

// 4. Create secure client
const secureClient = new SecureKentuckySignerClient({
  baseUrl: 'https://signer.example.com',
  ephemeralKeyManager: keyManager,
})

// 5. Create account with secure client
const account = createKentuckySignerAccount({
  config: { baseUrl, accountId: session.accountId },
  session,
  secureClient, // Use secure client for all requests
})
```

## Key Storage Options

### Memory Storage (Default)

Keys are stored in memory and cleared when the page is refreshed or closed.

```typescript
import { MemoryEphemeralKeyStorage, EphemeralKeyManager } from 'kentucky-signer-viem'

const storage = new MemoryEphemeralKeyStorage()
const keyManager = new EphemeralKeyManager(storage)
```

**Pros:**
- Most secure - keys never persist
- No storage permissions needed

**Cons:**
- User must re-authenticate after page refresh
- Not suitable for long sessions

### IndexedDB Storage

Keys are stored in IndexedDB and survive page refreshes and browser restarts.

```typescript
import { IndexedDBEphemeralKeyStorage, EphemeralKeyManager } from 'kentucky-signer-viem'

const storage = new IndexedDBEphemeralKeyStorage()
const keyManager = new EphemeralKeyManager(storage)
```

**Pros:**
- Persistent sessions
- Better user experience

**Cons:**
- Keys stored on device
- Cleared when browser data is cleared

### Custom Storage

Implement the `EphemeralKeyStorage` interface for custom storage:

```typescript
interface EphemeralKeyStorage {
  getKey(): Promise<CryptoKeyPair | null>
  setKey(keyPair: CryptoKeyPair): Promise<void>
  clearKey(): Promise<void>
}

class MyCustomStorage implements EphemeralKeyStorage {
  async getKey() { /* ... */ }
  async setKey(keyPair) { /* ... */ }
  async clearKey() { /* ... */ }
}

const keyManager = new EphemeralKeyManager(new MyCustomStorage())
```

## React Integration

### Provider Configuration

```tsx
import { KentuckySignerProvider } from 'kentucky-signer-viem/react'

function App() {
  return (
    <KentuckySignerProvider
      baseUrl="https://signer.example.com"
      useEphemeralKeys={true}  // Enable secure mode by default
    >
      <YourApp />
    </KentuckySignerProvider>
  )
}
```

### Toggle Secure Mode

```tsx
import { useKentuckySigner } from 'kentucky-signer-viem/react'

function SecuritySettings() {
  const {
    secureMode,
    setSecureMode,
    persistEphemeralKeys,
    setPersistEphemeralKeys,
    ephemeralKeyBound,
  } = useKentuckySigner()

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={secureMode}
          onChange={(e) => setSecureMode(e.target.checked)}
        />
        Enable Secure Mode
      </label>

      {secureMode && (
        <>
          <p>
            Ephemeral Key: {ephemeralKeyBound ? 'Bound' : 'Not Bound'}
          </p>

          <label>
            <input
              type="checkbox"
              checked={persistEphemeralKeys}
              onChange={(e) => setPersistEphemeralKeys(e.target.checked)}
            />
            Persist Keys (IndexedDB)
          </label>
        </>
      )}
    </div>
  )
}
```

### Get Public Key for External Auth

```tsx
const { getEphemeralPublicKey, secureMode } = useKentuckySigner()

// For external authentication flows
if (secureMode) {
  const publicKey = await getEphemeralPublicKey()
  // Include publicKey in your auth request
}
```

## Secure Client API

### Creating the Client

```typescript
import { SecureKentuckySignerClient, EphemeralKeyManager } from 'kentucky-signer-viem'

const secureClient = new SecureKentuckySignerClient({
  baseUrl: 'https://signer.example.com',
  ephemeralKeyManager: new EphemeralKeyManager(),
})
```

### Making Signed Requests

All requests through the secure client are automatically signed:

```typescript
// These requests are signed with the ephemeral key
const signature = await secureClient.signEvmTransaction(
  { tx_hash: '0x...' },
  token
)

await secureClient.addPassword(accountId, {
  password: 'new-password',
  confirmation: 'new-password',
}, token)
```

### Request Signature Format

Signed requests include these headers:

```
X-Ephemeral-Signature: <base64-encoded signature>
X-Ephemeral-Timestamp: <unix timestamp>
X-Ephemeral-Nonce: <random nonce>
```

The signature covers:
- HTTP method
- Request path
- Request body (if present)
- Timestamp
- Nonce

## Key Management

### Key Generation

```typescript
import { generateEphemeralKeyPair } from 'kentucky-signer-viem'

const keyPair = await generateEphemeralKeyPair()
// keyPair.privateKey - CryptoKey for signing
// keyPair.publicKey - CryptoKey for verification
```

### Export Public Key

```typescript
import { EphemeralKeyManager } from 'kentucky-signer-viem'

const manager = new EphemeralKeyManager()
const publicKeyBase64 = await manager.getPublicKey()
// Returns base64-encoded SPKI format public key
```

### Sign Payload

```typescript
import { signPayload } from 'kentucky-signer-viem'

const signature = await signPayload(privateKey, 'data to sign')
// Returns base64-encoded signature
```

### Verify Signature

```typescript
import { verifyPayload } from 'kentucky-signer-viem'

const isValid = await verifyPayload(publicKey, 'data', signature)
```

### Clear Keys

```typescript
await keyManager.clear()
// Removes the ephemeral key from storage
```

### Migrate Storage

Switch between storage backends while preserving the key:

```typescript
const indexedDBStorage = new IndexedDBEphemeralKeyStorage()
const memoryStorage = new MemoryEphemeralKeyStorage()

const manager = new EphemeralKeyManager(memoryStorage)

// Migrate to IndexedDB (preserves existing key)
await manager.migrateStorage(indexedDBStorage)
```

## Security Considerations

### Token Theft Protection

Even if an attacker steals your JWT token:
- They cannot make signed requests without the ephemeral key
- The key never leaves the device
- Server rejects unsigned requests for bound tokens

### Key Compromise

If the ephemeral key is compromised:
- Logout to invalidate the token
- Clear the key storage
- Re-authenticate with a new key

### Browser Security

- Keys use Web Crypto API (non-extractable by default)
- IndexedDB storage is origin-bound
- Keys are scoped to the browser profile

### Recommendations

1. **Use Memory Storage** for high-security scenarios
2. **Use IndexedDB Storage** for better UX when appropriate
3. **Implement Session Timeout** to limit exposure window
4. **Enable 2FA** as an additional security layer

## Checking Web Crypto Availability

```typescript
import { isWebCryptoAvailable } from 'kentucky-signer-viem'

if (!isWebCryptoAvailable()) {
  console.warn('Web Crypto API not available, secure mode disabled')
}
```

## Troubleshooting

### "Ephemeral key not bound"

The token was created without binding an ephemeral key. Re-authenticate with `ephemeralPublicKey`:

```typescript
const session = await authenticateWithPasskey({
  baseUrl,
  accountId,
  ephemeralPublicKey: await keyManager.getPublicKey(),
})
```

### "Signature verification failed"

The server could not verify the request signature. Possible causes:
- Key was regenerated after authentication
- Timestamp drift (check system clock)
- Request was modified in transit

### "Web Crypto API not available"

Secure mode requires the Web Crypto API. Check:
- Using HTTPS (required for Web Crypto)
- Browser supports Web Crypto (all modern browsers do)
- Not in a restricted context (some iframes)
