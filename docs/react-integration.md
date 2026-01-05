# React Integration

Kentucky Signer Viem provides React hooks and context for seamless integration with React applications.

## Installation

```bash
npm install kentucky-signer-viem viem
```

## Provider Setup

Wrap your application with `KentuckySignerProvider`:

```tsx
import { KentuckySignerProvider } from 'kentucky-signer-viem/react'

function App() {
  return (
    <KentuckySignerProvider
      baseUrl="https://signer.example.com"
      defaultChainId={1}
      persistSession={true}
      useEphemeralKeys={false}
    >
      <YourApp />
    </KentuckySignerProvider>
  )
}
```

### Provider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseUrl` | `string` | Required | Kentucky Signer API URL |
| `defaultChainId` | `number` | `1` | Default EVM chain ID |
| `persistSession` | `boolean` | `true` | Persist session to localStorage |
| `storageKeyPrefix` | `string` | `'kentucky_signer'` | LocalStorage key prefix |
| `useEphemeralKeys` | `boolean` | `false` | Enable secure mode by default |

## Core Hook: useKentuckySigner

The primary hook for accessing authentication state and actions.

```tsx
import { useKentuckySigner } from 'kentucky-signer-viem/react'

function MyComponent() {
  const {
    // State
    isAuthenticated,
    isAuthenticating,
    session,
    account,
    error,
    ephemeralKeyBound,
    secureMode,
    persistEphemeralKeys,

    // 2FA State
    twoFactorPrompt,

    // Actions
    authenticate,
    authenticatePassword,
    logout,
    refreshSession,
    clearError,
    setSecureMode,
    setPersistEphemeralKeys,
    getEphemeralPublicKey,
    submit2FA,
    cancel2FA,
  } = useKentuckySigner()

  // ...
}
```

### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `isAuthenticated` | `boolean` | Whether user is logged in |
| `isAuthenticating` | `boolean` | Whether auth is in progress |
| `session` | `AuthSession \| null` | Current session object |
| `account` | `KentuckySignerAccount \| null` | Viem-compatible account |
| `error` | `Error \| null` | Last error that occurred |
| `ephemeralKeyBound` | `boolean` | Whether ephemeral key is bound |
| `secureMode` | `boolean` | Whether secure mode is enabled |
| `persistEphemeralKeys` | `boolean` | Whether keys persist in IndexedDB |
| `twoFactorPrompt` | `TwoFactorPromptState` | 2FA prompt state |

### Actions

| Action | Description |
|--------|-------------|
| `authenticate(accountId, options?)` | Authenticate with passkey |
| `authenticatePassword(accountId, password)` | Authenticate with password |
| `logout()` | Clear session and logout |
| `refreshSession()` | Manually refresh session |
| `clearError()` | Clear error state |
| `setSecureMode(enabled)` | Toggle secure mode |
| `setPersistEphemeralKeys(enabled)` | Toggle key persistence |
| `getEphemeralPublicKey()` | Get public key for external auth |
| `submit2FA(codes)` | Submit 2FA codes |
| `cancel2FA()` | Cancel 2FA prompt |

## Authentication Examples

### Passkey Login

```tsx
function PasskeyLogin() {
  const { authenticate, isAuthenticating, error, clearError } = useKentuckySigner()
  const [accountId, setAccountId] = useState('')

  const handleLogin = async () => {
    clearError()
    try {
      await authenticate(accountId)
    } catch (err) {
      // Error is also available via `error` state
    }
  }

  return (
    <div>
      <input
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        placeholder="Account ID"
      />
      <button onClick={handleLogin} disabled={isAuthenticating}>
        {isAuthenticating ? 'Authenticating...' : 'Login with Passkey'}
      </button>
      {error && <p className="error">{error.message}</p>}
    </div>
  )
}
```

### Password Login

```tsx
function PasswordLogin() {
  const { authenticatePassword, isAuthenticating, error } = useKentuckySigner()
  const [accountId, setAccountId] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async () => {
    await authenticatePassword(accountId, password)
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleLogin() }}>
      <input
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        placeholder="Account ID"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit" disabled={isAuthenticating}>
        Login with Password
      </button>
    </form>
  )
}
```

### Using usePasskeyAuth Hook

