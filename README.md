# kentucky-signer-viem

A custom Viem account integration for the Kentucky Signer service, enabling EVM transaction signing using passkey (WebAuthn) or password authentication with optional two-factor authentication (TOTP/PIN).

## Features

- **Custom Viem Account** - Full Viem compatibility for signing transactions, messages, and typed data
- **Multiple Authentication Methods**
  - Passkey (WebAuthn) for browser environments
  - Password authentication for browser and Node.js
  - JWT token authentication for server environments
- **Secure Mode** - Ephemeral key signing with client-side key generation
- **Two-Factor Authentication** - TOTP (authenticator app) and PIN support
- **Guardian Recovery** - Social recovery with trusted guardians
- **React Integration** - Hooks and context for easy React app integration
- **TypeScript Support** - Full type definitions included
- **Session Management** - Automatic refresh and persistence options

## Installation

```bash
npm install kentucky-signer-viem viem
# or
yarn add kentucky-signer-viem viem
# or
pnpm add kentucky-signer-viem viem
```

## Quick Start

### Browser (with Passkey)

```typescript
import { createWalletClient, http, parseEther } from 'viem'
import { mainnet } from 'viem/chains'
import {
  createKentuckySignerAccount,
  authenticateWithPasskey,
} from 'kentucky-signer-viem'

// 1. Authenticate with passkey
const session = await authenticateWithPasskey({
  baseUrl: 'https://signer.example.com',
  accountId: '0123456789abcdef...', // 64-char hex account ID
})

// 2. Create Kentucky Signer account
const account = createKentuckySignerAccount({
  config: {
    baseUrl: 'https://signer.example.com',
    accountId: session.accountId,
  },
  session,
  defaultChainId: 1,
})

// 3. Create Viem wallet client
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY'),
})

// 4. Sign and send transaction
const hash = await walletClient.sendTransaction({
  to: '0x...',
  value: parseEther('0.1'),
})
```

### Password Authentication

```typescript
import {
  authenticateWithPassword,
  createAccountWithPassword,
} from 'kentucky-signer-viem'

// Create a new account
const newAccount = await createAccountWithPassword({
  baseUrl: 'https://signer.example.com',
  password: 'your-secure-password',
  confirmation: 'your-secure-password',
})

// Or authenticate with existing account
const session = await authenticateWithPassword({
  baseUrl: 'https://signer.example.com',
  accountId: 'existing_account_id',
  password: 'your-secure-password',
})
```

### Node.js (with JWT Token)

```typescript
import { createServerAccount } from 'kentucky-signer-viem'

const account = createServerAccount(
  'https://signer.example.com',
  'account_id_hex',
  'jwt_token',
  '0xYourEvmAddress',
  1 // chainId
)
```

## React Integration

### Setup Provider

```tsx
import { KentuckySignerProvider } from 'kentucky-signer-viem/react'

function App() {
  return (
    <KentuckySignerProvider
      baseUrl="https://signer.example.com"
      defaultChainId={1}
      persistSession={true}
      useEphemeralKeys={true} // Enable secure mode
    >
      <YourApp />
    </KentuckySignerProvider>
  )
}
```

### Authentication Hook

```tsx
import { useKentuckySigner } from 'kentucky-signer-viem/react'

function LoginButton() {
  const { isAuthenticated, account, authenticate, logout } = useKentuckySigner()

  if (isAuthenticated && account) {
    return (
      <div>
        <span>Connected: {account.address}</span>
        <button onClick={logout}>Logout</button>
      </div>
    )
  }

  return (
    <button onClick={() => authenticate('account_id')}>
      Login with Passkey
    </button>
  )
}
```

### Wallet Client Hook

```tsx
import { useWalletClient, useIsReady } from 'kentucky-signer-viem/react'
import { mainnet } from 'viem/chains'

function SendTransaction() {
  const isReady = useIsReady()
  const walletClient = useWalletClient({ chain: mainnet })

  async function send() {
    if (!walletClient) return
    const hash = await walletClient.sendTransaction({
      to: '0x...',
      value: parseEther('0.1'),
    })
  }

  return <button onClick={send} disabled={!isReady}>Send</button>
}
```

