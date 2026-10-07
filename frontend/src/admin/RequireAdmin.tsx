import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { isAdminLoggedIn } from '../api/admin'

type State = 'checking' | 'in' | 'out'

/** Renders its children only for a logged-in admin; otherwise sends them to the admin login. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    let active = true
    isAdminLoggedIn()
      .then((loggedIn) => active && setState(loggedIn ? 'in' : 'out'))
      .catch(() => active && setState('out'))
    return () => {
      active = false
    }
  }, [])

  if (state === 'checking') return <p role="status">{t('admin.loading')}</p>
  if (state === 'out') return <Navigate to="/admin/login" replace />
  return children
}
