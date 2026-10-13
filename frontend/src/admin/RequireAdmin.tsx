import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getAdminSession, type AdminSession } from '../api/admin'
import { AdminSessionContext } from './session'
import { excludeThisDevice } from '../usage/track'

type State = 'checking' | 'out' | AdminSession

/** Renders its children only for a logged-in admin; otherwise sends them to the admin login. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const location = useLocation()
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    let active = true
    getAdminSession()
      .then((session) => {
        // The owner's own visits to the site would swell the usage report.
        if (session) excludeThisDevice()
        if (active) setState(session ?? 'out')
      })
      .catch(() => active && setState('out'))
    return () => {
      active = false
    }
  }, [])

  if (state === 'checking') return <p role="status">{t('admin.loading')}</p>
  // The page asked for is kept, so a link into the admin (such as an order in the owner's mail) opens it after signing in.
  if (state === 'out') return <Navigate to="/admin/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <AdminSessionContext.Provider value={state}>{children}</AdminSessionContext.Provider>
}
