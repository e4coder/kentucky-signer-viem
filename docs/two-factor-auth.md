# Two-Factor Authentication (2FA)

Kentucky Signer supports two-factor authentication to add an extra layer of security for signing operations. When enabled, signing transactions requires verification with TOTP codes (from an authenticator app) and/or a PIN.

## Overview

| Method | Description | Use Case |
|--------|-------------|----------|
| TOTP | Time-based One-Time Password | Authenticator apps (Google Authenticator, Authy, 1Password) |
| PIN | 4 or 6 digit numeric code | Quick verification, offline capable |

## TOTP Setup

### Step 1: Start Setup

```typescript
import { KentuckySignerClient } from 'kentucky-signer-viem'

const client = new KentuckySignerClient({
  baseUrl: 'https://signer.example.com'
})

// Start TOTP setup - get QR code URI and secret
const setup = await client.setupTOTP(token)

console.log('QR Code URI:', setup.uri)
// otpauth://totp/KentuckySigner:account@example.com?secret=BASE32SECRET&issuer=KentuckySigner

console.log('Manual Entry Secret:', setup.secret)
// BASE32ENCODEDSECRETHEXSTRING
```

### Step 2: Display QR Code

Generate a QR code image from the URI:

```tsx
// Using a QR code library like qrcode.react
import QRCode from 'qrcode.react'

function TOTPSetup({ uri, secret }) {
  return (
    <div>
      <h3>Scan QR Code</h3>
      <QRCode value={uri} size={200} />

      <h3>Or Enter Manually</h3>
      <code>{secret}</code>
    </div>
  )
}
```

Or use an external QR code service:

```typescript
const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.uri)}`
```

### Step 3: Verify and Enable

```typescript
// User enters the 6-digit code from their authenticator app
const code = '123456'

await client.enableTOTP(code, token)

console.log('TOTP enabled successfully!')
```

### Disable TOTP

```typescript
// Requires current TOTP code
const code = '654321'
await client.disableTOTP(code, token)
```

## PIN Setup

### Enable PIN

```typescript
// Setup a 6-digit PIN
await client.setupPIN('123456', token)

// Or a 4-digit PIN
await client.setupPIN('1234', token)
```

### PIN Requirements

- Must be all digits (0-9)
- Either 4 or 6 digits
- Stored securely using PBKDF2-SHA256 (310,000 iterations)

### Disable PIN

```typescript
// Requires current PIN
await client.disablePIN('123456', token)
```

## Check 2FA Status

```typescript
const status = await client.get2FAStatus(token)

console.log('TOTP Enabled:', status.totp_enabled)
console.log('PIN Enabled:', status.pin_enabled)
console.log('PIN Length:', status.pin_length) // 4 or 6, or 0 if not set

// Example response:
// { totp_enabled: true, pin_enabled: false, pin_length: 0 }
```

## Signing with 2FA

When 2FA is enabled, signing operations require the codes. The library handles this automatically through callbacks.

### Automatic 2FA Handling (Recommended)

The account automatically detects when 2FA is required and calls your callback:

```typescript
import { createKentuckySignerAccount, TwoFactorCodes } from 'kentucky-signer-viem'

const account = createKentuckySignerAccount({
  config: { baseUrl, accountId },
  session,
  on2FARequired: async (requirements) => {
    // Called when 2FA is needed
    console.log('TOTP required:', requirements.totpRequired)
    console.log('PIN required:', requirements.pinRequired)
    console.log('PIN length:', requirements.pinLength)

    // Show your 2FA UI and get codes from user
    const codes = await showTwoFactorDialog(requirements)

    // Return the codes (or null to cancel)
    return codes // { totpCode: '123456', pin: '654321' }
  },
})

// Signing will automatically prompt for 2FA if needed
const signature = await account.signMessage({ message: 'Hello' })
```

### Manual 2FA Handling

For more control, use the client directly:

```typescript
const client = new KentuckySignerClient({ baseUrl })

// Sign with 2FA codes
const response = await client.signEvmTransactionWith2FA({
  tx_hash: '0x...',
  totp_code: '123456',
  pin: '654321',
}, token)
```

## React Integration

### 2FA State in Context

```tsx
import { useKentuckySigner } from 'kentucky-signer-viem/react'

function App() {
  const { twoFactorPrompt, submit2FA, cancel2FA } = useKentuckySigner()

  // twoFactorPrompt contains:
  // - isVisible: boolean - whether prompt should be shown
  // - totpRequired: boolean - whether TOTP code is needed
  // - pinRequired: boolean - whether PIN is needed
  // - pinLength: number - expected PIN length (4 or 6)

  if (twoFactorPrompt.isVisible) {
    return (
      <TwoFactorModal
        {...twoFactorPrompt}
        onSubmit={submit2FA}
        onCancel={cancel2FA}
      />
    )
  }

  return <MainApp />
}
```

### 2FA Modal Component

```tsx
import { useState } from 'react'
import { TwoFactorCodes } from 'kentucky-signer-viem'