## Secure Mode (Ephemeral Keys)

Secure mode adds an extra layer of security by requiring client-side ephemeral key signatures for all operations:

```typescript
import { SecureKentuckySignerClient, EphemeralKeyManager } from 'kentucky-signer-viem'

// Create ephemeral key manager
const keyManager = new EphemeralKeyManager()

// Create secure client
const secureClient = new SecureKentuckySignerClient({
  baseUrl: 'https://signer.example.com',
  ephemeralKeyManager: keyManager,
})

// Authenticate with ephemeral key binding
const session = await authenticateWithPasskey({
  baseUrl: 'https://signer.example.com',
  accountId: 'account_id',
  ephemeralPublicKey: await keyManager.getPublicKey(),
})

// Create account with secure client
const account = createKentuckySignerAccount({
  config: { baseUrl, accountId },
  session,
  secureClient, // Uses ephemeral key signing
})
```

## Two-Factor Authentication

### Setup TOTP (Authenticator App)

```typescript
import { KentuckySignerClient } from 'kentucky-signer-viem'

const client = new KentuckySignerClient({ baseUrl })

// Start TOTP setup - returns QR code URI
const setup = await client.setupTOTP(token)
console.log('Scan this QR code:', setup.uri)
console.log('Or enter manually:', setup.secret)

// Enable TOTP with verification code
await client.enableTOTP('123456', token)

// Check 2FA status
const status = await client.get2FAStatus(token)
// { totp_enabled: true, pin_enabled: false, pin_length: 0 }
```

### Setup PIN

```typescript
// Setup 4 or 6 digit PIN
await client.setupPIN('123456', token)

// Disable PIN (requires current PIN)
await client.disablePIN('123456', token)
```

### Signing with 2FA

When 2FA is enabled, signing operations will automatically prompt for codes:

```tsx
import { useKentuckySigner } from 'kentucky-signer-viem/react'

function App() {
  const { twoFactorPrompt, submit2FA, cancel2FA } = useKentuckySigner()

  // The 2FA prompt appears automatically when signing requires it
  if (twoFactorPrompt.isVisible) {
    return (
      <TwoFactorModal
        totpRequired={twoFactorPrompt.totpRequired}
        pinRequired={twoFactorPrompt.pinRequired}
        pinLength={twoFactorPrompt.pinLength}
        onSubmit={(codes) => submit2FA(codes)}
        onCancel={() => cancel2FA()}
      />
    )
  }

  return <YourApp />
}
```

## Guardian Recovery

Set up trusted guardians for account recovery:

```typescript
const client = new KentuckySignerClient({ baseUrl })

// Add a guardian (requires WebAuthn attestation from guardian's device)
const { guardian_index, guardian_count } = await client.addGuardian({
  attestation_object: guardianAttestationBase64url,
  label: 'My Friend',
}, token)

// List guardians
const { guardians } = await client.getGuardians(token)
// guardians: [{ index: 1, label: 'My Friend' }, ...]

// Initiate recovery (when locked out - register new passkey first)
const recovery = await client.initiateRecovery(
  accountId,
  newPasskeyAttestationObject,
  'New Owner Passkey'
)
// Returns: { challenges, guardian_count, threshold, timelock_seconds }

// Guardian signs their challenge with their passkey
await client.verifyGuardian({
  account_id: accountId,
  guardian_index: 1,
  authenticator_data: authDataBase64url,
  client_data_json: clientDataBase64url,
  signature: signatureBase64url,
})

// Check recovery status
const status = await client.getRecoveryStatus(accountId)
// { verified_count, threshold, can_complete, timelock_remaining }

// Complete recovery after threshold met and timelock expired
await client.completeRecovery(accountId)
```

## API Reference

### Core Functions

