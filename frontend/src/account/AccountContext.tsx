import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { accountApi, type Profile } from '../api/account'
import { AccountContext } from './useAccount'

/** Finds out once whether the visitor is logged in (the session cookie), for every client page. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    accountApi
      .me()
      .then((profile) => active && setUser(profile))
      // Not logged in (or the API is unreachable): the visitor is simply a guest.
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await accountApi.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, loading, setUser, logout }), [user, loading, logout])
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}
