# Guardian Recovery

Guardian recovery allows you to designate trusted accounts (guardians) who can help you recover access to your account if you lose your authentication credentials.

## Overview

Guardian recovery implements a social recovery mechanism:

1. **Add Guardians**: Designate trusted accounts as guardians
2. **Set Threshold**: Configure how many guardians must approve recovery (default: 2)
3. **Initiate Recovery**: Start recovery process when locked out
4. **Guardian Approval**: Guardians sign the recovery request
5. **Complete Recovery**: Reset credentials after threshold is met

## Adding Guardians

### Prerequisites

- The guardian must have a Kentucky Signer account
- You need the guardian's 64-character hex account ID

### Add a Guardian

```typescript
import { KentuckySignerClient } from 'kentucky-signer-viem'

const client = new KentuckySignerClient({
  baseUrl: 'https://signer.example.com'
})

await client.addGuardian(myAccountId, {
  guardian_account_id: 'guardian_hex_account_id_64_chars',
  label: 'Alice (Friend)', // Optional human-readable label
}, token)
```

### List Guardians

```typescript
const { guardians } = await client.getGuardians(myAccountId, token)

// Example response:
// guardians: [
//   {
//     guardian_account_id: '0123...',
//     label: 'Alice (Friend)',
//     added_at: 1704067200000
//   },
//   {
//     guardian_account_id: 'abcd...',
//     label: 'Bob (Family)',
//     added_at: 1704153600000
//   }
// ]

console.log(`You have ${guardians.length} guardians`)
```

### Remove a Guardian

```typescript
await client.removeGuardian(
  myAccountId,
  'guardian_account_id_to_remove',
  token
)
```

## Recovery Process

### Step 1: Initiate Recovery

When you're locked out and need to recover your account:

```typescript
// Note: This request doesn't require authentication
const recovery = await client.initiateRecovery({
  account_id: myAccountId,
  new_password: 'my-new-secure-password',
})

console.log('Recovery ID:', recovery.recovery_id)
console.log('Required signatures:', recovery.threshold)
console.log('Current signatures:', recovery.signatures_collected)
console.log('Expires at:', new Date(recovery.expires_at))

// Share the recovery_id with your guardians
```

### Step 2: Share Recovery ID

Send the recovery ID to your guardians through a secure channel (in person, encrypted message, etc.).

```
Recovery ID: abc123def456...
Account to recover: 0123456789abcdef...
```

### Step 3: Guardian Approval

Each guardian approves the recovery by signing:

```typescript
// Guardian's code
const guardianClient = new KentuckySignerClient({ baseUrl })

// Guardian needs to sign the recovery request
// The challenge is the recovery_id + account_id hash
const challenge = await guardianClient.getRecoveryChallenge(recoveryId)

// Sign with guardian's account
const signature = await guardianAccount.signMessage({
  message: challenge.message
})

// Submit guardian verification
await guardianClient.verifyGuardianRecovery({
  recovery_id: recoveryId,
  guardian_account_id: guardianAccountId,
  signature: signature,
}, guardianToken)
```

### Step 4: Check Recovery Status

```typescript
const status = await client.getRecoveryStatus({
  recovery_id: recoveryId,
  account_id: myAccountId,
})

console.log('Status:', status.status) // 'pending', 'ready', 'completed', 'expired'
console.log('Signatures:', `${status.signatures_collected}/${status.threshold}`)

// List of guardians who have approved
status.approved_guardians.forEach(g => {
  console.log(`- ${g.label} approved at ${new Date(g.approved_at)}`)
})
```

### Step 5: Complete Recovery

Once enough guardians have approved:

```typescript
// Check if threshold is met
const status = await client.getRecoveryStatus({ recovery_id: recoveryId, account_id: myAccountId })

if (status.status === 'ready') {
  await client.completeRecovery({
    recovery_id: recoveryId,
  }, token)

  console.log('Recovery complete! You can now log in with your new password.')
}
```

### Cancel Recovery

If you regain access or no longer need recovery:

```typescript
await client.cancelRecovery(recoveryId, token)
```

## React Integration

### Guardian Management Component

```tsx
import { useState, useEffect } from 'react'
import { useKentuckySigner } from 'kentucky-signer-viem/react'
import { KentuckySignerClient, GuardianInfo } from 'kentucky-signer-viem'

function GuardianManager() {
  const { session } = useKentuckySigner()
  const [guardians, setGuardians] = useState<GuardianInfo[]>([])
  const [newGuardianId, setNewGuardianId] = useState('')
  const [label, setLabel] = useState('')

  const client = new KentuckySignerClient({
    baseUrl: import.meta.env.VITE_SIGNER_URL
  })

  useEffect(() => {
    if (session) {
      loadGuardians()
    }
  }, [session])

  const loadGuardians = async () => {
    if (!session) return
    const { guardians } = await client.getGuardians(session.accountId, session.token)
    setGuardians(guardians)
  }

  const addGuardian = async () => {
    if (!session) return
    await client.addGuardian(session.accountId, {
      guardian_account_id: newGuardianId,
      label,
    }, session.token)
    setNewGuardianId('')
    setLabel('')
    await loadGuardians()
  }

  const removeGuardian = async (guardianId: string) => {
    if (!session) return
    await client.removeGuardian(session.accountId, guardianId, session.token)
    await loadGuardians()
  }

  return (
    <div>
      <h2>Guardians ({guardians.length})</h2>

      <ul>
        {guardians.map(g => (
          <li key={g.guardian_account_id}>
            {g.label || 'Unnamed'} ({g.guardian_account_id.slice(0, 8)}...)
            <button onClick={() => removeGuardian(g.guardian_account_id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <h3>Add Guardian</h3>
      <input
        placeholder="Guardian Account ID (64 chars)"
        value={newGuardianId}
        onChange={(e) => setNewGuardianId(e.target.value)}
      />
      <input
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <button onClick={addGuardian} disabled={newGuardianId.length !== 64}>
        Add Guardian
      </button>
    </div>
  )
}
```

