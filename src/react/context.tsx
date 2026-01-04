import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type { AuthSession } from '../types'
import { KentuckySignerClient } from '../client'
import {
  authenticateWithPasskey,
  isSessionValid,
  refreshSessionIfNeeded,
  LocalStorageTokenStorage,
} from '../auth'
import {
  createKentuckySignerAccount,
  type KentuckySignerAccount,
} from '../account'

/**
 * Kentucky Signer context state
 */
export interface KentuckySignerState {
  /** Whether authentication is in progress */
  isAuthenticating: boolean
  /** Whether the user is authenticated */
  isAuthenticated: boolean
  /** Current session (if authenticated) */
  session: AuthSession | null
  /** Current account (if authenticated) */
  account: KentuckySignerAccount | null
  /** Last error (if any) */
  error: Error | null
}

/**
 * Kentucky Signer context actions
 */
export interface KentuckySignerActions {
  /** Authenticate with passkey */
  authenticate: (accountId: string, options?: { rpId?: string }) => Promise<void>
  /** Logout and clear session */
  logout: () => Promise<void>
  /** Refresh session if needed */
  refreshSession: () => Promise<void>
  /** Clear any errors */
  clearError: () => void
}

/**
 * Full Kentucky Signer context value
 */
export type KentuckySignerContextValue = KentuckySignerState & KentuckySignerActions

const KentuckySignerContext = createContext<KentuckySignerContextValue | null>(null)

/**
 * Kentucky Signer provider props
 */
export interface KentuckySignerProviderProps {
  /** Base URL of the Kentucky Signer API */
  baseUrl: string
  /** Default chain ID for signing */
  defaultChainId?: number
  /** Storage key prefix for persisting tokens */
  storageKeyPrefix?: string
  /** Whether to persist session in localStorage */
  persistSession?: boolean
  /** Children */
  children: ReactNode
}

/**
 * Kentucky Signer Provider
 *
 * Wraps your app to provide Kentucky Signer authentication and signing context.
 *
 * @example
 * ```tsx
 * <KentuckySignerProvider baseUrl="https://signer.example.com">
 *   <App />
 * </KentuckySignerProvider>
 * ```
 */
export function KentuckySignerProvider({
  baseUrl,
  defaultChainId = 1,
  storageKeyPrefix = 'kentucky_signer',
  persistSession = true,
  children,
}: KentuckySignerProviderProps) {
  const [state, setState] = useState<KentuckySignerState>({
    isAuthenticating: false,
    isAuthenticated: false,
    session: null,
    account: null,
    error: null,
  })

  const client = useMemo(
    () => new KentuckySignerClient({ baseUrl }),
    [baseUrl]
  )

  const storage = useMemo(
    () => (persistSession ? new LocalStorageTokenStorage(storageKeyPrefix) : null),
    [persistSession, storageKeyPrefix]
  )

  // Create account from session
  const createAccount = useCallback(
    (session: AuthSession): KentuckySignerAccount => {
      return createKentuckySignerAccount({
        config: { baseUrl, accountId: session.accountId },
        session,
        defaultChainId,
        onSessionExpired: async () => {
          // Try to refresh the session
          const newSession = await refreshSessionIfNeeded(session, baseUrl, 0)
          setState((s) => ({
            ...s,
            session: newSession,
            account: s.account
              ? { ...s.account, session: newSession }
              : null,
          }))
          return newSession
        },
      })
    },
    [baseUrl, defaultChainId]
  )

  // Restore session from storage on mount
  useEffect(() => {
    async function restoreSession() {
      if (!storage) return

      try {
        const savedSession = localStorage.getItem(`${storageKeyPrefix}_session`)
        if (!savedSession) return

        const session: AuthSession = JSON.parse(savedSession)
        if (!isSessionValid(session)) {
          // Try to refresh
          try {
            const refreshed = await refreshSessionIfNeeded(session, baseUrl, 0)
            const account = createAccount(refreshed)
            localStorage.setItem(
              `${storageKeyPrefix}_session`,
              JSON.stringify(refreshed)
            )
            setState({
              isAuthenticating: false,
              isAuthenticated: true,
              session: refreshed,
              account,
              error: null,
            })
          } catch {
            // Clear invalid session
            localStorage.removeItem(`${storageKeyPrefix}_session`)
          }
          return
        }

        const account = createAccount(session)
        setState({
          isAuthenticating: false,
          isAuthenticated: true,
          session,
          account,
          error: null,
        })
      } catch {
        localStorage.removeItem(`${storageKeyPrefix}_session`)
      }
    }

    restoreSession()
  }, [storage, storageKeyPrefix, baseUrl, createAccount])

  // Authenticate with passkey
  const authenticate = useCallback(
    async (accountId: string, options?: { rpId?: string }) => {
      setState((s) => ({ ...s, isAuthenticating: true, error: null }))

      try {
        const session = await authenticateWithPasskey({
          baseUrl,
          accountId,
          rpId: options?.rpId,
        })

        const account = createAccount(session)

        // Persist session
        if (storage) {
          localStorage.setItem(
            `${storageKeyPrefix}_session`,
            JSON.stringify(session)
          )
        }

        setState({
          isAuthenticating: false,
          isAuthenticated: true,
          session,
          account,
          error: null,
        })
      } catch (error) {
        setState((s) => ({
          ...s,
          isAuthenticating: false,
          error: error as Error,
        }))
        throw error
      }
    },
    [baseUrl, createAccount, storage, storageKeyPrefix]
  )

  // Logout
  const logout = useCallback(async () => {
    try {
      if (state.session) {
        await client.logout(state.session.token)
      }
    } catch {
      // Ignore logout errors
    }

    // Clear storage
    if (storage) {
      localStorage.removeItem(`${storageKeyPrefix}_session`)
    }

    setState({
      isAuthenticating: false,
      isAuthenticated: false,
      session: null,
      account: null,
      error: null,
    })
  }, [client, state.session, storage, storageKeyPrefix])

  // Refresh session
  const refreshSession = useCallback(async () => {
    if (!state.session) return

    try {
      const refreshed = await refreshSessionIfNeeded(state.session, baseUrl)

      if (refreshed !== state.session) {
        const account = createAccount(refreshed)

        if (storage) {
          localStorage.setItem(
            `${storageKeyPrefix}_session`,
            JSON.stringify(refreshed)
          )
        }

        setState((s) => ({
          ...s,
          session: refreshed,
          account,
        }))
      }
    } catch (error) {
      setState((s) => ({ ...s, error: error as Error }))
    }
  }, [state.session, baseUrl, createAccount, storage, storageKeyPrefix])

  // Clear error
  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
  }, [])

  const value: KentuckySignerContextValue = useMemo(
    () => ({
      ...state,
      authenticate,
      logout,
      refreshSession,
      clearError,
    }),
    [state, authenticate, logout, refreshSession, clearError]
  )

  return (
    <KentuckySignerContext.Provider value={value}>
      {children}
    </KentuckySignerContext.Provider>
  )
}

/**
 * Use the Kentucky Signer context
 *
 * Must be used within a KentuckySignerProvider.
 *
 * @returns Kentucky Signer context value
 */
export function useKentuckySignerContext(): KentuckySignerContextValue {
  const context = useContext(KentuckySignerContext)
  if (!context) {
    throw new Error(
      'useKentuckySignerContext must be used within a KentuckySignerProvider'
    )
  }
  return context
}
