# Authentication

Kentucky Signer Viem supports multiple authentication methods to accommodate different use cases and environments.

## Overview

| Method | Environment | Use Case |
|--------|-------------|----------|
| Passkey (WebAuthn) | Browser only | Most secure, user-friendly |
| Password | Browser & Node.js | Fallback, server-side scripts |
| JWT Token | Any | Pre-authenticated sessions |

## Passkey Authentication (WebAuthn)

Passkeys provide the most secure and user-friendly authentication experience. They use the device's biometric authentication (fingerprint, face ID) or PIN.

### Basic Usage

```typescript
import { authenticateWithPasskey } from 'kentucky-signer-viem'

const session = await authenticateWithPasskey({
  baseUrl: 'https://signer.example.com',
  accountId: '0123456789abcdef...', // 64-character hex
})

console.log('Token:', session.token)
console.log('EVM Address:', session.evmAddress)
console.log('Expires:', new Date(session.expiresAt))
```

### Options

```typescript
interface PasskeyAuthOptions {
  // Required
  baseUrl: string        // Kentucky Signer API URL
  accountId: string      // 64-character hex account ID

  // Optional
  rpId?: string          // WebAuthn Relying Party ID (defaults to current domain)
  allowCredentials?: string[]  // Specific credential IDs to allow
  ephemeralPublicKey?: string  // For secure mode binding
}
```

### With Secure Mode

Bind an ephemeral public key during authentication for enhanced security:

```typescript
import { authenticateWithPasskey, EphemeralKeyManager } from 'kentucky-signer-viem'

const keyManager = new EphemeralKeyManager()
const publicKey = await keyManager.getPublicKey()

const session = await authenticateWithPasskey({
  baseUrl: 'https://signer.example.com',
  accountId: 'account_id',
  ephemeralPublicKey: publicKey,
})

// Session is now bound to the ephemeral key
```

### Error Handling

```typescript
import { KentuckySignerError } from 'kentucky-signer-viem'

try {
  const session = await authenticateWithPasskey({ baseUrl, accountId })
} catch (error) {
  if (error instanceof KentuckySignerError) {
    switch (error.code) {
      case 'WEBAUTHN_NOT_AVAILABLE':
        console.log('WebAuthn is not supported in this browser')
        break
      case 'USER_CANCELLED':
        console.log('User cancelled the authentication')
        break
      case 'NOT_FOUND':
        console.log('Account not found')
        break
      case 'INVALID_CREDENTIAL':
        console.log('The passkey was not recognized')
        break
    }
  }
}
```

## Password Authentication

Password authentication works in both browser and Node.js environments.

### Authenticate Existing Account

```typescript
import { authenticateWithPassword } from 'kentucky-signer-viem'

const session = await authenticateWithPassword({
  baseUrl: 'https://signer.example.com',
  accountId: 'existing_account_id',
  password: 'your-secure-password',
})
```

### Create New Account with Password

```typescript
import { createAccountWithPassword } from 'kentucky-signer-viem'

const account = await createAccountWithPassword({
  baseUrl: 'https://signer.example.com',
  password: 'secure-password-8-128-chars',
  confirmation: 'secure-password-8-128-chars',
})

console.log('Account ID:', account.account_id)
console.log('EVM Address:', account.addresses.evm)
console.log('Bitcoin Address:', account.addresses.bitcoin)
console.log('Solana Address:', account.addresses.solana)
```

### Password Requirements

- Minimum 8 characters
- Maximum 128 characters
- Password and confirmation must match

### Options

```typescript
interface PasswordAuthOptions {
  baseUrl: string
  accountId: string
  password: string
  ephemeralPublicKey?: string  // For secure mode binding
}

interface PasswordAccountCreationOptions {
  baseUrl: string
  password: string
  confirmation: string
}
```

## JWT Token Authentication

For server-side applications or when you already have a valid JWT token.

### Create Session from Token

