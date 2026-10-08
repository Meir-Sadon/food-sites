import { ApiError, apiFetch } from './client'

export async function adminLogin(password: string): Promise<void> {
  await apiFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) })
}

export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/api/admin/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) })
}

export async function adminLogout(): Promise<void> {
  await apiFetch('/api/admin/logout', { method: 'POST' })
}

/** True when the browser holds a valid admin session. */
export async function isAdminLoggedIn(): Promise<boolean> {
  try {
    await apiFetch('/api/admin/me')
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return false
    throw error
  }
}