| Function | Description |
|----------|-------------|
| `createKentuckySignerAccount(options)` | Create a Viem-compatible account |
| `createServerAccount(...)` | Create account with JWT token (Node.js) |
| `authenticateWithPasskey(options)` | Authenticate using WebAuthn |
| `authenticateWithPassword(options)` | Authenticate using password |
| `createAccountWithPassword(options)` | Create new account with password |
| `authenticateWithToken(...)` | Create session from JWT token |

### React Hooks

| Hook | Description |
|------|-------------|
| `useKentuckySigner()` | Access auth state, actions, and 2FA |
| `useKentuckySignerAccount()` | Get the current account |
| `useWalletClient(options)` | Create a Viem WalletClient |
| `usePasskeyAuth()` | Authentication flow with loading state |
| `useSignMessage()` | Sign messages with loading state |
| `useSignTypedData()` | Sign EIP-712 typed data |
| `useIsReady()` | Check if signer is ready |
| `useAddress()` | Get connected address |

### Client Methods

#### Authentication
- `getChallenge(accountId)` - Get WebAuthn challenge
- `authenticatePasskey(accountId, credential, ephemeralPublicKey?)` - Authenticate with passkey
- `authenticatePassword(request)` - Authenticate with password (`{ account_id, password }`)
- `refreshToken(token)` - Refresh JWT token
- `logout(token)` - Invalidate session

#### Signing
- `signEvmTransaction(request, token)` - Sign EVM transaction hash
- `signEvmTransactionWith2FA(request, token)` - Sign with 2FA codes

#### Account Management
- `getAccountInfo(accountId, token)` - Get account info
- `getAccountInfoExtended(accountId, token)` - Get account info with auth config
- `addPassword(accountId, request, token)` - Add password auth
- `addPasskey(accountId, request, token)` - Add passkey
- `removePasskey(accountId, passkeyIndex, token)` - Remove passkey by index

#### Two-Factor Authentication
- `get2FAStatus(token)` - Get 2FA status
- `setupTOTP(token)` - Start TOTP setup
- `enableTOTP(code, token)` - Enable TOTP
- `disableTOTP(code, token)` - Disable TOTP
- `setupPIN(pin, token)` - Setup PIN
- `disablePIN(pin, token)` - Disable PIN

#### Guardian Recovery
- `addGuardian(request, token)` - Add guardian passkey
- `removeGuardian(guardianIndex, token)` - Remove guardian
- `getGuardians(token)` - List guardians
- `initiateRecovery(accountId, attestationObject, label?)` - Start recovery
- `verifyGuardian(request)` - Submit guardian signature
- `getRecoveryStatus(accountId)` - Check recovery status
- `completeRecovery(accountId)` - Complete recovery
- `cancelRecovery(token)` - Cancel recovery (owner only)

## Error Handling

```typescript
import { KentuckySignerError } from 'kentucky-signer-viem'

try {
  await authenticate(accountId)
} catch (error) {
  if (error instanceof KentuckySignerError) {
    switch (error.code) {
      case 'WEBAUTHN_NOT_AVAILABLE':
        // WebAuthn not supported
        break
      case 'USER_CANCELLED':
        // User cancelled authentication
        break
      case 'SESSION_EXPIRED':
        // JWT token expired
        break
      case '2FA_REQUIRED':
        // 2FA verification needed
        break
      case '2FA_CANCELLED':
        // User cancelled 2FA input
        break
      // ... handle other codes
    }
  }
}
```

## Documentation

For detailed documentation, see the [docs](./docs) folder:

- [Authentication](./docs/authentication.md) - Passkey, password, and token auth
- [Secure Mode](./docs/secure-mode.md) - Ephemeral key signing
- [Two-Factor Authentication](./docs/two-factor-auth.md) - TOTP and PIN setup
- [Guardian Recovery](./docs/guardian-recovery.md) - Social recovery setup
- [React Integration](./docs/react-integration.md) - Hooks and context usage
- [API Reference](./docs/api-reference.md) - Complete API documentation

## License

MIT
