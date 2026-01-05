import { useMemo, useCallback, useState } from 'react'
import { createWalletClient, http, type Chain, type WalletClient, type Transport } from 'viem'
import { useKentuckySignerContext } from './context'
import type { KentuckySignerAccount } from '../account'

/**
 * Hook to access Kentucky Signer authentication state
 *
 * @returns Authentication state and actions
 *
 * @example
 * ```tsx
 * function LoginButton() {
 *   const { isAuthenticated, isAuthenticating, authenticate, logout } = useKentuckySigner()
 *
 *   if (isAuthenticated) {
 *     return <button onClick={logout}>Logout</button>
 *   }
 *
 *   return (
 *     <button onClick={() => authenticate('account_id')} disabled={isAuthenticating}>
 *       {isAuthenticating ? 'Authenticating...' : 'Login with Passkey'}
 *     </button>
 *   )
 * }
 * ```
 */
export function useKentuckySigner() {
  const context = useKentuckySignerContext()

  return {
    isAuthenticated: context.isAuthenticated,
    isAuthenticating: context.isAuthenticating,
    session: context.session,
    account: context.account,
    error: context.error,
    ephemeralKeyBound: context.ephemeralKeyBound,
    authenticate: context.authenticate,
    authenticatePassword: context.authenticatePassword,
    logout: context.logout,
    refreshSession: context.refreshSession,
    clearError: context.clearError,
    secureMode: context.secureMode,
    setSecureMode: context.setSecureMode,
    persistEphemeralKeys: context.persistEphemeralKeys,
    setPersistEphemeralKeys: context.setPersistEphemeralKeys,
    getEphemeralPublicKey: context.getEphemeralPublicKey,
  }
}

/**
 * Hook to access the Kentucky Signer account
 *
 * @returns Account or null if not authenticated
 *
 * @example
 * ```tsx
 * function AccountInfo() {
 *   const account = useKentuckySignerAccount()
 *
 *   if (!account) return <div>Not connected</div>
 *
 *   return <div>Connected: {account.address}</div>
 * }
 * ```
 */
export function useKentuckySignerAccount(): KentuckySignerAccount | null {
  const { account } = useKentuckySignerContext()
  return account
}

/**
 * Options for useWalletClient hook
 */
export interface UseWalletClientOptions {
  /** Viem chain configuration */
  chain: Chain
  /** RPC URL (defaults to chain's default RPC) */
  rpcUrl?: string
}

/**
 * Hook to create a Viem WalletClient with the Kentucky Signer account
 *
 * @param options - Wallet client options
 * @returns Wallet client or null if not authenticated
 *
 * @example
 * ```tsx
 * import { mainnet } from 'viem/chains'
 *
 * function SendTransaction() {
 *   const walletClient = useWalletClient({
 *     chain: mainnet,
 *     rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/...'
 *   })
 *
 *   async function send() {
 *     if (!walletClient) return
 *
 *     const hash = await walletClient.sendTransaction({
 *       to: '0x...',
 *       value: parseEther('0.1')
 *     })
 *     console.log('Transaction hash:', hash)
 *   }
 *
 *   return <button onClick={send} disabled={!walletClient}>Send</button>
 * }
 * ```
 */
export function useWalletClient(
  options: UseWalletClientOptions
): WalletClient<Transport, Chain, KentuckySignerAccount> | null {
  const { account } = useKentuckySignerContext()
  const { chain, rpcUrl } = options

  return useMemo(() => {
    if (!account) return null

    return createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    }) as WalletClient<Transport, Chain, KentuckySignerAccount>
  }, [account, chain, rpcUrl])
}

/**
 * Hook for passkey authentication flow
 *
 * Provides state management for the authentication process.
 *
 * @returns Authentication state and trigger function
 *
 * @example
 * ```tsx
 * function PasskeyLogin() {
 *   const { login, isLoading, error } = usePasskeyAuth()
 *
 *   return (
 *     <div>
 *       <input
 *         placeholder="Account ID"
 *         onChange={(e) => setAccountId(e.target.value)}
 *       />
 *       <button onClick={() => login(accountId)} disabled={isLoading}>
 *         {isLoading ? 'Authenticating...' : 'Login'}
 *       </button>
 *       {error && <div className="error">{error.message}</div>}
 *     </div>
 *   )
 * }
 * ```
 */
export function usePasskeyAuth() {
  const { authenticate, isAuthenticating, error, clearError } =
    useKentuckySignerContext()

  const login = useCallback(
    async (accountId: string, options?: { rpId?: string }) => {
      clearError()
      await authenticate(accountId, options)
    },
    [authenticate, clearError]
  )

  return {
    login,
    isLoading: isAuthenticating,
    error,
    clearError,
  }
}

/**
 * Hook for signing messages
 *
 * @returns Sign function and loading state
 *
 * @example
 * ```tsx
 * function SignMessage() {
 *   const { signMessage, isLoading } = useSignMessage()
 *   const [signature, setSignature] = useState('')
 *
 *   async function sign() {
 *     const sig = await signMessage('Hello, World!')
 *     setSignature(sig)
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={sign} disabled={isLoading}>Sign Message</button>
 *       {signature && <div>Signature: {signature}</div>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useSignMessage() {
  const { account } = useKentuckySignerContext()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!account) {
        throw new Error('Not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const signature = await account.signMessage({ message })
        return signature
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [account]
  )

  return {
    signMessage,
    isLoading,
    error,
    isAvailable: !!account,
  }
}

/**
 * Hook for signing typed data (EIP-712)
 *
 * @returns Sign function and loading state
 */
export function useSignTypedData() {
  const { account } = useKentuckySignerContext()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const signTypedData = useCallback(
    async (typedData: Parameters<NonNullable<typeof account>['signTypedData']>[0]): Promise<string> => {
      if (!account) {
        throw new Error('Not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const signature = await account.signTypedData(typedData)
        return signature
      } catch (err) {
        setError(err as Error)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [account]
  )

  return {
    signTypedData,
    isLoading,
    error,
    isAvailable: !!account,
  }
}

/**
 * Hook to check if Kentucky Signer is ready
 *
 * @returns Whether the signer is authenticated and ready
 */
export function useIsReady(): boolean {
  const { isAuthenticated, account } = useKentuckySignerContext()
  return isAuthenticated && account !== null
}

/**
 * Hook to get the connected address
 *
 * @returns EVM address or undefined if not connected
 */
export function useAddress(): `0x${string}` | undefined {
  const { account } = useKentuckySignerContext()
  return account?.address
}
