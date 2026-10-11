import { ApiError, apiFetch, apiJson } from './client'

/** The two admins of a site: the platform's master (same on every site) and the business owner. */
export type AdminActor = 'master' | 'owner'

export interface AdminSession {
  role: string
  actor: AdminActor
  username: string
}

export async function adminLogin(username: string, password: string): Promise<void> {
  await apiFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

/** The site owner changes their own password. */
export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/api/admin/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) })
}

/** The master sets a new owner password, for an owner who forgot theirs. */
export async function resetOwnerPassword(newPassword: string): Promise<void> {
  await apiFetch('/api/admin/owner-password', { method: 'PUT', body: JSON.stringify({ newPassword }) })
}

export async function adminLogout(): Promise<void> {
  await apiFetch('/api/admin/logout', { method: 'POST' })
}

/** The logged-in admin, or null when the browser holds no valid admin session. */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    return await apiJson<AdminSession>('/api/admin/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export type AuditAction = 'Added' | 'Modified' | 'Deleted' | 'LoggedIn'

export interface AuditChange {
  field: string
  from: string | null
  to: string | null
  /** A password: recorded as changed, never with its values. */
  secret: boolean
}

export interface AuditEntry {
  id: number
  at: string
  actor: AdminActor
  action: AuditAction
  entityType: string | null
  entityId: string | null
  label: string | null
  changes: AuditChange[]
}

export const auditPageSize = 50

/** Newest first; pass the last id seen as `before` for the next page. */
export function listAudit(before?: number): Promise<AuditEntry[]> {
  const query = new URLSearchParams({ limit: String(auditPageSize) })
  if (before !== undefined) query.set('before', String(before))
  return apiJson<AuditEntry[]>(`/api/admin/audit?${query}`)
}