A convenience hook for passkey authentication flow:

```tsx
import { usePasskeyAuth } from 'kentucky-signer-viem/react'

function PasskeyLoginSimple() {
  const { login, isLoading, error, clearError } = usePasskeyAuth()
  const [accountId, setAccountId] = useState('')

  return (
    <div>
      <input
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        placeholder="Account ID"
      />
      <button onClick={() => login(accountId)} disabled={isLoading}>
        {isLoading ? 'Authenticating...' : 'Login'}
      </button>
    </div>
  )
}
```

## Account and Wallet Hooks

### useKentuckySignerAccount

Get the current account:

```tsx
import { useKentuckySignerAccount } from 'kentucky-signer-viem/react'

function AccountDisplay() {
  const account = useKentuckySignerAccount()

  if (!account) {
    return <p>Not connected</p>
  }

  return (
    <div>
      <p>Address: {account.address}</p>
      <p>Account ID: {account.accountId}</p>
    </div>
  )
}
```

### useWalletClient

Create a Viem WalletClient:

```tsx
import { useWalletClient } from 'kentucky-signer-viem/react'
import { mainnet } from 'viem/chains'
import { parseEther } from 'viem'

function SendTransaction() {
  const walletClient = useWalletClient({
    chain: mainnet,
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY', // Optional
  })

  const sendTx = async () => {
    if (!walletClient) return

    const hash = await walletClient.sendTransaction({
      to: '0x...',
      value: parseEther('0.1'),
    })

    console.log('Transaction:', hash)
  }

  return (
    <button onClick={sendTx} disabled={!walletClient}>
      Send ETH
    </button>
  )
}
```

### useAddress

Get the connected address:

```tsx
import { useAddress } from 'kentucky-signer-viem/react'

function AddressDisplay() {
  const address = useAddress()

  return address ? (
    <span>{address}</span>
  ) : (
    <span>Not connected</span>
  )
}
```

### useIsReady

Check if signer is ready:

```tsx
import { useIsReady } from 'kentucky-signer-viem/react'

function ActionButton() {
  const isReady = useIsReady()

  return (
    <button disabled={!isReady}>
      Sign Transaction
    </button>
  )
}
```

## Signing Hooks

### useSignMessage

Sign messages with loading state:

```tsx
import { useSignMessage } from 'kentucky-signer-viem/react'

function SignMessageDemo() {
  const { signMessage, isLoading, error, isAvailable } = useSignMessage()
  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState('')

  const handleSign = async () => {
    try {
      const sig = await signMessage(message)
      setSignature(sig)
    } catch (err) {
      // error state is also updated
    }
  }

  return (
    <div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message to sign"
      />
      <button onClick={handleSign} disabled={isLoading || !isAvailable}>
        {isLoading ? 'Signing...' : 'Sign Message'}
      </button>
      {signature && <pre>{signature}</pre>}
      {error && <p className="error">{error.message}</p>}
    </div>
  )
}
```

### useSignTypedData

Sign EIP-712 typed data:

```tsx
import { useSignTypedData } from 'kentucky-signer-viem/react'

function SignTypedDataDemo() {
  const { signTypedData, isLoading, error, isAvailable } = useSignTypedData()

  const handleSign = async () => {
    const signature = await signTypedData({
      domain: {
        name: 'My App',
        version: '1',
        chainId: 1,
        verifyingContract: '0x...',
      },
      types: {
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' },
        ],
      },
      primaryType: 'Person',
      message: {
        name: 'Alice',
        wallet: '0x...',
      },
    })

    console.log('Signature:', signature)
  }

  return (
    <button onClick={handleSign} disabled={isLoading || !isAvailable}>
      Sign Typed Data
    </button>
  )
}
```

## Two-Factor Authentication

Handle 2FA prompts in your app:

```tsx
import { useKentuckySigner } from 'kentucky-signer-viem/react'
import { TwoFactorCodes } from 'kentucky-signer-viem'

function App() {
  const { twoFactorPrompt, submit2FA, cancel2FA } = useKentuckySigner()

  return (
    <div>
      <MainContent />

      {/* 2FA Modal - shown automatically when needed */}
      {twoFactorPrompt.isVisible && (
        <TwoFactorModal
          totpRequired={twoFactorPrompt.totpRequired}
          pinRequired={twoFactorPrompt.pinRequired}
          pinLength={twoFactorPrompt.pinLength}
          onSubmit={(codes: TwoFactorCodes) => submit2FA(codes)}
          onCancel={() => cancel2FA()}
        />
      )}
    </div>
  )
}
```

