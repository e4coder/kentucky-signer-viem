import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import type { AuthSession } from '../types'
import type { TwoFactorCodes } from '../account'
import { KentuckySignerClient } from '../client'
import { SecureKentuckySignerClient } from '../secure-client'
import {
  authenticateWithPasskey,
  authenticateWithPassword as authWithPassword,
  isSessionValid,
  refreshSessionIfNeeded,
  LocalStorageTokenStorage,
} from '../auth'
import {
  createKentuckySignerAccount,
  type KentuckySignerAccount,
} from '../account'
import {
  EphemeralKeyManager,
  IndexedDBEphemeralKeyStorage,
  MemoryEphemeralKeyStorage,
} from '../ephemeral'

/**
 * 2FA prompt requirements
 */
export interface TwoFactorPromptState {
  /** Whether the 2FA prompt is visible */
  isVisible: boolean
  /** Whether TOTP is required */
  totpRequired: boolean
  /** Whether PIN is required */
  pinRequired: boolean
  /** Expected PIN length (4 or 6) */
  pinLength: number
  /** Callback to resolve with codes */
  resolve?: (codes: TwoFactorCodes | null) => void
}

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
  /** Whether ephemeral key is bound to the token */
  ephemeralKeyBound: boolean
  /** Whether secure mode (ephemeral key signing) is enabled */
  secureMode: boolean
  /** Whether ephemeral keys are persisted in IndexedDB (survives refresh) */
  persistEphemeralKeys: boolean
  /** 2FA prompt state */
  twoFactorPrompt: TwoFactorPromptState
}

/**
 * Kentucky Signer context actions
 */
