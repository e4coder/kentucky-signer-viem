# kentucky-signer-viem

A custom Viem account integration for the Kentucky Signer service, enabling EVM transaction signing using passkey (WebAuthn) or password authentication.

## Features

- Custom Viem account backed by Kentucky Signer
- Passkey (WebAuthn) authentication for browser environments
- Password authentication for browser and Node.js environments
- JWT token authentication for Node.js/server environments
- Account creation with passkey or password
- React hooks and context for easy integration
- TypeScript support with full type definitions
- Session management with automatic refresh

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
console.log('Transaction hash:', hash)
```

### Password Authentication (Browser or Node.js)

```typescript
import { createWalletClient, http, parseEther } from 'viem'
import { mainnet } from 'viem/chains'
import {
  createKentuckySignerAccount,
  authenticateWithPassword,
  createAccountWithPassword,
} from 'kentucky-signer-viem'

// Option 1: Create a new account with password
const newAccount = await createAccountWithPassword({
  baseUrl: 'https://signer.example.com',
  password: 'your-secure-password',
  confirmation: 'your-secure-password',
})
console.log('Account ID:', newAccount.account_id)
console.log('EVM Address:', newAccount.addresses.evm)

// Option 2: Authenticate with existing account
const session = await authenticateWithPassword({
  baseUrl: 'https://signer.example.com',
  accountId: newAccount.account_id,
  password: 'your-secure-password',
})

// Create Kentucky Signer account
const account = createKentuckySignerAccount({
  config: {
    baseUrl: 'https://signer.example.com',
    accountId: session.accountId,
  },
  session,
  defaultChainId: 1,
})

// Use with Viem
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY'),
})

const hash = await walletClient.sendTransaction({
  to: '0x...',
  value: parseEther('0.1'),
})
```

### Node.js (with JWT Token)

```typescript
import { createWalletClient, http, parseEther } from 'viem'
import { mainnet } from 'viem/chains'
import { createServerAccount } from 'kentucky-signer-viem'

// Create account with existing JWT token
const account = createServerAccount(
  'https://signer.example.com',
  'account_id_hex',
  'jwt_token',
  '0xYourEvmAddress',
  1 // chainId
)

// Use with Viem
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http('https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY'),
})

const hash = await walletClient.sendTransaction({
  to: '0x...',
  value: parseEther('0.1'),
})
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
    >
      <YourApp />
    </KentuckySignerProvider>
  )
}
```

### Authentication Hook

```tsx
import { useKentuckySigner, usePasskeyAuth } from 'kentucky-signer-viem/react'

function LoginButton() {
  const { isAuthenticated, account } = useKentuckySigner()
  const { login, isLoading, error } = usePasskeyAuth()
  const [accountId, setAccountId] = useState('')

  if (isAuthenticated && account) {
    return <div>Connected: {account.address}</div>
  }

  return (
    <div>
      <input
        placeholder="Account ID"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
      />
      <button onClick={() => login(accountId)} disabled={isLoading}>
        {isLoading ? 'Authenticating...' : 'Login with Passkey'}
      </button>
      {error && <div className="error">{error.message}</div>}
    </div>
  )
}
```

### Wallet Client Hook

```tsx
import { useWalletClient, useIsReady } from 'kentucky-signer-viem/react'
import { mainnet } from 'viem/chains'
import { parseEther } from 'viem'

function SendTransaction() {
  const isReady = useIsReady()
  const walletClient = useWalletClient({
    chain: mainnet,
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
  })

  async function send() {
    if (!walletClient) return

    const hash = await walletClient.sendTransaction({
      to: '0x...',
      value: parseEther('0.1'),
    })
    console.log('Transaction hash:', hash)
  }

  return (
    <button onClick={send} disabled={!isReady}>
      Send 0.1 ETH
    </button>
  )
}
```

### Sign Message Hook

```tsx
import { useSignMessage } from 'kentucky-signer-viem/react'

