import {
  type Address,
  type Hex,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
  hashMessage,
  recoverAddress,
} from 'viem'
import type { KentuckySignerAccount } from './account'

/**
 * Execution intent to be signed by the EOA owner
 */
export interface ExecutionIntent {
  /** Replay protection nonce */
  nonce: bigint
  /** Expiration timestamp (unix seconds) */
  deadline: bigint
  /** Contract to call */
  target: Address
  /** ETH value to send */
  value: bigint
  /** Calldata for the call */
  data: Hex
}

/**
 * Signed execution intent
 */
export interface SignedIntent {
  /** The execution intent */
  intent: ExecutionIntent
  /** Owner's signature on the intent */
  signature: Hex
}

/**
 * Parameters for creating an execution intent
 */
export interface CreateIntentParams {
  /** Account nonce (fetch from contract) */
  nonce: bigint
  /** Expiration timestamp (unix seconds) */
  deadline?: bigint
  /** Contract to call */
  target: Address
  /** ETH value to send */
  value?: bigint
  /** Calldata for the call */
  data?: Hex
}

// EIP-712 type hash for ExecutionIntent
const INTENT_TYPEHASH = keccak256(
  encodePacked(
    ['string'],
    ['ExecutionIntent(uint256 nonce,uint256 deadline,address target,uint256 value,bytes data)']
  )
)

/**
 * Create an execution intent
 *
 * @param params - Intent parameters
 * @returns Execution intent
 *
 * @example
 * ```typescript
 * const intent = createExecutionIntent({
 *   nonce: 0n,
 *   target: '0x...',
 *   value: parseEther('0.1'),
 *   data: '0x',
 * })
 * ```
 */
export function createExecutionIntent(params: CreateIntentParams): ExecutionIntent {
  return {
    nonce: params.nonce,
    deadline: params.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour default
    target: params.target,
    value: params.value ?? 0n,
    data: params.data ?? '0x',
  }
}

/**
 * Compute the hash of an execution intent
 *
 * @param intent - The execution intent
 * @returns Intent hash
 */
export function hashIntent(intent: ExecutionIntent): Hex {
  const dataHash = keccak256(intent.data)
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, uint256, uint256, address, uint256, bytes32'),
      [INTENT_TYPEHASH, intent.nonce, intent.deadline, intent.target, intent.value, dataHash]
    )
  )
}

/**
 * Sign an execution intent using a Kentucky Signer account
 *
 * @param account - Kentucky Signer account
 * @param intent - The execution intent to sign
 * @returns Signed intent
 *
 * @example
 * ```typescript
 * const account = useKentuckySignerAccount()
 * const intent = createExecutionIntent({ nonce: 0n, target: '0x...' })
 * const signedIntent = await signIntent(account, intent)
 * ```
 */
export async function signIntent(
  account: KentuckySignerAccount,
  intent: ExecutionIntent
): Promise<SignedIntent> {
  // Compute intent hash
  const intentHash = hashIntent(intent)

  // Sign the hash as a message (will be recovered with ECDSA)
  let signature = await account.signMessage({
    message: { raw: intentHash },
  })

  // The Kentucky Signer API returns EIP-155 encoded v values (v = recovery_id + chain_id * 2 + 35)
  // OpenZeppelin's ECDSA.recover expects standard v values (27 or 28)
  // We need to normalize the v value to 27/28 format
  signature = normalizeSignatureV(signature)

  // Verify and correct the signature - Kentucky Signer sometimes returns inconsistent v values
  signature = await verifyAndFixSignatureV(signature, intentHash, account.address)

  return {
    intent,
    signature,
  }
}

/**
 * Normalize signature v value to 27/28 format
 * The Kentucky Signer API uses EIP-155 encoding which needs to be converted
 * for use with OpenZeppelin's ECDSA.recover
 */
function normalizeSignatureV(signature: Hex): Hex {
  // Signature is 65 bytes: r (32) + s (32) + v (1)
  const sigBytes = signature.slice(2) // Remove 0x prefix
  if (sigBytes.length !== 130) {
    return signature // Not a standard 65-byte signature
  }

  const r = sigBytes.slice(0, 64)
  const s = sigBytes.slice(64, 128)
  const vHex = sigBytes.slice(128, 130)
  const v = parseInt(vHex, 16)

  // Convert to standard 27/28 format
  let normalizedV: number
  if (v === 0 || v === 1) {
    // Already recovery ID format, convert to 27/28
    normalizedV = v + 27
  } else if (v === 27 || v === 28) {
    // Already standard format
    normalizedV = v
  } else if (v >= 35) {
    // EIP-155 format: v = recovery_id + chain_id * 2 + 35
    // recovery_id = (v - 35) % 2
    normalizedV = ((v - 35) % 2) + 27
  } else {
    // Unknown format, return as-is
    return signature
  }

  return `0x${r}${s}${normalizedV.toString(16).padStart(2, '0')}` as Hex
}

/**
 * Verify signature recovers to expected address, and fix v value if needed
 * Kentucky Signer sometimes returns signatures with the wrong recovery parameter
 */
async function verifyAndFixSignatureV(
  signature: Hex,
  intentHash: Hex,
  expectedAddress: Address
): Promise<Hex> {
  const sigBytes = signature.slice(2)
  if (sigBytes.length !== 130) {
    return signature
  }

  const r = `0x${sigBytes.slice(0, 64)}` as Hex
  const s = `0x${sigBytes.slice(64, 128)}` as Hex
  const vHex = sigBytes.slice(128, 130)
  const v = parseInt(vHex, 16)

  // The contract uses toEthSignedMessageHash on the intent hash
  const ethSignDigest = hashMessage({ raw: intentHash })

  try {
    // Try recovering with the current v value
    const recovered = await recoverAddress({
      hash: ethSignDigest,
      signature: { r, s, v: BigInt(v) }
    })

    if (recovered.toLowerCase() === expectedAddress.toLowerCase()) {
      return signature // Signature is correct
    }

    // Try the other v value (flip between 27 and 28)
    const altV = v === 27 ? 28 : 27
    const altRecovered = await recoverAddress({
      hash: ethSignDigest,
      signature: { r, s, v: BigInt(altV) }
    })

    if (altRecovered.toLowerCase() === expectedAddress.toLowerCase()) {
      // Return signature with corrected v
      return `0x${sigBytes.slice(0, 128)}${altV.toString(16).padStart(2, '0')}` as Hex
    }

    // Neither v value works - return original and let contract handle error
    console.warn('Signature recovery failed - neither v=27 nor v=28 recovers to expected address')
    return signature
  } catch {
    // Recovery failed - return original
    return signature
  }
}

/**
 * Compute combined hash for batch intents
 *
 * @param intents - Array of execution intents
 * @returns Combined hash
 */
export function hashBatchIntents(intents: ExecutionIntent[]): Hex {
  const intentHashes = intents.map(hashIntent)
  return keccak256(encodePacked(['bytes32[]'], [intentHashes]))
}

/**
 * Sign multiple execution intents for batch execution
 *
 * @param account - Kentucky Signer account
 * @param intents - Array of execution intents
 * @returns Array of signed intents
 */
export async function signBatchIntents(
  account: KentuckySignerAccount,
  intents: ExecutionIntent[]
): Promise<SignedIntent[]> {
  const signedIntents: SignedIntent[] = []

  for (const intent of intents) {
    const signed = await signIntent(account, intent)
    signedIntents.push(signed)
  }

  return signedIntents
}
