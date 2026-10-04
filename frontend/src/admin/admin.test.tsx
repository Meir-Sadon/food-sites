import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { settings, supplyDays } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const settingsRoutes = {
  'GET /api/admin/settings': () => settings(),
  'GET /api/admin/supply-days': () => supplyDays(),
  'GET /api/admin/closed-dates': () => [],
}

async function submitPassword(password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('סיסמה'), password)
  await user.click(screen.getByRole('button', { name: 'כניסה' }))
}

describe('admin login', () => {
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

  it('logs in and opens General settings', async () => {
    const api = fakeApi({
      'POST /api/admin/login': () => undefined,
      'GET /api/admin/me': () => ({}),
      ...settingsRoutes,
    })
    renderAt('/admin/login')

    await submitPassword('secret')

    expect(await screen.findByRole('heading', { level: 1, name: 'הגדרות כלליות' })).toBeInTheDocument()
    const [login] = api.sent('POST', '/api/admin/login')
    expect(login.body).toEqual({ password: 'secret' })
    expect(login.headers['X-Kuskus-Request']).toBe('1')
  })

  it('shows an error for a wrong password', async () => {
    fakeApi({ 'POST /api/admin/login': () => ({ status: 401 }) })
    renderAt('/admin/login')

    await submitPassword('wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('הסיסמה שגויה.')
    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('aria-invalid', 'true')
  })

  it('tells the admin to wait after too many attempts', async () => {
    fakeApi({ 'POST /api/admin/login': () => ({ status: 429 }) })
    renderAt('/admin/login')

    await submitPassword('again')

    expect(await screen.findByRole('alert')).toHaveTextContent('יותר מדי ניסיונות')
  })

  it('sends visitors without a session to the login page', async () => {
    fakeApi({ 'GET /api/admin/me': () => ({ status: 401 }) })
    renderAt('/admin/dishes')

    expect(await screen.findByRole('heading', { name: 'כניסת מנהל' })).toBeInTheDocument()
  })
})

describe('admin layout', () => {
  it('has tabs for orders, settings, categories, dishes, contacts and reports', async () => {
    fakeApi({ 'GET /api/admin/me': () => ({}), ...settingsRoutes })
    renderAt('/admin')

    const nav = await screen.findByRole('navigation', { name: 'תפריט ניהול' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'הזמנות',
      'הגדרות כלליות',
      'קטגוריות',
      'מנות',
      'אנשי קשר',
      'דוחות',
    ])
    expect(await within(nav).findByRole('link', { current: 'page' })).toHaveTextContent('הגדרות כלליות')
  })

  it('logs out back to the login page', async () => {
    const api = fakeApi({ 'GET /api/admin/me': () => ({}), 'POST /api/admin/logout': () => undefined, ...settingsRoutes })
    renderAt('/admin/settings')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'יציאה' }))

    expect(await screen.findByRole('heading', { name: 'כניסת מנהל' })).toBeInTheDocument()
    await waitFor(() => expect(api.sent('POST', '/api/admin/logout')).toHaveLength(1))
  })
})
