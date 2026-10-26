import { ApiError, apiFetch, apiJson, send } from './client'

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

/** Who made a change: one of the admins, or the platform's console (through the ops API). */
export type AuditActor = AdminActor | 'console'

export interface AuditEntry {
  id: number
  at: string
  actor: AuditActor
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

export type FeedbackKind = 'Problem' | 'Comment'

export const FEEDBACK_TEXT_MAX_LENGTH = 2000

export interface FeedbackInput {
  kind: FeedbackKind
  text: string
  /** The admin page (or `/` for the client site) the report is about. */
  page: string | null
}

/** A problem or comment the admin sent to the platform; the console marks it handled. */
export interface Feedback extends FeedbackInput {
  id: number
  actor: AdminActor
  createdAt: string
  isHandled: boolean
}

export const feedbackApi = {
  list: () => apiJson<Feedback[]>('/api/admin/feedback'),
  send: (input: FeedbackInput) => apiJson<Feedback>('/api/admin/feedback', send('POST', input)),
}

/** The console's token for this site (master only). `createdAt` is null while there is none. */
export interface OpsTokenState {
  createdAt: string | null
}

export const opsTokenApi = {
  get: () => apiJson<OpsTokenState>('/api/admin/ops-token'),
  /** The token itself is in this answer only. */
  create: () => apiJson<{ token: string; createdAt: string }>('/api/admin/ops-token', send('POST')),
  revoke: () => apiJson<void>('/api/admin/ops-token', send('DELETE')),
}

/** A client who registered on this site (FoodSite.Api `ClientsController`). */
export interface RegisteredClient {
  id: number
  fullName: string
  /** Local form, "0501234567" */
  phone: string
  email: string | null
  /** Missing for accounts made before registration dates were kept. */
  createdAt: string | null
  orders: number
  withGoogle: boolean
}

export interface RegisteredClients {
  total: number
  clients: RegisteredClient[]
}

export const listClients = () => apiJson<RegisteredClients>('/api/admin/clients')