export interface KentuckySignerActions {
  /** Authenticate with passkey or set an existing session */
  authenticate: (accountId: string, options?: { rpId?: string; session?: AuthSession }) => Promise<void>
  /** Authenticate with password */
  authenticatePassword: (accountId: string, password: string) => Promise<void>
  /** Logout and clear session */
  logout: () => Promise<void>
  /** Refresh session if needed */
  refreshSession: () => Promise<void>
  /** Clear any errors */
  clearError: () => void
  /** Toggle secure mode (ephemeral key signing) */
  setSecureMode: (enabled: boolean) => void
  /** Toggle ephemeral key persistence (IndexedDB vs memory) */
  setPersistEphemeralKeys: (enabled: boolean) => void
  /** Get the ephemeral public key (for secure mode binding during external auth) */
  getEphemeralPublicKey: () => Promise<string | undefined>
  /** Submit 2FA codes (called by 2FA prompt UI) */
  submit2FA: (codes: TwoFactorCodes) => void
  /** Cancel 2FA prompt */
  cancel2FA: () => void
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
  /** Whether to use ephemeral key signing for enhanced security */
  useEphemeralKeys?: boolean
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
  useEphemeralKeys = false,
  children,
}: KentuckySignerProviderProps) {
  // Load persist ephemeral keys setting from localStorage, default to IndexedDB if available
  const getInitialPersistSetting = (): boolean => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(`${storageKeyPrefix}_persist_ephemeral_keys`)
      if (saved !== null) {
        return saved === 'true'
      }
    }
    // Default to IndexedDB persistence if available
    return typeof indexedDB !== 'undefined'
  }

  // Load secure mode setting from localStorage, falling back to useEphemeralKeys prop
  const getInitialSecureModeSetting = (): boolean => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(`${storageKeyPrefix}_secure_mode`)
      if (saved !== null) {
        return saved === 'true'
      }
    }
    // Fall back to prop value
    return useEphemeralKeys
  }

  // Default 2FA prompt state
  const defaultTwoFactorPrompt: TwoFactorPromptState = {
    isVisible: false,
    totpRequired: false,
    pinRequired: false,
    pinLength: 6,
  }

  const [state, setState] = useState<KentuckySignerState>({
    isAuthenticating: false,
    isAuthenticated: false,
    session: null,
    account: null,
    error: null,
    ephemeralKeyBound: false,
    secureMode: getInitialSecureModeSetting(),
    persistEphemeralKeys: getInitialPersistSetting(),
    twoFactorPrompt: defaultTwoFactorPrompt,
  })

  // Ephemeral key storage instances - we keep both and switch between them
  const indexedDBStorage = useMemo(
    () => typeof indexedDB !== 'undefined' ? new IndexedDBEphemeralKeyStorage() : null,
    []
  )
  const memoryStorage = useMemo(() => new MemoryEphemeralKeyStorage(), [])

  // Current active storage based on persist setting
  const ephemeralKeyStorage = state.persistEphemeralKeys && indexedDBStorage
    ? indexedDBStorage
    : memoryStorage

  // Single ephemeral key manager instance that we update storage on
  const ephemeralKeyManagerRef = useRef<EphemeralKeyManager | null>(null)
  if (!ephemeralKeyManagerRef.current) {
    ephemeralKeyManagerRef.current = new EphemeralKeyManager(ephemeralKeyStorage)
  }
  const ephemeralKeyManager = ephemeralKeyManagerRef.current

  const client = useMemo(
    () => new KentuckySignerClient({ baseUrl }),
    [baseUrl]
  )

  // Secure client for ephemeral key signing - uses shared key manager
  const secureClient = useMemo(
    () => new SecureKentuckySignerClient({
      baseUrl,
      ephemeralKeyManager,
    }),
    [baseUrl, ephemeralKeyManager]
  )

  const storage = useMemo(
    () => (persistSession ? new LocalStorageTokenStorage(storageKeyPrefix) : null),
    [persistSession, storageKeyPrefix]
  )

  // 2FA callback handler - shows prompt and waits for user input
  const handle2FARequired = useCallback(async (requirements: {
    totpRequired: boolean
    pinRequired: boolean
    pinLength: number
  }): Promise<TwoFactorCodes | null> => {
    return new Promise((resolve) => {
      setState((s) => ({
        ...s,
        twoFactorPrompt: {
          isVisible: true,
          totpRequired: requirements.totpRequired,
          pinRequired: requirements.pinRequired,
          pinLength: requirements.pinLength,
          resolve,
        },
      }))
    })
  }, [])

  // Create account from session
  const createAccount = useCallback(
    (session: AuthSession, useSecureClient: boolean = false): KentuckySignerAccount => {
      return createKentuckySignerAccount({
        config: { baseUrl, accountId: session.accountId },
        session,
        defaultChainId,
        secureClient: useSecureClient ? secureClient : undefined,
        onSessionExpired: async () => {
          // Try to refresh the session (use secure client if in secure mode)
          try {
            const newSession = await refreshSessionIfNeeded(
              session,
              baseUrl,
              0,
              useSecureClient ? secureClient : undefined
            )
            setState((s) => ({
              ...s,
              session: newSession,
              account: s.account
                ? { ...s.account, session: newSession }
                : null,
            }))
            return newSession
          } catch (error) {
            // Refresh failed - clear auth state
            if (storage) {
              localStorage.removeItem(`${storageKeyPrefix}_session`)
            }
            setState((s) => ({
              ...s,
              isAuthenticated: false,
              session: null,
              account: null,
              error: error as Error,
            }))
            throw error // Re-throw so the calling code knows auth failed
          }
        },
        on2FARequired: handle2FARequired,
      })
    },
    [baseUrl, defaultChainId, secureClient, handle2FARequired, storage, storageKeyPrefix]
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
          // Try to refresh (use secure client if in secure mode)
          try {
            const savedSecureMode = localStorage.getItem(`${storageKeyPrefix}_secure_mode`)
            const isSecureMode = savedSecureMode === 'true'
            const refreshed = await refreshSessionIfNeeded(
              session,
              baseUrl,
              0,
              isSecureMode ? secureClient : undefined
            )
            localStorage.setItem(
              `${storageKeyPrefix}_session`,
              JSON.stringify(refreshed)
            )
            setState((s) => {
              const account = createAccount(refreshed, s.secureMode)
              return {
                isAuthenticating: false,
                isAuthenticated: true,
                session: refreshed,
                account,
                error: null,
                ephemeralKeyBound: false,
                secureMode: s.secureMode,
                persistEphemeralKeys: s.persistEphemeralKeys,
                twoFactorPrompt: s.twoFactorPrompt,
              }
            })
          } catch {
            // Clear invalid session
            localStorage.removeItem(`${storageKeyPrefix}_session`)
          }
          return
        }

        setState((s) => {
          const account = createAccount(session, s.secureMode)
          return {
            isAuthenticating: false,
            isAuthenticated: true,
            session,
            account,
            error: null,
            ephemeralKeyBound: false,
            secureMode: s.secureMode,
            persistEphemeralKeys: s.persistEphemeralKeys,
            twoFactorPrompt: s.twoFactorPrompt,
          }
        })
      } catch {
        localStorage.removeItem(`${storageKeyPrefix}_session`)
      }
    }

    restoreSession()
  }, [storage, storageKeyPrefix, baseUrl, createAccount, secureClient])

  // Authenticate with passkey or existing session
  const authenticate = useCallback(
    async (accountId: string, options?: { rpId?: string; session?: AuthSession }) => {
      setState((s) => ({ ...s, isAuthenticating: true, error: null }))

      try {
        let session: AuthSession
        let ephemeralKeyBound = false

        if (options?.session) {
          // Use provided session (no ephemeral binding possible)
          session = options.session
        } else {
          // Get ephemeral public key if secure mode is enabled
          let ephemeralPublicKey: string | undefined
          if (state.secureMode) {
            ephemeralPublicKey = await ephemeralKeyManager.getPublicKey()
          }

          // Authenticate with passkey
          session = await authenticateWithPasskey({
            baseUrl,
            accountId,
            rpId: options?.rpId,
            ephemeralPublicKey,
          })

          ephemeralKeyBound = !!ephemeralPublicKey
        }

        // Persist session
        if (storage) {
          localStorage.setItem(
            `${storageKeyPrefix}_session`,
            JSON.stringify(session)
          )
        }

        setState((s) => {
          const account = createAccount(session, s.secureMode)
          return {
            isAuthenticating: false,
            isAuthenticated: true,
            session,
            account,
            error: null,
            ephemeralKeyBound,
            secureMode: s.secureMode,
            persistEphemeralKeys: s.persistEphemeralKeys,
            twoFactorPrompt: s.twoFactorPrompt,
          }
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
    [baseUrl, createAccount, storage, storageKeyPrefix, state.secureMode, ephemeralKeyManager]
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

    // Clear ephemeral keys if using secure mode
    if (ephemeralKeyManager) {
      await ephemeralKeyManager.clear()
    }

    setState((s) => ({
      isAuthenticating: false,
      isAuthenticated: false,
      session: null,
      account: null,
      error: null,
      ephemeralKeyBound: false,
      secureMode: s.secureMode,
      persistEphemeralKeys: s.persistEphemeralKeys,
      twoFactorPrompt: defaultTwoFactorPrompt,
    }))
  }, [client, state.session, storage, storageKeyPrefix, ephemeralKeyManager])

  // Refresh session
  const refreshSession = useCallback(async () => {
    if (!state.session) return

    try {
      // Use secure client if in secure mode for ephemeral key rotation
      const refreshed = await refreshSessionIfNeeded(
        state.session,
        baseUrl,
        60000,
        state.secureMode ? secureClient : undefined
      )

      if (refreshed !== state.session) {
        if (storage) {
          localStorage.setItem(
            `${storageKeyPrefix}_session`,
            JSON.stringify(refreshed)
          )
        }

        setState((s) => {
          const account = createAccount(refreshed, s.secureMode)
          return {
            ...s,
            session: refreshed,
            account,
          }
        })
      }
    } catch (error) {
      // Refresh failed - clear auth state
      if (storage) {
        localStorage.removeItem(`${storageKeyPrefix}_session`)
      }
      setState((s) => ({
        ...s,
        isAuthenticated: false,
        session: null,
        account: null,
        error: error as Error,
      }))
    }
  }, [state.session, baseUrl, createAccount, storage, storageKeyPrefix, state.secureMode, secureClient])

  // Clear error
  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
  }, [])

  // Toggle secure mode - recreates account with new client
  const setSecureMode = useCallback((enabled: boolean) => {
    // Persist the setting to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${storageKeyPrefix}_secure_mode`, String(enabled))
    }

    setState((s) => {
      // Recreate account with new secure mode setting if authenticated
      const newAccount = s.session ? createAccount(s.session, enabled) : null
      return {
        ...s,
        secureMode: enabled,
        account: newAccount,
      }
    })
  }, [createAccount, storageKeyPrefix])

  // Toggle ephemeral key persistence - migrates key between IndexedDB and memory storage
  const setPersistEphemeralKeys = useCallback(async (enabled: boolean) => {
    // Determine the new storage backend
    const newStorage = enabled && indexedDBStorage
      ? indexedDBStorage
      : memoryStorage

    // Migrate the key to the new storage (preserves existing key)
    await ephemeralKeyManager.migrateStorage(newStorage)

    // Persist the setting to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${storageKeyPrefix}_persist_ephemeral_keys`, String(enabled))
    }

    // Update state
    setState((s) => ({
      ...s,
      persistEphemeralKeys: enabled,
    }))
  }, [ephemeralKeyManager, storageKeyPrefix, indexedDBStorage, memoryStorage])

  // Get ephemeral public key for external auth flows
  const getEphemeralPublicKey = useCallback(async (): Promise<string | undefined> => {
    if (!state.secureMode) {
      return undefined
    }
    return ephemeralKeyManager.getPublicKey()
  }, [state.secureMode, ephemeralKeyManager])

  // Authenticate with password
  const authenticatePassword = useCallback(
    async (accountId: string, password: string) => {
      setState((s) => ({ ...s, isAuthenticating: true, error: null }))

      try {
        // Get ephemeral public key if secure mode is enabled
        let ephemeralPublicKey: string | undefined
        console.log('[KentuckySigner] authenticatePassword - secureMode:', state.secureMode)
        if (state.secureMode) {
          ephemeralPublicKey = await ephemeralKeyManager.getPublicKey()
          console.log('[KentuckySigner] Got ephemeral public key for binding:', ephemeralPublicKey?.substring(0, 50) + '...')
        }

        // Authenticate with password
        const session = await authWithPassword({
          baseUrl,
          accountId,
          password,
          ephemeralPublicKey,
        })

        const ephemeralKeyBound = !!ephemeralPublicKey

        // Persist session
        if (storage) {
          localStorage.setItem(
            `${storageKeyPrefix}_session`,
            JSON.stringify(session)
          )
        }

        setState((s) => {
          const account = createAccount(session, s.secureMode)
          return {
            isAuthenticating: false,
            isAuthenticated: true,
            session,
            account,
            error: null,
            ephemeralKeyBound,
            secureMode: s.secureMode,
            persistEphemeralKeys: s.persistEphemeralKeys,
            twoFactorPrompt: s.twoFactorPrompt,
          }
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
    [baseUrl, createAccount, storage, storageKeyPrefix, state.secureMode, ephemeralKeyManager]
  )

  // Submit 2FA codes
  const submit2FA = useCallback((codes: TwoFactorCodes) => {
    const { resolve } = state.twoFactorPrompt
    if (resolve) {
      resolve(codes)
    }
    setState((s) => ({
      ...s,
      twoFactorPrompt: defaultTwoFactorPrompt,
    }))
  }, [state.twoFactorPrompt])

  // Cancel 2FA prompt
  const cancel2FA = useCallback(() => {
    const { resolve } = state.twoFactorPrompt
    if (resolve) {
      resolve(null)
    }
    setState((s) => ({
      ...s,
      twoFactorPrompt: defaultTwoFactorPrompt,
    }))
  }, [state.twoFactorPrompt])

  const value: KentuckySignerContextValue = useMemo(
    () => ({
      ...state,
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
    }),
    [state, authenticate, authenticatePassword, logout, refreshSession, clearError, setSecureMode, setPersistEphemeralKeys, getEphemeralPublicKey, submit2FA, cancel2FA]
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
