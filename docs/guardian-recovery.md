# Guardian Recovery

Guardian recovery allows you to designate trusted passkeys (guardians) who can help you recover access to your account if you lose your owner passkey.

## Overview

Guardian recovery implements a social recovery mechanism using WebAuthn passkeys:

1. **Add Guardians**: Register guardian passkeys (up to 3) on trusted devices
2. **Threshold**: 2 guardians must approve recovery (when you have 2+ guardians)
3. **Initiate Recovery**: Register a new owner passkey when locked out
4. **Guardian Approval**: Guardians sign their challenges with their passkeys
5. **Timelock**: Wait for the security timelock to expire
6. **Complete Recovery**: The new passkey becomes the owner passkey

## Adding Guardians

Guardians are WebAuthn passkeys registered on trusted devices (family member's phone, backup hardware key, etc.).

### Add a Guardian

```typescript
import { KentuckySignerClient, registerPasskey } from 'kentucky-signer-viem'

const client = new KentuckySignerClient({
  baseUrl: 'https://signer.example.com'
})

// On the guardian's device, register a passkey
const { attestationObject } = await registerPasskey({
  baseUrl: 'https://signer.example.com',
  rpId: 'signer.example.com',
  rpName: 'Kentucky Signer',
  username: 'guardian@example.com',
})

// Add the guardian passkey to your account
const result = await client.addGuardian({
  attestation_object: attestationObject,
  label: 'Mom\'s iPhone', // Optional human-readable label
}, token)

console.log(`Guardian added at index ${result.guardian_index}`)
console.log(`Total guardians: ${result.guardian_count}`)
```

### List Guardians

```typescript
const { guardians, guardian_count } = await client.getGuardians(token)

// Example response:
// guardians: [
//   { index: 1, label: "Mom's iPhone" },
//   { index: 2, label: "Hardware Key" },
// ]

console.log(`You have ${guardian_count} guardians`)
guardians.forEach(g => {
  console.log(`- Guardian ${g.index}: ${g.label}`)
})
```

### Remove a Guardian

```typescript
// Remove guardian at index 1
await client.removeGuardian(1, token)
```

**Note:** Cannot remove guardians during an active recovery.

## Recovery Process

### Step 1: Initiate Recovery

When you're locked out and need to recover your account, first register a new passkey that will become your new owner passkey:

```typescript
import { registerPasskey, KentuckySignerClient } from 'kentucky-signer-viem'

const client = new KentuckySignerClient({
  baseUrl: 'https://signer.example.com'
})

// Register a new passkey on your new device
const { attestationObject } = await registerPasskey({
  baseUrl: 'https://signer.example.com',
  rpId: 'signer.example.com',
  rpName: 'Kentucky Signer',
})

// Initiate recovery with the new passkey
// Note: This request doesn't require authentication
const recovery = await client.initiateRecovery(
  accountId,
  attestationObject,
  'New Owner Passkey' // Optional label
)

console.log('Guardian challenges:', recovery.challenges)
console.log('Total guardians:', recovery.guardian_count)
console.log('Required approvals:', recovery.threshold)
console.log('Timelock (seconds):', recovery.timelock_seconds)
```

### Step 2: Guardian Approval

Each guardian must sign their challenge using their passkey. The challenge is unique to each guardian.

```typescript
// On guardian's device
// They need to use WebAuthn to sign the challenge

// Get recovery status to see the challenges
const status = await client.getRecoveryStatus(accountId)

// Guardian at index 1 signs their challenge
const guardianIndex = 1
const challenge = status.guardian_challenges[guardianIndex - 1] // 0-indexed array

// Get WebAuthn credential for signing
const credential = await navigator.credentials.get({
  publicKey: {
    challenge: base64UrlDecode(challenge),
    rpId: 'signer.example.com',
    userVerification: 'preferred',
    timeout: 60000,
  }
}) as PublicKeyCredential

const response = credential.response as AuthenticatorAssertionResponse

// Submit guardian signature
await client.verifyGuardian({
  account_id: accountId,
  guardian_index: guardianIndex,
  authenticator_data: base64UrlEncode(response.authenticatorData),
  client_data_json: base64UrlEncode(response.clientDataJSON),
  signature: base64UrlEncode(response.signature),
})
```

### Step 3: Check Recovery Status

```typescript
const status = await client.getRecoveryStatus(accountId)

console.log('Recovery active:', status.recovery_active)
console.log('Verified:', `${status.verified_count}/${status.threshold}`)
console.log('Can complete:', status.can_complete)
console.log('Timelock remaining:', status.timelock_remaining, 'seconds')
console.log('Verified guardians:', status.verified_guardians) // [1, 2] = indices
```

### Step 4: Complete Recovery

Once enough guardians have approved AND the timelock has expired:

```typescript
const status = await client.getRecoveryStatus(accountId)

if (status.can_complete) {
  await client.completeRecovery(accountId)
  console.log('Recovery complete! You can now log in with your new passkey.')
} else if (status.verified_count >= status.threshold) {
  console.log(`Timelock: Wait ${status.timelock_remaining} more seconds`)
} else {
  console.log(`Need ${status.threshold - status.verified_count} more guardian approvals`)
}
```

### Cancel Recovery

If you regain access to your account, you can cancel the recovery:

```typescript
// Requires authentication with current owner passkey
await client.cancelRecovery(token)
```

## React Integration

### Guardian Management Component

```tsx
import { useState, useEffect } from 'react'
import { useKentuckySigner } from 'kentucky-signer-viem/react'
import { KentuckySignerClient, registerPasskey, GuardianInfo } from 'kentucky-signer-viem'

function GuardianManager() {
  const { session } = useKentuckySigner()
  const [guardians, setGuardians] = useState<GuardianInfo[]>([])
  const [label, setLabel] = useState('')
  const [loading, setLoading] = useState(false)

  const baseUrl = import.meta.env.VITE_SIGNER_URL
  const client = new KentuckySignerClient({ baseUrl })

  useEffect(() => {
    if (session) {
      loadGuardians()
    }
  }, [session])

  const loadGuardians = async () => {
    if (!session) return
    const { guardians } = await client.getGuardians(session.token)
    setGuardians(guardians)
  }

  const addGuardian = async () => {
    if (!session) return
    setLoading(true)

    try {
      // This triggers WebAuthn on the guardian's device
      const { attestationObject } = await registerPasskey({
        baseUrl,
        rpId: window.location.hostname,
        rpName: 'Kentucky Signer',
      })

      await client.addGuardian({
        attestation_object: attestationObject,
        label,
      }, session.token)

      setLabel('')
      await loadGuardians()
    } finally {
      setLoading(false)
    }
  }

  const removeGuardian = async (index: number) => {
    if (!session) return
    await client.removeGuardian(index, session.token)
    await loadGuardians()
  }

  return (
    <div>
      <h2>Guardians ({guardians.length}/3)</h2>

      <ul>
        {guardians.map(g => (
          <li key={g.index}>
            {g.label || `Guardian ${g.index}`}
            <button onClick={() => removeGuardian(g.index)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      {guardians.length < 3 && (
        <>
          <h3>Add Guardian</h3>
          <p>Register a passkey on a trusted device (guardian's phone, hardware key, etc.)</p>
          <input
            placeholder="Label (e.g., Mom's iPhone)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button onClick={addGuardian} disabled={loading}>
            {loading ? 'Registering...' : 'Register Guardian Passkey'}
          </button>
        </>
      )}
    </div>
  )
}
```

### Recovery Initiation Component

```tsx
import { useState } from 'react'
import { KentuckySignerClient, registerPasskey } from 'kentucky-signer-viem'

function InitiateRecovery() {
  const [accountId, setAccountId] = useState('')
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const baseUrl = import.meta.env.VITE_SIGNER_URL
  const client = new KentuckySignerClient({ baseUrl })

  const startRecovery = async () => {
    setLoading(true)
    setError('')

    try {
      // Register new owner passkey
      const { attestationObject } = await registerPasskey({
        baseUrl,
        rpId: window.location.hostname,
        rpName: 'Kentucky Signer',
      })

      // Initiate recovery
      const result = await client.initiateRecovery(
        accountId,
        attestationObject,
        'Recovered Owner Passkey'
      )

      setStatus(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const checkStatus = async () => {
    const result = await client.getRecoveryStatus(accountId)
    setStatus(result)
  }

  const completeRecovery = async () => {
    try {
      await client.completeRecovery(accountId)
      alert('Recovery complete! You can now log in.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h2>Account Recovery</h2>

      <input
        placeholder="Account ID (64 chars)"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
      />

      {!status && (
        <button onClick={startRecovery} disabled={loading || accountId.length !== 64}>
          {loading ? 'Starting...' : 'Start Recovery'}
        </button>
      )}

      {status && (
        <div>
          <h3>Recovery Status</h3>
          <p>Verified: {status.verified_count}/{status.threshold}</p>
          <p>Guardians verified: {status.verified_guardians?.join(', ') || 'None'}</p>

          {status.timelock_remaining > 0 && (
            <p>Timelock: {Math.ceil(status.timelock_remaining / 60)} minutes remaining</p>
          )}

          <button onClick={checkStatus}>Refresh Status</button>

          {status.can_complete && (
            <button onClick={completeRecovery}>Complete Recovery</button>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}
```

## Security Considerations

### Choosing Guardian Devices

1. **Physical Security**: Use devices in physically secure locations
2. **Availability**: Ensure guardians can access their devices when needed
3. **Distribution**: Don't store all guardian passkeys in the same location
4. **Hardware Keys**: Consider dedicated hardware security keys for guardians

### Guardian Count and Threshold

- **Maximum Guardians**: 3
- **Threshold**: 2 (when you have 2+ guardians), 1 (when you have 1 guardian)
- **Recommendation**: Set up 3 guardians for maximum security

### Timelock

- Recovery includes a timelock (configurable, typically 24-72 hours)
- This gives you time to cancel if someone initiates unauthorized recovery
- Monitor your account for recovery attempts

### Notification

Consider implementing notifications:
- Alert when recovery is initiated
- Notify guardians of pending recovery requests
- Warn if guardians are removed

## Error Handling

### Common Errors

```typescript
try {
  await client.addGuardian(request, token)
} catch (error) {
  switch (error.code) {
    case 'MAX_GUARDIANS':
      // Already have 3 guardians
      break
    case 'INVALID_ATTESTATION':
      // Invalid WebAuthn attestation object
      break
    case 'RECOVERY_ACTIVE':
      // Cannot modify guardians during active recovery
      break
  }
}
```

### Recovery Errors

```typescript
try {
  await client.completeRecovery(accountId)
} catch (error) {
  switch (error.code) {
    case 'RECOVERY_NOT_ACTIVE':
      // No active recovery for this account
      break
    case 'THRESHOLD_NOT_MET':
      // Not enough guardian approvals
      break
    case 'TIMELOCK_NOT_EXPIRED':
      // Timelock hasn't expired yet
      break
  }
}
```

## API Reference

### Types

```typescript
interface GuardianInfo {
  index: number   // 1-3
  label: string   // Human-readable name
}

interface AddGuardianRequest {
  attestation_object: string  // Base64url WebAuthn attestation
  label?: string              // Optional label
}

interface AddGuardianResponse {
  success: boolean
  guardian_index: number
  guardian_count: number
}

interface InitiateRecoveryResponse {
  success: boolean
  challenges: string[]       // Challenge for each guardian (base64url)
  guardian_count: number
  threshold: number          // Required approvals
  timelock_seconds: number   // Wait time after threshold
}

interface VerifyGuardianRequest {
  account_id: string
  guardian_index: number     // 1-3
  authenticator_data: string // Base64url
  client_data_json: string   // Base64url
  signature: string          // Base64url
}

interface RecoveryStatusResponse {
  success: boolean
  recovery_active: boolean
  verified_count: number
  threshold: number
  can_complete: boolean
  timelock_remaining: number  // Seconds
  guardian_count: number
  guardian_challenges: string[]
  verified_guardians: number[]  // Indices of verified guardians
}
```

### Client Methods

```typescript
// Guardian management
client.addGuardian(request, token): Promise<AddGuardianResponse>
client.removeGuardian(guardianIndex, token): Promise<RemoveGuardianResponse>
client.getGuardians(token): Promise<GetGuardiansResponse>

// Recovery process
client.initiateRecovery(accountId, attestationObject, label?): Promise<InitiateRecoveryResponse>
client.verifyGuardian(request): Promise<VerifyGuardianResponse>
client.getRecoveryStatus(accountId): Promise<RecoveryStatusResponse>
client.completeRecovery(accountId): Promise<CompleteRecoveryResponse>
client.cancelRecovery(token): Promise<CancelRecoveryResponse>
```
