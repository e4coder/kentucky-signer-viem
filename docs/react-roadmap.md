# React Integration Roadmap

This document outlines planned improvements to make kentucky-signer-viem easier to integrate in React applications.

## Current State

### What's Built (Strong Foundation)

- **8 Custom Hooks**:
  - `useKentuckySigner()` - Main auth hook with state + actions
  - `useKentuckySignerAccount()` - Direct account access
  - `useWalletClient()` - Viem WalletClient factory
  - `usePasskeyAuth()` - Passkey login flow with loading state
  - `useSignMessage()` - Message signing with loading state
  - `useSignTypedData()` - EIP-712 signing with loading state
  - `useIsReady()` - Quick readiness check
  - `useAddress()` - Simple address getter

- **Provider & Context**: Full session/auth state management
- **2FA Support**: TOTP + PIN with modal-based prompt system
- **Session Management**: Auto-refresh, persistence options
- **TypeScript**: Full type definitions

### What's Missing

| Gap | Impact | Description |
|-----|--------|-------------|
| No UI Components | HIGH | Developers must build LoginPanel, TwoFactorModal, etc. from scratch |
| No ConnectButton | HIGH | Unlike RainbowKit, no single component for auth flow |
| No useSendTransaction | MEDIUM | Developers wire WalletClient manually |
| No pre-built 2FA modal | MEDIUM | State exists but no component provided |
| No quick-start template | MEDIUM | 15+ files to copy from demo app |

---

## Planned Components

### Priority 1: Core Components (High Impact)

#### 1.1 ConnectButton

A single component that handles the entire auth flow.

```tsx
import { ConnectButton } from 'kentucky-signer-viem/react'

function App() {
  return (
    <KentuckySignerProvider baseUrl="https://signer.example.com">
      <ConnectButton />
    </KentuckySignerProvider>
  )
}
```

**Features:**
- Shows "Connect" when not authenticated
- Shows address + logout when authenticated
- Opens AuthModal on click
- Customizable via render props or className

**Props:**
```typescript
interface ConnectButtonProps {
  // Appearance
  label?: string              // Default: "Connect"
  showAddress?: boolean       // Default: true
  addressFormat?: 'full' | 'truncated'  // Default: 'truncated'

  // Customization
  className?: string
  children?: (props: ConnectButtonRenderProps) => ReactNode

  // Callbacks
  onConnect?: () => void
  onDisconnect?: () => void
}
```

#### 1.2 AuthModal

Modal for passkey/password authentication and account creation.

```tsx
import { AuthModal } from 'kentucky-signer-viem/react'

function App() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)}>Login</button>
      <AuthModal
        open={open}
        onClose={() => setOpen(false)}
        allowCreate={true}
        allowPassword={true}
        allowPasskey={true}
      />
    </>
  )
}
```

**Features:**
- Tab/mode switching: Login vs Create Account
- Passkey authentication with WebAuthn
- Password authentication
- Account ID input with validation
- Loading states and error handling
- Recovery link

**Props:**
```typescript
interface AuthModalProps {
  open: boolean
  onClose: () => void

  // Auth options
  allowCreate?: boolean       // Show create account tab
  allowPassword?: boolean     // Enable password auth
  allowPasskey?: boolean      // Enable passkey auth (default: true)
  allowRecovery?: boolean     // Show recovery link

  // Customization
  title?: string
  className?: string

  // Callbacks
  onSuccess?: (session: AuthSession) => void
  onError?: (error: Error) => void
}
```

#### 1.3 TwoFactorModal

Pre-built 2FA verification modal.

```tsx
import { TwoFactorModal } from 'kentucky-signer-viem/react'

function App() {
  const { twoFactorPrompt, submit2FA, cancel2FA } = useKentuckySigner()

  return (
    <TwoFactorModal
      open={twoFactorPrompt.isVisible}
      totpRequired={twoFactorPrompt.totpRequired}
      pinRequired={twoFactorPrompt.pinRequired}
      pinLength={twoFactorPrompt.pinLength}
      onSubmit={submit2FA}
      onCancel={cancel2FA}
    />
  )
}
```

**Features:**
- TOTP input with 6-digit formatting
- PIN input with configurable length (4 or 6)
- Auto-focus and keyboard navigation
- Loading state during verification
- Error display

**Props:**
```typescript
interface TwoFactorModalProps {
  open: boolean
  totpRequired: boolean
  pinRequired: boolean
  pinLength: number

  onSubmit: (codes: { totpCode?: string; pin?: string }) => void
  onCancel: () => void

  // Customization
  title?: string
  className?: string
}
```

#### 1.4 AccountMenu

Dropdown menu showing connected account info.

```tsx
import { AccountMenu } from 'kentucky-signer-viem/react'

function Header() {
  return (
    <nav>
      <AccountMenu
        showBalance={true}
        onSettings={() => navigate('/settings')}
      />
    </nav>
  )
}
```

**Features:**
- Address display (truncated)
- Copy address button
- Logout option
- Optional balance display
- Settings link

---

### Priority 2: Higher-Level Hooks

#### 2.1 useSendTransaction

Simplified transaction sending with built-in state management.

