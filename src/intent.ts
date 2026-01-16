import {
  type Address,
  type Hex,
  type TypedDataDomain,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
} from 'viem'
import type { KentuckySignerAccount } from './account'

// EIP-712 domain for KentuckyDelegate
// Note: verifyingContract is the EOA address in EIP-7702 context
export function getKentuckyDelegateDomain(
  chainId: number,
  verifyingContract: Address
): TypedDataDomain {
  return {
    name: 'KentuckyDelegate',
    version: '1',
    chainId: chainId,
    verifyingContract: verifyingContract,
  }
}

// EIP-712 types for ExecutionIntent
export const EXECUTION_INTENT_TYPES = {
  ExecutionIntent: [
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'target', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
  ],
} as const

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
 * Sign an execution intent using a Kentucky Signer account with EIP-712
 *
 * @param account - Kentucky Signer account
 * @param intent - The execution intent to sign
 * @param chainId - Chain ID for the EIP-712 domain
 * @param accountAddress - The EOA address (verifyingContract in EIP-712 domain)
 * @returns Signed intent
 *
 * @example
 * ```typescript
 * const account = useKentuckySignerAccount()
 * const intent = createExecutionIntent({ nonce: 0n, target: '0x...' })
 * const signedIntent = await signIntent(account, intent, 42161, account.address)
 * ```
 */
export async function signIntent(
  account: KentuckySignerAccount,
  intent: ExecutionIntent,
  chainId: number,
  accountAddress: Address
): Promise<SignedIntent> {
  // Sign using EIP-712 typed data
  // The domain includes chainId and verifyingContract (the EOA address)
  // This prevents cross-chain replay attacks
  const signature = await account.signTypedData({
    domain: getKentuckyDelegateDomain(chainId, accountAddress),
    types: EXECUTION_INTENT_TYPES,
    primaryType: 'ExecutionIntent',
    message: {
      nonce: intent.nonce,
      deadline: intent.deadline,
      target: intent.target,
      value: intent.value,
      data: intent.data,
    },
  })

  return {
    intent,
    signature,
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
 * @param chainId - Chain ID for the EIP-712 domain
 * @param accountAddress - The EOA address (verifyingContract in EIP-712 domain)
 * @returns Array of signed intents
 */
export async function signBatchIntents(
  account: KentuckySignerAccount,
  intents: ExecutionIntent[],
  chainId: number,
  accountAddress: Address
): Promise<SignedIntent[]> {
  const signedIntents: SignedIntent[] = []

  for (const intent of intents) {
    const signed = await signIntent(account, intent, chainId, accountAddress)
    signedIntents.push(signed)
  }

  return signedIntents
}