interface TwoFactorModalProps {
  totpRequired: boolean
  pinRequired: boolean
  pinLength: number
  onSubmit: (codes: TwoFactorCodes) => void
  onCancel: () => void
}

function TwoFactorModal({
  totpRequired,
  pinRequired,
  pinLength,
  onSubmit,
  onCancel,
}: TwoFactorModalProps) {
  const [totpCode, setTotpCode] = useState('')
  const [pin, setPin] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      totpCode: totpRequired ? totpCode : undefined,
      pin: pinRequired ? pin : undefined,
    })
  }

  return (
    <div className="modal">
      <h2>Two-Factor Authentication</h2>
      <form onSubmit={handleSubmit}>
        {totpRequired && (
          <div>
            <label>Authenticator Code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 6-digit code"
              autoFocus
            />
          </div>
        )}

        {pinRequired && (
          <div>
            <label>PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={pinLength}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder={`Enter ${pinLength}-digit PIN`}
            />
          </div>
        )}

        <div>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            type="submit"
            disabled={
              (totpRequired && totpCode.length !== 6) ||
              (pinRequired && pin.length !== pinLength)
            }
          >
            Verify
          </button>
        </div>
      </form>
    </div>
  )
}
```

### 2FA Settings Component

```tsx
import { useState, useEffect } from 'react'
import { useKentuckySigner } from 'kentucky-signer-viem/react'
import { KentuckySignerClient, TwoFactorStatusResponse } from 'kentucky-signer-viem'

function TwoFactorSettings() {
  const { session } = useKentuckySigner()
  const [status, setStatus] = useState<TwoFactorStatusResponse | null>(null)
  const [setup, setSetup] = useState<{ uri: string; secret: string } | null>(null)

  const client = new KentuckySignerClient({ baseUrl: 'https://signer.example.com' })

  useEffect(() => {
    if (session) {
      client.get2FAStatus(session.token).then(setStatus)
    }
  }, [session])

  const handleSetupTOTP = async () => {
    if (!session) return
    const result = await client.setupTOTP(session.token)
    setSetup(result)
  }

  const handleEnableTOTP = async (code: string) => {
    if (!session) return
    await client.enableTOTP(code, session.token)
    setSetup(null)
    const newStatus = await client.get2FAStatus(session.token)
    setStatus(newStatus)
  }

  // ... render UI
}
```

## Error Handling

### 2FA Required Error

When attempting to sign without providing required 2FA codes:

```typescript
try {
  await account.signMessage({ message: 'Hello' })
} catch (error) {
  if (error.code === '2FA_REQUIRED') {
    // 2FA is enabled but no callback was provided
    console.log('Please provide 2FA codes')
  }
}
```

### 2FA Cancelled

When the user cancels the 2FA prompt:

```typescript
try {
  await account.signMessage({ message: 'Hello' })
} catch (error) {
  if (error.code === '2FA_CANCELLED') {
    console.log('User cancelled 2FA verification')
  }
}
```

### Invalid Code

```typescript
try {
  await client.enableTOTP('000000', token)
} catch (error) {
  if (error.code === 'INVALID_CODE') {
    console.log('The TOTP code was incorrect')
  }
}
```

### Invalid PIN

```typescript
try {
  await client.setupPIN('12345', token) // Wrong length
} catch (error) {
  if (error.code === 'INVALID_PIN') {
    console.log('PIN must be 4 or 6 digits')
  }
}
```

## Security Best Practices

1. **Use Both Methods**: Enable both TOTP and PIN for maximum security
2. **Backup Codes**: Save your TOTP secret in a secure location
3. **Unique PIN**: Don't reuse PINs from other services
4. **Regular Rotation**: Consider rotating your PIN periodically
5. **Secure Entry**: Use password input fields for PIN entry

## TOTP Technical Details

- **Algorithm**: HMAC-SHA1 (RFC 6238 compliant)
- **Time Step**: 30 seconds
- **Digits**: 6
- **Tolerance**: 1 window (allows codes from 30 seconds before/after)
- **Secret Size**: 20 bytes (160 bits)

## PIN Technical Details

- **Hashing**: PBKDF2-SHA256
- **Iterations**: 310,000 (OWASP recommendation)
- **Salt**: 32 bytes (unique per account)
- **Output**: 32 bytes
