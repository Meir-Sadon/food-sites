import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getAdminSession, type AdminSession } from '../api/admin'
import { AdminSessionContext } from './session'

type State = 'checking' | 'out' | AdminSession

/** Renders its children only for a logged-in admin; otherwise sends them to the admin login. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    let active = true
    getAdminSession()
      .then((session) => active && setState(session ?? 'out'))
      .catch(() => active && setState('out'))
    return () => {
      active = false
    }
  }, [])

  if (state === 'checking') return <p role="status">{t('admin.loading')}</p>
  if (state === 'out') return <Navigate to="/admin/login" replace />
  return <AdminSessionContext.Provider value={state}>{children}</AdminSessionContext.Provider>
}
