import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderAt } from '../test/render'

type Route = { method: string; path: string; status: number }

/** Replaces fetch with fixed responses per method and path, and records the calls. */
function mockApi(routes: Route[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const route = routes.find((r) => r.method === method && url.endsWith(r.path))
    if (!route) throw new Error(`Unexpected request: ${method} ${url}`)
    return new Response(route.status === 204 ? null : '{}', { status: route.status })
  })
}

async function submitPassword(password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('סיסמה'), password)
  await user.click(screen.getByRole('button', { name: 'כניסה' }))
}

describe('admin area', () => {
  it('shows a login form without the client top bar', () => {
    renderAt('/admin/login')
    expect(screen.getByRole('heading', { name: 'כניסת מנהל' })).toBeInTheDocument()
    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('disables submit until a password is typed', () => {
    renderAt('/admin/login')
    expect(screen.getByRole('button', { name: 'כניסה' })).toBeDisabled()
  })

  it('logs in and opens the admin area', async () => {
    const fetch = mockApi([
      { method: 'POST', path: '/api/admin/login', status: 204 },
      { method: 'GET', path: '/api/admin/me', status: 200 },
    ])
    renderAt('/admin/login')

    await submitPassword('secret')

    expect(await screen.findByRole('heading', { name: 'ניהול' })).toBeInTheDocument()
    const [, init] = fetch.mock.calls[0]
    expect(init?.credentials).toBe('include')
    expect(JSON.parse(String(init?.body))).toEqual({ password: 'secret' })
  })

  it('shows an error for a wrong password', async () => {
    mockApi([{ method: 'POST', path: '/api/admin/login', status: 401 }])
    renderAt('/admin/login')

    await submitPassword('wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('הסיסמה שגויה.')
    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('aria-invalid', 'true')
  })

  it('tells the admin to wait after too many attempts', async () => {
    mockApi([{ method: 'POST', path: '/api/admin/login', status: 429 }])
    renderAt('/admin/login')

    await submitPassword('again')

    expect(await screen.findByRole('alert')).toHaveTextContent('יותר מדי ניסיונות')
  })

  it('sends visitors without a session to the login page', async () => {
    mockApi([{ method: 'GET', path: '/api/admin/me', status: 401 }])
    renderAt('/admin')

    expect(await screen.findByRole('heading', { name: 'כניסת מנהל' })).toBeInTheDocument()
  })

  it('logs out back to the login page', async () => {
    const fetch = mockApi([
      { method: 'GET', path: '/api/admin/me', status: 200 },
      { method: 'POST', path: '/api/admin/logout', status: 204 },
    ])
    renderAt('/admin')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'יציאה' }))

    expect(await screen.findByRole('heading', { name: 'כניסת מנהל' })).toBeInTheDocument()
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/api/admin/logout'))).toBe(true),
    )
  })
})