```tsx
import { useSendTransaction } from 'kentucky-signer-viem/react'

function SendForm() {
  const { sendTransaction, isPending, isSuccess, hash, error, reset } = useSendTransaction()

  const handleSend = async () => {
    await sendTransaction({
      to: '0x...',
      value: parseEther('0.1'),
    })
  }

  return (
    <div>
      <button onClick={handleSend} disabled={isPending}>
        {isPending ? 'Sending...' : 'Send'}
      </button>
      {isSuccess && <p>TX: {hash}</p>}
      {error && <p>Error: {error.message}</p>}
    </div>
  )
}
```

**Returns:**
```typescript
interface UseSendTransactionReturn {
  sendTransaction: (tx: TransactionRequest) => Promise<Hash>
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  hash?: Hash
  error?: Error
  reset: () => void
}
```

#### 2.2 useContractWrite

For contract interactions.

```tsx
import { useContractWrite } from 'kentucky-signer-viem/react'

function MintButton() {
  const { write, isPending } = useContractWrite({
    address: '0x...',
    abi: erc721Abi,
    functionName: 'mint',
  })

  return (
    <button onClick={() => write({ args: [tokenId] })} disabled={isPending}>
      Mint
    </button>
  )
}
```

#### 2.3 useContractRead

For reading contract state.

```tsx
import { useContractRead } from 'kentucky-signer-viem/react'

function Balance() {
  const { data, isLoading } = useContractRead({
    address: '0x...',
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  })

  if (isLoading) return <span>Loading...</span>
  return <span>{formatUnits(data, 18)} TOKENS</span>
}
```

---

### Priority 3: Utility Components

#### 3.1 TwoFactorSetup

Component for setting up 2FA (TOTP + PIN).

```tsx
import { TwoFactorSetup } from 'kentucky-signer-viem/react'

function SecuritySettings() {
  return (
    <TwoFactorSetup
      onTOTPEnabled={() => toast('TOTP enabled!')}
      onPINEnabled={() => toast('PIN enabled!')}
    />
  )
}
```

#### 3.2 GuardianManager

Component for managing guardians.

```tsx
import { GuardianManager } from 'kentucky-signer-viem/react'

function RecoverySettings() {
  return <GuardianManager maxGuardians={3} />
}
```

#### 3.3 PasskeyManager

Component for managing passkeys.

```tsx
import { PasskeyManager } from 'kentucky-signer-viem/react'

function PasskeySettings() {
  return <PasskeyManager allowRemoveOwner={false} />
}
```

#### 3.4 RecoveryFlow

Full account recovery wizard.

```tsx
import { RecoveryFlow } from 'kentucky-signer-viem/react'

function RecoverPage() {
  return (
    <RecoveryFlow
      onComplete={() => navigate('/dashboard')}
      onCancel={() => navigate('/')}
    />
  )
}
```

---

## Implementation Plan

### Phase 1: Core Components
1. [ ] Create `src/react/components/` directory
2. [ ] Implement `ConnectButton`
3. [ ] Implement `AuthModal`
4. [ ] Implement `TwoFactorModal`
5. [ ] Export from `kentucky-signer-viem/react`
6. [ ] Update documentation

### Phase 2: Transaction Hooks
1. [ ] Implement `useSendTransaction`
2. [ ] Implement `useContractWrite`
3. [ ] Implement `useContractRead`
4. [ ] Add examples to documentation

### Phase 3: Settings Components
1. [ ] Implement `AccountMenu`
2. [ ] Implement `TwoFactorSetup`
3. [ ] Implement `PasskeyManager`
4. [ ] Implement `GuardianManager`

### Phase 4: Advanced Flows
1. [ ] Implement `RecoveryFlow`
2. [ ] Create Storybook for component demos
3. [ ] Create `create-kentucky-app` template

---

## Design Principles

### 1. Headless by Default

Components should be unstyled/minimally styled, allowing full customization:

```tsx
// Unstyled - user provides all styles
<ConnectButton className="my-custom-button" />

// Or use render props for full control
<ConnectButton>
  {({ isConnected, address, connect, disconnect }) => (
    <MyCustomButton onClick={isConnected ? disconnect : connect}>
      {isConnected ? address : 'Connect'}
    </MyCustomButton>
  )}
</ConnectButton>
```

### 2. Composable

Components should work independently or together:

```tsx
// Use ConnectButton alone
<ConnectButton />

// Or compose your own flow
<AuthModal open={showLogin} onClose={() => setShowLogin(false)} />
<TwoFactorModal {...twoFactorProps} />
<AccountMenu />
```

### 3. TypeScript First

All components fully typed with exported prop interfaces:

```typescript
import type {
  ConnectButtonProps,
  AuthModalProps,
  TwoFactorModalProps
} from 'kentucky-signer-viem/react'
```

### 4. Accessible

Follow WAI-ARIA patterns:
- Proper focus management in modals
- Keyboard navigation
- Screen reader support
- Reduced motion support

---

## Comparison: Current vs Target

| Feature | Current | Target (wagmi/RainbowKit-like) |
|---------|---------|-------------------------------|
| Auth Flow | Manual (build LoginPanel) | `<ConnectButton />` |
| 2FA Prompt | Manual (build modal) | `<TwoFactorModal />` |
| Send TX | `useWalletClient()` + manual | `useSendTransaction()` |
| Contract Write | Manual viem | `useContractWrite()` |
| Account Display | Manual | `<AccountMenu />` |
| Settings UI | Copy from demo | `<TwoFactorSetup />`, etc. |

---

## Notes

- All components will use the existing `KentuckySignerProvider` context
- No additional dependencies required (just React)
- Components will be tree-shakeable
- SSR-safe (no window access during render)
