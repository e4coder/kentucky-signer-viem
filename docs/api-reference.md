# API Reference

Complete API documentation for Kentucky Signer Viem.

## Table of Contents

- [KentuckySignerClient](#kentuckysignerclient)
- [Account Functions](#account-functions)
- [Authentication Functions](#authentication-functions)
- [Types](#types)
- [Errors](#errors)
- [Secure Mode (Ephemeral Keys)](#secure-mode-ephemeral-keys)
- [EIP-7702 Authorization](#eip-7702-authorization)
- [Intent Signing](#intent-signing)
- [RelayerClient](#relayerclient)
- [Constants](#constants)

## KentuckySignerClient

The main client for interacting with the Kentucky Signer API.

### Constructor

```typescript
import { KentuckySignerClient } from 'kentucky-signer-viem'

const client = new KentuckySignerClient({
  baseUrl: 'https://signer.example.com',
  timeout: 30000, // Optional, default 30s
  fetch: customFetch, // Optional, for Node.js or testing
})
```

### Authentication Methods

#### getChallenge

Get a challenge for passkey authentication.

```typescript
async getChallenge(accountId: string): Promise<ChallengeResponse>
```

**Parameters:**
- `accountId` - Account ID (64-character hex string)

**Returns:**
```typescript
interface ChallengeResponse {
  success: boolean
  challenge: string // Base64url encoded 32-byte challenge
  expires_at: number // Unix timestamp
}
```

#### authenticatePasskey

Authenticate with a WebAuthn passkey credential.

```typescript
async authenticatePasskey(
  accountId: string,
  credential: PasskeyCredential,
  ephemeralPublicKey?: string
): Promise<AuthResponse>
```

**Parameters:**
- `accountId` - Account ID to authenticate
- `credential` - WebAuthn credential from `navigator.credentials.get()`
- `ephemeralPublicKey` - Optional base64url encoded ephemeral public key for secure mode

**Returns:**
```typescript
interface AuthResponse {
  success: boolean
  token: string // JWT token
  expires_in: number // Token lifetime in seconds
  account_id: string
}
```

#### authenticatePassword

Authenticate with password.

```typescript
async authenticatePassword(request: PasswordAuthRequest): Promise<AuthResponse>
```

**Parameters:**
```typescript
interface PasswordAuthRequest {
  account_id: string
  password: string
}
```

#### refreshToken

Refresh an authentication token.

```typescript
async refreshToken(token: string): Promise<AuthResponse>
```

#### logout

Invalidate a token.

```typescript
async logout(token: string): Promise<void>
```

### Account Methods

#### createAccountWithPasskey

Create a new account with passkey authentication.

```typescript
async createAccountWithPasskey(
  attestationObject: string,
  label?: string
): Promise<AccountCreationResponse>
```

**Parameters:**
- `attestationObject` - Base64url encoded WebAuthn attestation object
- `label` - Optional label for the passkey (default: "Owner Passkey")

**Returns:**
```typescript
interface AccountCreationResponse {
  success: boolean
  account_id: string
  addresses: {
    evm: string
    bitcoin: string
    solana: string
  }
}
```

#### createAccountWithPassword

Create a new account with password authentication.

```typescript
async createAccountWithPassword(
  request: CreatePasswordAccountRequest
): Promise<AccountCreationResponse>
```

**Parameters:**
```typescript
interface CreatePasswordAccountRequest {
  password: string // 8-128 characters
  confirmation: string // Must match password
}
```

#### getAccountInfo

Get account information.

```typescript
async getAccountInfo(accountId: string, token: string): Promise<AccountInfoResponse>
```

**Returns:**
```typescript
interface AccountInfoResponse {
  success: boolean
  account_id: string
  addresses: {
    evm: string
    bitcoin: string
    solana: string
  }
  passkeys: Array<{
    credential_id: string
    created_at: number
  }>
}
```

#### getAccountInfoExtended

Get extended account information including auth configuration.

```typescript
async getAccountInfoExtended(accountId: string, token: string): Promise<AccountInfoExtendedResponse>
```

**Returns:**
```typescript
interface AccountInfoExtendedResponse {
  success: boolean
  account_id: string
  addresses: {
    evm: string
    bitcoin: string
    solana: string
  }
  auth_config: {
    passkey: boolean
    password: boolean
    pin_4: boolean
    pin_6: boolean
    totp: boolean
  }
  passkey_count: number
  guardian_count?: number
  recovery_active?: boolean
}
```

#### accountExists

Check if an account exists.

```typescript
async accountExists(accountId: string, token: string): Promise<boolean>
```

#### addPassword

Add password authentication to an existing account.

```typescript
async addPassword(
  accountId: string,
  request: AddPasswordRequest,
  token: string
): Promise<AddPasswordResponse>
```

#### addPasskey

Add a recovery passkey to an account.

```typescript
async addPasskey(
  accountId: string,
  request: AddPasskeyRequest,
  token: string
): Promise<AddPasskeyResponse>
```

**Parameters:**
```typescript
interface AddPasskeyRequest {
  attestation_object: string // WebAuthn attestation object (base64url)
  label?: string // User-friendly label
}
```

#### removePasskey

Remove a passkey from an account.

```typescript
async removePasskey(
  accountId: string,
  passkeyIndex: number,
  token: string
): Promise<RemovePasskeyResponse>
```

**Note:** Cannot remove the owner passkey (index 0).

### Signing Methods

#### signEvmTransaction

Sign an EVM transaction hash.

```typescript
async signEvmTransaction(
  request: SignEvmRequest,
  token: string
): Promise<EvmSignatureResponse>
```

**Parameters:**
```typescript
interface SignEvmRequest {
  tx_hash: `0x${string}` // 32-byte hash (hex)
}
```

**Returns:**
```typescript
interface EvmSignatureResponse {
  success: boolean
  signature: {
    r: `0x${string}`
    s: `0x${string}`
    v: number // 27 or 28 (standard format)
    full: `0x${string}` // Concatenated signature
  }
  signer_address: string
}
```

**Note:** The `v` value is always 27 or 28 (standard recovery ID + 27). For legacy transactions, the caller should apply EIP-155 encoding (v = chainId * 2 + 35 + recoveryId) when needed.

#### signEvmTransactionWith2FA

Sign an EVM transaction with 2FA codes.

```typescript
async signEvmTransactionWith2FA(
  request: SignEvmRequestWith2FA,
  token: string
): Promise<EvmSignatureResponse>
```

**Parameters:**
```typescript
interface SignEvmRequestWith2FA extends SignEvmRequest {
  totp_code?: string // Required if TOTP enabled
  pin?: string // Required if PIN enabled
}
```

#### signHash

Convenience method for signing a hash.

```typescript
async signHash(hash: Hex, token: string): Promise<Hex>
```

### Guardian Methods

#### addGuardian

Add a guardian passkey for account recovery.

```typescript
async addGuardian(
  request: AddGuardianRequest,
  token: string
): Promise<AddGuardianResponse>
```

**Parameters:**
```typescript
interface AddGuardianRequest {
  attestation_object: string // WebAuthn attestation object (base64url)
  label?: string // User-friendly label
}
```

**Returns:**
```typescript
interface AddGuardianResponse {
  success: boolean
  guardian_index: number // 1-3
  guardian_count: number
}
```

#### removeGuardian

Remove a guardian from an account.

```typescript
async removeGuardian(guardianIndex: number, token: string): Promise<RemoveGuardianResponse>
```

**Note:** Cannot remove guardians during active recovery.

#### getGuardians

Get guardians for an account.

```typescript
async getGuardians(token: string): Promise<GetGuardiansResponse>
```

**Returns:**
```typescript
interface GetGuardiansResponse {
  success: boolean
  guardian_count: number
  guardians: Array<{
    index: number
    label: string
  }>
}
```

### Recovery Methods

#### initiateRecovery

Start account recovery process.

```typescript
async initiateRecovery(
  accountId: string,
  attestationObject: string,
  label?: string
): Promise<InitiateRecoveryResponse>
```

**Returns:**
```typescript
interface InitiateRecoveryResponse {
  success: boolean
  challenges: string[] // Challenges for guardians (base64url)
  guardian_count: number
  threshold: number // Signatures required
  timelock_seconds: number // Wait time after threshold
}
```

#### verifyGuardian

Submit a guardian signature for recovery.

```typescript
async verifyGuardian(request: VerifyGuardianRequest): Promise<VerifyGuardianResponse>
```

**Parameters:**
```typescript
interface VerifyGuardianRequest {
  account_id: string
  guardian_index: number // 1-3
  authenticator_data: string // base64url
  client_data_json: string // base64url
  signature: string // base64url
}
```

#### getRecoveryStatus

Get current recovery status.

```typescript
async getRecoveryStatus(accountId: string): Promise<RecoveryStatusResponse>
```

**Returns:**
```typescript
interface RecoveryStatusResponse {
  success: boolean
  recovery_active: boolean
  verified_count: number
  threshold: number
  can_complete: boolean
  timelock_remaining: number // Seconds
  guardian_count: number
  guardian_challenges: string[]
  verified_guardians: number[]
}
```

#### completeRecovery

Complete the recovery process.

```typescript
async completeRecovery(accountId: string): Promise<CompleteRecoveryResponse>
```

#### cancelRecovery

Cancel a pending recovery (owner only).

```typescript
async cancelRecovery(token: string): Promise<CancelRecoveryResponse>
```

### 2FA Methods

#### get2FAStatus

Get 2FA status for an account.

```typescript
async get2FAStatus(token: string): Promise<TwoFactorStatusResponse>
```

**Returns:**
```typescript
interface TwoFactorStatusResponse {
  success: boolean
  totp_enabled: boolean
  pin_enabled: boolean
  pin_length: number // 4, 6, or 0 if disabled
}
```

#### setupTOTP

Start TOTP setup.

```typescript
async setupTOTP(token: string): Promise<TotpSetupResponse>
```

**Returns:**
```typescript
interface TotpSetupResponse {
  success: boolean
  uri: string // otpauth:// URI for QR code
  secret: string // Base32 secret for manual entry
  message: string
}
```

#### enableTOTP

Enable TOTP after verification.

```typescript
async enableTOTP(code: string, token: string): Promise<TwoFactorResponse>
```

#### disableTOTP

Disable TOTP (requires valid code).

```typescript
async disableTOTP(code: string, token: string): Promise<TwoFactorResponse>
```

#### verifyTOTP

Verify a TOTP code without signing.

```typescript
async verifyTOTP(code: string, token: string): Promise<TwoFactorVerifyResponse>
```

#### setupPIN

Set up a PIN.

```typescript
async setupPIN(pin: string, token: string): Promise<PinSetupResponse>
```

**Parameters:**
- `pin` - 4 or 6 digit PIN

**Returns:**
```typescript
interface PinSetupResponse {
  success: boolean
  message: string
  pin_length: number
}
```

#### disablePIN

Disable PIN (requires valid PIN).

```typescript
async disablePIN(pin: string, token: string): Promise<TwoFactorResponse>
```

#### verifyPIN

Verify a PIN without signing.

```typescript
async verifyPIN(pin: string, token: string): Promise<TwoFactorVerifyResponse>
```

### Utility Methods

#### healthCheck

Check if the API is healthy.

```typescript
async healthCheck(): Promise<boolean>
```

#### getVersion

Get API version.

```typescript
async getVersion(): Promise<string>
```

---

## Account Functions

### createKentuckySignerAccount

Create a Viem-compatible account backed by Kentucky Signer.

```typescript
import { createKentuckySignerAccount } from 'kentucky-signer-viem'

const account = createKentuckySignerAccount({
  config: {
    baseUrl: 'https://signer.example.com',
    accountId: '0x...',
  },
  session: authenticatedSession,
  defaultChainId: 1,
  onSessionExpired: async () => {
    // Refresh and return new session
  },
  secureClient: optionalSecureClient,
  on2FARequired: async ({ totpRequired, pinRequired, pinLength }) => {
    // Prompt user and return codes
    return { totpCode: '123456', pin: '1234' }
  },
})
```

**Options:**
```typescript
interface KentuckySignerAccountOptions {
  config: KentuckySignerConfig
  session: AuthSession
  defaultChainId?: number // Default: 1
  onSessionExpired?: () => Promise<AuthSession>
  secureClient?: SecureKentuckySignerClient
  on2FARequired?: TwoFactorCallback
}
```

**Returns:**
```typescript
interface KentuckySignerAccount extends LocalAccount<'kentuckySigner'> {
  accountId: string
  session: AuthSession
  updateSession: (session: AuthSession) => void
}
```

### createServerAccount

Create an account for server-side use with existing token.

```typescript
import { createServerAccount } from 'kentucky-signer-viem'

const account = createServerAccount(
  'https://signer.example.com',
  accountId,
  jwtToken,
  '0x...', // EVM address
  1 // Chain ID
)
```

---

## Authentication Functions

### authenticateWithPasskey

High-level passkey authentication.

```typescript
import { authenticateWithPasskey } from 'kentucky-signer-viem'

const session = await authenticateWithPasskey({
  baseUrl: 'https://signer.example.com',
  accountId: '0x...',
  rpId: 'example.com', // Optional
})
```

### authenticateWithPassword

High-level password authentication.

```typescript
import { authenticateWithPassword } from 'kentucky-signer-viem'

const session = await authenticateWithPassword({
  baseUrl: 'https://signer.example.com',
  accountId: '0x...',
  password: 'user-password',
})
```

### registerPasskey

Register a new passkey for account creation.

```typescript
import { registerPasskey } from 'kentucky-signer-viem'

const { attestationObject, credential } = await registerPasskey({
  baseUrl: 'https://signer.example.com',
  rpId: 'example.com',
  rpName: 'My App',
  username: 'user@example.com', // Optional
})
```

---

## Types

### Core Types

```typescript
interface KentuckySignerConfig {
  baseUrl: string
  accountId: string
}

interface AuthSession {
  token: string
  accountId: string
  evmAddress: `0x${string}`
  btcAddress?: string
  solAddress?: string
  expiresAt: number // Unix ms
}

interface PasskeyCredential {
  credentialId: string // base64url
  clientDataJSON: string // base64url
  authenticatorData: string // base64url
  signature: string // base64url
  userHandle?: string // base64url
}
```

### 2FA Types

```typescript
interface TwoFactorCodes {
  totpCode?: string
  pin?: string
}

type TwoFactorCallback = (requirements: {
  totpRequired: boolean
  pinRequired: boolean
  pinLength: number
}) => Promise<TwoFactorCodes | null | undefined>
```

### Client Options

```typescript
interface ClientOptions {
  baseUrl: string
  fetch?: typeof fetch
  timeout?: number // Default: 30000
}
```

---

## Errors

### KentuckySignerError

All API errors are thrown as `KentuckySignerError`.

```typescript
import { KentuckySignerError } from 'kentucky-signer-viem'

try {
  await client.signEvmTransaction(request, token)
} catch (err) {
  if (err instanceof KentuckySignerError) {
    console.log(err.code) // Error code
    console.log(err.message) // Error message
    console.log(err.details) // Additional details
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_REQUEST` | Malformed request |
| `UNAUTHORIZED` | Invalid or expired token |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Account or resource not found |
| `SESSION_EXPIRED` | Session has expired |
| `2FA_REQUIRED` | 2FA codes required for operation |
| `2FA_CANCELLED` | User cancelled 2FA input |
| `INVALID_2FA` | Invalid TOTP or PIN code |
| `RECOVERY_ACTIVE` | Cannot perform action during recovery |
| `TIMELOCK_NOT_EXPIRED` | Recovery timelock hasn't expired |
| `THRESHOLD_NOT_MET` | Not enough guardian signatures |
| `UNKNOWN_ERROR` | Unexpected error |

---

## Secure Mode (Ephemeral Keys)

For enhanced security with client-side co-signing:

```typescript
import {
  SecureKentuckySignerClient,
  EphemeralKeyManager
} from 'kentucky-signer-viem'

// Create ephemeral key manager
const keyManager = new EphemeralKeyManager({
  persist: true, // Store in IndexedDB
  keyPrefix: 'my_app',
})

// Generate or load ephemeral key
await keyManager.generateKey()

// Create secure client
const secureClient = new SecureKentuckySignerClient({
  baseUrl: 'https://signer.example.com',
  ephemeralKeyManager: keyManager,
})

// Authenticate with ephemeral key binding
const session = await secureClient.authenticateWithPasskey(accountId, {
  rpId: 'example.com',
})

// Sign with ephemeral co-signature
const signature = await secureClient.signEvmTransaction(
  { tx_hash: hash },
  session.token
)
```

See [Secure Mode Documentation](./secure-mode.md) for detailed information.

---

## EIP-7702 Authorization

Sign authorizations for delegating EOA code to smart contracts.

### sign7702Authorization

Sign an EIP-7702 authorization for code delegation.

```typescript
const authorization = await account.sign7702Authorization(
  {
    contractAddress: '0x...', // Smart account delegate
    chainId: 42161, // Optional, defaults to account's chain
    nonce: 0n, // Optional, defaults to current nonce
    executor: 'self', // Optional, increments nonce if set
  },
  currentTxNonce // Current transaction nonce
)
```

**Parameters:**
```typescript
interface SignAuthorizationParameters {
  /** Contract address to delegate to */
  contractAddress: Address
  /** Chain ID (0 for all chains) */
  chainId?: number
  /** Authorization nonce */
  nonce?: bigint
  /** Set to 'self' if signing for own execution (increments nonce by 1) */
  executor?: 'self'
}
```

**Returns:**
```typescript
interface SignedAuthorization {
  chainId: number
  contractAddress: Address
  nonce: bigint
  yParity: number // 0 or 1
  r: Hex
  s: Hex
}
```

---

## Intent Signing

Functions for creating and signing execution intents for relayed transactions.

### createExecutionIntent

Create an execution intent.

```typescript
import { createExecutionIntent } from 'kentucky-signer-viem'

const intent = createExecutionIntent({
  nonce: 0n,
  target: '0x...',
  value: parseEther('0.1'), // Optional, defaults to 0
  data: '0x...', // Optional, defaults to '0x'
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // Optional, defaults to 1 hour
})
```

**Parameters:**
```typescript
interface CreateIntentParams {
  /** Account nonce (from delegate contract) */
  nonce: bigint
  /** Contract to call */
  target: Address
  /** ETH value to send */
  value?: bigint
  /** Calldata */
  data?: Hex
  /** Expiration timestamp (unix seconds) */
  deadline?: bigint
}
```

**Returns:**
```typescript
interface ExecutionIntent {
  nonce: bigint
  deadline: bigint
  target: Address
  value: bigint
  data: Hex
}
```

### signIntent

Sign an execution intent.

```typescript
import { signIntent } from 'kentucky-signer-viem'

const signedIntent = await signIntent(account, intent)
// { intent, signature: '0x...' }
```

### signBatchIntents

Sign multiple intents for batch execution.

```typescript
import { signBatchIntents } from 'kentucky-signer-viem'

const signedIntents = await signBatchIntents(account, [intent1, intent2])
```

### hashIntent

Compute the hash of an execution intent.

```typescript
import { hashIntent } from 'kentucky-signer-viem'

const intentHash = hashIntent(intent)
// '0x...' (bytes32)
```

### hashBatchIntents

Compute combined hash for batch intents.

```typescript
import { hashBatchIntents } from 'kentucky-signer-viem'

const combinedHash = hashBatchIntents([intent1, intent2])
```

---

## RelayerClient

Client for interacting with a relayer service for gasless transactions.

### Constructor

```typescript
import { RelayerClient, createRelayerClient } from 'kentucky-signer-viem'

const relayer = new RelayerClient({
  baseUrl: 'https://relayer.example.com',
  timeout: 30000, // Optional, default 30s
})

// Or use factory function
const relayer = createRelayerClient('https://relayer.example.com')
```

### Methods

#### health

Check if relayer is healthy.

```typescript
const health = await relayer.health()
// { status: 'ok', relayer: '0x...', timestamp: '...' }
```

#### getNonce

Get account nonce from the delegate contract.

```typescript
const nonce = await relayer.getNonce(chainId, accountAddress)
// Returns bigint
```

#### estimate

Estimate gas and fees for an intent.

```typescript
const estimate = await relayer.estimate(chainId, accountAddress, intent)
```

**Returns:**
```typescript
interface EstimateResponse {
  gasEstimate: string
  gasCostWei: string
  sponsoredAvailable: boolean
  tokenOptions: Array<{
    token: Address
    symbol: string
    estimatedFee: string
    feePercentage: number
  }>
}
```

#### relay

Submit a signed intent for execution.

```typescript
// Sponsored mode (relayer pays gas)
const result = await relayer.relay(
  chainId,
  accountAddress,
  signedIntent,
  'sponsored'
)

// Token payment mode
const result = await relayer.relay(
  chainId,
  accountAddress,
  signedIntent,
  { token: '0x...' } // ERC20 token address
)

// With EIP-7702 authorization for gasless onboarding
const result = await relayer.relay(
  chainId,
  accountAddress,
  signedIntent,
  'sponsored',
  authorization // SignedAuthorization from sign7702Authorization
)
```

**Parameters:**
- `chainId` - Target chain ID
- `accountAddress` - EOA address
- `signedIntent` - Signed execution intent
- `paymentMode` - `'sponsored'` or `{ token: Address }`
- `authorization` - Optional EIP-7702 authorization for delegation

**Returns:**
```typescript
interface RelayResponse {
  success: boolean
  txHash?: Hex
  error?: string
}
```

#### getStatus

Get transaction status.

```typescript
const status = await relayer.getStatus(chainId, txHash)
```

**Returns:**
```typescript
interface StatusResponse {
  status: 'pending' | 'confirmed' | 'failed'
  txHash: Hex
  blockNumber?: number
  gasUsed?: string
  tokenPaid?: string
}
```

---

## Constants

### ALCHEMY_SEMI_MODULAR_ACCOUNT_7702

Alchemy's SemiModularAccount7702 implementation address (same on all EVM chains).

```typescript
import { ALCHEMY_SEMI_MODULAR_ACCOUNT_7702 } from 'kentucky-signer-viem'

// '0x69007702764179f14F51cdce752f4f775d74E139'
```