function SignMessageDemo() {
  const { signMessage, isLoading, isAvailable } = useSignMessage()
  const [signature, setSignature] = useState('')

  async function sign() {
    const sig = await signMessage('Hello, Kentucky Signer!')
    setSignature(sig)
  }

  return (
    <div>
      <button onClick={sign} disabled={isLoading || !isAvailable}>
        {isLoading ? 'Signing...' : 'Sign Message'}
      </button>
      {signature && <pre>{signature}</pre>}
    </div>
  )
}
```

## API Reference

### Core Functions

#### `createKentuckySignerAccount(options)`

Creates a custom Viem account backed by Kentucky Signer.

```typescript
const account = createKentuckySignerAccount({
  config: {
    baseUrl: string,      // Kentucky Signer API URL
    accountId: string,    // 64-char hex account ID
  },
  session: AuthSession,   // Authenticated session
  defaultChainId?: number, // Default chain ID (default: 1)
  onSessionExpired?: () => Promise<AuthSession>, // Session refresh callback
})
```

#### `authenticateWithPasskey(options)`

Authenticates using WebAuthn passkey (browser only).

```typescript
const session = await authenticateWithPasskey({
  baseUrl: string,           // Kentucky Signer API URL
  accountId: string,         // Account ID to authenticate
  rpId?: string,             // WebAuthn Relying Party ID
  allowCredentials?: string[], // Allowed credential IDs
})
```

#### `authenticateWithPassword(options)`

Authenticates using password (works in browser and Node.js).

```typescript
const session = await authenticateWithPassword({
  baseUrl: string,     // Kentucky Signer API URL
  accountId: string,   // Account ID to authenticate
  password: string,    // Account password
})
```

#### `createAccountWithPassword(options)`

Creates a new account with password authentication.

```typescript
const account = await createAccountWithPassword({
  baseUrl: string,       // Kentucky Signer API URL
  password: string,      // Password (8-128 characters)
  confirmation: string,  // Must match password
})
// Returns: { account_id, addresses: { evm, bitcoin, solana } }
```

#### `authenticateWithToken(baseUrl, accountId, token, expiresAt?)`

Creates a session from an existing JWT token (Node.js compatible).

```typescript
const session = await authenticateWithToken(
  'https://signer.example.com',
  'account_id',
  'jwt_token',
  Date.now() + 3600000 // Optional expiration
)
```

### Client Class

#### `KentuckySignerClient`

Low-level API client for Kentucky Signer.

```typescript
const client = new KentuckySignerClient({ baseUrl: 'https://signer.example.com' })

// Get challenge for authentication
const challenge = await client.getChallenge(accountId)

// Authenticate with passkey credential
const auth = await client.authenticatePasskey(accountId, credential)

// Sign EVM transaction
const signature = await client.signEvmTransaction(
  { tx_hash: '0x...', chain_id: 1 },
  jwtToken
)

// Get account info
const info = await client.getAccountInfo(accountId, jwtToken)
```

### React Hooks

| Hook | Description |
|------|-------------|
| `useKentuckySigner()` | Access auth state and actions |
| `useKentuckySignerAccount()` | Get the current account |
| `useWalletClient(options)` | Create a Viem WalletClient |
| `usePasskeyAuth()` | Authentication flow with loading state |
| `useSignMessage()` | Sign messages with loading state |
| `useSignTypedData()` | Sign EIP-712 typed data |
| `useIsReady()` | Check if signer is ready |
| `useAddress()` | Get connected address |

### Types

```typescript
interface AuthSession {
  token: string        // JWT access token
  accountId: string    // Account ID
  evmAddress: Address  // EVM address
  btcAddress?: string  // Bitcoin address
  solAddress?: string  // Solana address
  expiresAt: number    // Expiration timestamp (ms)
}

interface KentuckySignerConfig {
  baseUrl: string      // API URL
  accountId: string    // Account ID
}
```

## Session Management

Sessions are automatically managed:

- **Browser**: Sessions can be persisted to localStorage
- **Auto-refresh**: Sessions are refreshed before expiration
- **Expiration handling**: Provide `onSessionExpired` callback for custom handling

```typescript
const account = createKentuckySignerAccount({
  config: { baseUrl, accountId },
  session,
  onSessionExpired: async () => {
    // Re-authenticate or refresh token
    return await authenticateWithPasskey({ baseUrl, accountId })
  },
})
```

## Error Handling

```typescript
import { KentuckySignerError } from 'kentucky-signer-viem'

try {
  await authenticate(accountId)
} catch (error) {
  if (error instanceof KentuckySignerError) {
    console.error('Code:', error.code)
    console.error('Message:', error.message)
    console.error('Details:', error.details)
  }
}
```

Common error codes:
- `WEBAUTHN_NOT_AVAILABLE` - WebAuthn not supported
- `USER_CANCELLED` - User cancelled authentication
- `SESSION_EXPIRED` - JWT token expired
- `UNAUTHORIZED` - Invalid or missing token
- `NOT_FOUND` - Account not found
- `PASSWORD_MISMATCH` - Password and confirmation don't match
- `INVALID_PASSWORD` - Password doesn't meet requirements (8-128 chars)

## License

MIT
