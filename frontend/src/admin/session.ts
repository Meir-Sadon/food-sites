import { createContext, useContext } from 'react'
import type { AdminSession } from '../api/admin'

/** The logged-in admin, set by RequireAdmin around the admin area. */
export const AdminSessionContext = createContext<AdminSession | null>(null)

export function useAdminSession(): AdminSession {
  const session = useContext(AdminSessionContext)
  if (!session) throw new Error('useAdminSession needs RequireAdmin')
  return session
}