### Guardian Approval Page

For guardians to approve recovery requests:

```tsx
import { useState } from 'react'
import { useKentuckySigner } from 'kentucky-signer-viem/react'
import { KentuckySignerClient } from 'kentucky-signer-viem'

function GuardianApprovalPage() {
  const { session, account } = useKentuckySigner()
  const [recoveryId, setRecoveryId] = useState('')
  const [status, setStatus] = useState<string>('')

  const client = new KentuckySignerClient({
    baseUrl: import.meta.env.VITE_SIGNER_URL
  })

  const approveRecovery = async () => {
    if (!session || !account) return

    try {
      setStatus('Signing...')

      // Get the challenge to sign
      const challenge = await client.getRecoveryChallenge(recoveryId)

      // Sign with our account
      const signature = await account.signMessage({
        message: challenge.message
      })

      // Submit the approval
      await client.verifyGuardianRecovery({
        recovery_id: recoveryId,
        guardian_account_id: session.accountId,
        signature,
      }, session.token)

      setStatus('Approved! The account owner will be notified.')
    } catch (error) {
      setStatus(`Error: ${error.message}`)
    }
  }

  return (
    <div>
      <h2>Approve Recovery Request</h2>
      <p>Enter the recovery ID shared with you:</p>

      <input
        placeholder="Recovery ID"
        value={recoveryId}
        onChange={(e) => setRecoveryId(e.target.value)}
      />

      <button onClick={approveRecovery} disabled={!recoveryId || !account}>
        Approve Recovery
      </button>

      {status && <p>{status}</p>}
    </div>
  )
}
```

## Security Considerations

### Choosing Guardians

1. **Trust**: Choose people you trust completely
2. **Availability**: Ensure they can respond when needed
3. **Technical**: They need a Kentucky Signer account
4. **Distribution**: Don't choose guardians who might all be unavailable at once

### Guardian Count and Threshold

- **Minimum Guardians**: 2 (to meet the default threshold of 2)
- **Recommended**: 3-5 guardians with threshold of 2-3
- **Trade-off**: More guardians = more security but slower recovery

### Recovery Window

- Recovery requests expire after 7 days
- Start a new recovery if the old one expires
- Cancel immediately if you regain access

### Notification

Consider implementing notifications:
- Email guardians when added
- Alert guardians of pending recovery requests
- Notify account owner when recovery is initiated

## Error Handling

### Common Errors

```typescript
try {
  await client.addGuardian(accountId, request, token)
} catch (error) {
  switch (error.code) {
    case 'GUARDIAN_NOT_FOUND':
      // Guardian account doesn't exist
      break
    case 'GUARDIAN_ALREADY_EXISTS':
      // Guardian already added
      break
    case 'MAX_GUARDIANS_REACHED':
      // Cannot add more guardians (limit: 10)
      break
    case 'CANNOT_ADD_SELF':
      // Cannot add yourself as guardian
      break
  }
}
```

### Recovery Errors

```typescript
try {
  await client.completeRecovery({ recovery_id: recoveryId }, token)
} catch (error) {
  switch (error.code) {
    case 'RECOVERY_NOT_FOUND':
      // Invalid recovery ID
      break
    case 'RECOVERY_EXPIRED':
      // Recovery request expired (7 days)
      break
    case 'THRESHOLD_NOT_MET':
      // Not enough guardian approvals
      break
    case 'RECOVERY_ALREADY_COMPLETED':
      // Recovery already processed
      break
  }
}
```

## API Reference

### Types

```typescript
interface GuardianInfo {
  guardian_account_id: string  // 64-char hex
  label?: string               // Human-readable name
  added_at: number             // Timestamp (ms)
}

interface AddGuardianRequest {
  guardian_account_id: string
  label?: string
}

interface InitiateRecoveryRequest {
  account_id: string
  new_password: string
}

interface InitiateRecoveryResponse {
  recovery_id: string
  threshold: number
  signatures_collected: number
  expires_at: number
}

interface VerifyGuardianRequest {
  recovery_id: string
  guardian_account_id: string
  signature: string
}

interface RecoveryStatusResponse {
  status: 'pending' | 'ready' | 'completed' | 'expired'
  threshold: number
  signatures_collected: number
  approved_guardians: Array<{
    guardian_account_id: string
    label?: string
    approved_at: number
  }>
  expires_at: number
}
```

### Client Methods

```typescript
// Guardian management
client.addGuardian(accountId, request, token): Promise<void>
client.removeGuardian(accountId, guardianId, token): Promise<void>
client.getGuardians(accountId, token): Promise<{ guardians: GuardianInfo[] }>

// Recovery process
client.initiateRecovery(request): Promise<InitiateRecoveryResponse>
client.getRecoveryChallenge(recoveryId): Promise<{ message: string }>
client.verifyGuardianRecovery(request, token): Promise<void>
client.getRecoveryStatus(request): Promise<RecoveryStatusResponse>
client.completeRecovery(request, token): Promise<void>
client.cancelRecovery(recoveryId, token): Promise<void>
```