### TwoFactorPromptState

```typescript
interface TwoFactorPromptState {
  isVisible: boolean    // Whether to show 2FA prompt
  totpRequired: boolean // Whether TOTP code is needed
  pinRequired: boolean  // Whether PIN is needed
  pinLength: number     // Expected PIN length (4 or 6)
}
```

## Secure Mode Controls

Toggle secure mode and key persistence:

```tsx
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
      <h3>Security Settings</h3>

      <label>
        <input
          type="checkbox"
          checked={secureMode}
          onChange={(e) => setSecureMode(e.target.checked)}
        />
        Secure Mode (Ephemeral Key Signing)
      </label>

      {secureMode && (
        <>
          <p>
            Status: {ephemeralKeyBound ? 'Key bound to session' : 'Key not bound'}
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

## Complete Example

```tsx
import { useState } from 'react'
import {
  KentuckySignerProvider,
  useKentuckySigner,
  useWalletClient,
  useSignMessage,
} from 'kentucky-signer-viem/react'
import { mainnet } from 'viem/chains'

function App() {
  return (
    <KentuckySignerProvider
      baseUrl={import.meta.env.VITE_SIGNER_URL}
      defaultChainId={1}
      persistSession={true}
    >
      <Main />
    </KentuckySignerProvider>
  )
}

function Main() {
  const {
    isAuthenticated,
    isAuthenticating,
    account,
    authenticate,
    logout,
    twoFactorPrompt,
    submit2FA,
    cancel2FA,
  } = useKentuckySigner()

  const [accountId, setAccountId] = useState('')

  if (isAuthenticating) {
    return <div>Authenticating...</div>
  }

  if (!isAuthenticated) {
    return (
      <div>
        <input
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          placeholder="Account ID"
        />
        <button onClick={() => authenticate(accountId)}>
          Login with Passkey
        </button>
      </div>
    )
  }

  return (
    <div>
      <header>
        <span>Connected: {account?.address}</span>
        <button onClick={logout}>Logout</button>
      </header>

      <Dashboard />

      {twoFactorPrompt.isVisible && (
        <TwoFactorModal
          {...twoFactorPrompt}
          onSubmit={submit2FA}
          onCancel={cancel2FA}
        />
      )}
    </div>
  )
}

function Dashboard() {
  const { signMessage, isLoading } = useSignMessage()
  const walletClient = useWalletClient({ chain: mainnet })
  const [signature, setSignature] = useState('')

  const handleSign = async () => {
    const sig = await signMessage('Hello, World!')
    setSignature(sig)
  }

  return (
    <div>
      <h2>Dashboard</h2>

      <section>
        <h3>Sign Message</h3>
        <button onClick={handleSign} disabled={isLoading}>
          {isLoading ? 'Signing...' : 'Sign "Hello, World!"'}
        </button>
        {signature && <pre>{signature}</pre>}
      </section>
    </div>
  )
}

function TwoFactorModal({ totpRequired, pinRequired, pinLength, onSubmit, onCancel }) {
  const [totp, setTotp] = useState('')
  const [pin, setPin] = useState('')

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Two-Factor Authentication</h3>

        {totpRequired && (
          <input
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            placeholder="TOTP Code"
            maxLength={6}
          />
        )}

        {pinRequired && (
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={`${pinLength}-digit PIN`}
            maxLength={pinLength}
          />
        )}

        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => onSubmit({ totpCode: totp, pin })}>
          Verify
        </button>
      </div>
    </div>
  )
}

export default App
```

## TypeScript Types

All hooks and components are fully typed:

```typescript
import type {
  AuthSession,
  KentuckySignerAccount,
  TwoFactorPromptState,
  TwoFactorCodes,
  KentuckySignerState,
  KentuckySignerActions,
  KentuckySignerContextValue,
} from 'kentucky-signer-viem/react'
```