```typescript
import { authenticateWithToken } from 'kentucky-signer-viem'

const session = authenticateWithToken(
  'https://signer.example.com',
  'account_id_hex',
  'jwt_token_string',
  Date.now() + 3600000 // Optional: expiration timestamp
)
```

### Server Account Helper

A convenience function for Node.js environments:

```typescript
import { createServerAccount } from 'kentucky-signer-viem'

const account = createServerAccount(
  'https://signer.example.com', // baseUrl
  'account_id_hex',              // accountId
  'jwt_token',                   // token
  '0xEvmAddress',                // evmAddress
  1                              // chainId
)

// Use directly with Viem
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
})
```

## Session Object

All authentication methods return an `AuthSession` object:

```typescript
interface AuthSession {
  token: string        // JWT access token
  accountId: string    // 64-character hex account ID
  evmAddress: Address  // EVM address (0x prefixed, checksummed)
  btcAddress?: string  // Bitcoin address (if available)
  solAddress?: string  // Solana address (if available)
  expiresAt: number    // Token expiration timestamp (milliseconds)
}
```

## Session Management

### Check Session Validity

```typescript
import { isSessionValid } from 'kentucky-signer-viem'

if (isSessionValid(session)) {
  // Session is valid
} else {
  // Re-authenticate
}
```

### Automatic Session Refresh

When creating an account, provide an `onSessionExpired` callback:

```typescript
const account = createKentuckySignerAccount({
  config: { baseUrl, accountId },
  session,
  onSessionExpired: async () => {
    // Called when session expires during a signing operation
    const newSession = await authenticateWithPasskey({ baseUrl, accountId })
    return newSession
  },
})
```

### Manual Session Refresh

```typescript
import { refreshSessionIfNeeded } from 'kentucky-signer-viem'

const refreshedSession = await refreshSessionIfNeeded(
  session,
  baseUrl,
  300000 // Refresh if less than 5 minutes remaining (default: 60000)
)
```

## Token Storage

### Browser Storage

```typescript
import { LocalStorageTokenStorage, MemoryTokenStorage } from 'kentucky-signer-viem'

// Persist to localStorage
const persistentStorage = new LocalStorageTokenStorage('my_app_prefix')

// In-memory only (cleared on page refresh)
const memoryStorage = new MemoryTokenStorage()
```

### Using with React Provider

```tsx
<KentuckySignerProvider
  baseUrl="https://signer.example.com"
  persistSession={true}  // Uses localStorage
  storageKeyPrefix="my_app"
>
  <App />
</KentuckySignerProvider>
```

## Adding Authentication Methods

### Add Password to Existing Account

```typescript
const client = new KentuckySignerClient({ baseUrl })

await client.addPassword(accountId, {
  password: 'new-secure-password',
  confirmation: 'new-secure-password',
}, token)
```

### Register Additional Passkey

```typescript
const client = new KentuckySignerClient({ baseUrl })

// Get registration options from server
const regOptions = await client.getPasskeyRegistrationOptions(accountId, token)

// Create credential using WebAuthn API
const credential = await navigator.credentials.create({
  publicKey: regOptions,
})

// Register with server
await client.addPasskey(accountId, {
  credential_id: credential.id,
  public_key: /* encoded public key */,
  attestation: /* attestation object */,
}, token)
```

### Remove Passkey

```typescript
await client.removePasskey(accountId, credentialId, token)
```

## Best Practices

1. **Prefer Passkeys** - Use passkey authentication when available for the best security and user experience.

2. **Secure Mode** - Enable ephemeral key binding for sensitive operations to prevent token theft.

3. **Session Handling** - Always provide an `onSessionExpired` callback to handle token expiration gracefully.

4. **Error Messages** - Show user-friendly error messages based on error codes, not raw error messages.

5. **Multi-factor** - Enable 2FA (TOTP/PIN) for additional security on sensitive accounts.
