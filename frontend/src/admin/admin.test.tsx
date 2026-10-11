import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { settings, supplyDays } from '../test/catalogData'
import { adminSession, fakeApi, masterSession } from '../test/fakeApi'
import { renderAt } from '../test/render'

const settingsRoutes = {
  'GET /api/admin/settings': () => settings(),
  'GET /api/admin/supply-days': () => supplyDays(),
  'GET /api/admin/closed-dates': () => [],
}

async function submitPassword(password: string, username = 'admin') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('שם משתמש'), username)
  await user.type(screen.getByLabelText('סיסמה'), password)
  await user.click(screen.getByRole('button', { name: 'כניסה' }))
}

describe('admin login', () => {
  it('shows a login form without the client top bar', () => {
    renderAt('/admin/login')
    expect(screen.getByRole('heading', { name: 'כניסת מנהל' })).toBeInTheDocument()
    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('type', 'text')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('centers the form and links back to the home page', () => {
    renderAt('/admin/login')
    expect(screen.getByRole('main')).toHaveClass('admin-login')
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
  })

  it('disables submit until a user name and a password are typed', async () => {
    renderAt('/admin/login')
    const submit = screen.getByRole('button', { name: 'כניסה' })
    expect(submit).toBeDisabled()
    await userEvent.setup().type(screen.getByLabelText('סיסמה'), 'secret')
    expect(submit).toBeDisabled()
  })

  it('logs in and opens General settings', async () => {
    const api = fakeApi({
      'POST /api/admin/login': () => undefined,
      ...adminSession,
      ...settingsRoutes,
    })
    renderAt('/admin/login')

    await submitPassword('secret', ' Admin ')

    expect(await screen.findByRole('heading', { level: 1, name: 'הגדרות כלליות' })).toBeInTheDocument()
    const [login] = api.sent('POST', '/api/admin/login')
    expect(login.body).toEqual({ username: 'Admin', password: 'secret' })
    expect(login.headers['X-Food-Site-Request']).toBe('1')
  })

  it('shows an error for a wrong password', async () => {
    fakeApi({ 'POST /api/admin/login': () => ({ status: 401 }) })
    renderAt('/admin/login')

    await submitPassword('wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('שם המשתמש או הסיסמה שגויים.')
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
  it('groups the pages into reports, client site display and site settings, with a link home', async () => {
    fakeApi({ ...adminSession, ...settingsRoutes })
    renderAt('/admin')

    const nav = await screen.findByRole('navigation', { name: 'תפריט ניהול' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'דוחות',
      'תצוגה באתר לקוח',
      'הגדרות אתר',
      'לדף הבית',
    ])
    expect(await within(nav).findByRole('link', { current: 'page' })).toHaveTextContent('הגדרות אתר')
    expect(within(nav).getByText('בעל העסק')).toBeInTheDocument()
    const pages = screen.getByRole('navigation', { name: 'הגדרות אתר' })
    expect(within(pages).getAllByRole('link').map((l) => l.textContent)).toEqual(['הגדרות כלליות', 'הודעות וואטסאפ'])
    expect(within(pages).getByRole('link', { current: 'page' })).toHaveTextContent('הגדרות כלליות')
  })

  it('opens a section at its first page and lists that section\'s pages', async () => {
    fakeApi({ ...adminSession, ...settingsRoutes, 'GET /api/admin/categories': () => [], 'GET /api/admin/dishes': () => [] })
    renderAt('/admin/settings')
    const user = userEvent.setup()

    await user.click(within(await screen.findByRole('navigation', { name: 'תפריט ניהול' })).getByRole('link', { name: 'תצוגה באתר לקוח' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'מנות' })).toBeInTheDocument()
    const pages = screen.getByRole('navigation', { name: 'תצוגה באתר לקוח' })
    expect(within(pages).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'מנות',
      'קטגוריות',
      'עיצוב האתר',
      'אנשי קשר',
      'חוות דעת',
    ])
    expect(screen.queryByRole('navigation', { name: 'דוחות' })).not.toBeInTheDocument()
  })

  it('keeps the reports section on a page opened from one of its pages', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/orders': () => [] })
    renderAt('/admin/orders/route?date=2026-10-14')

    const pages = await screen.findByRole('navigation', { name: 'דוחות' })
    expect(within(pages).getAllByRole('link').map((l) => l.textContent)).toEqual(['הזמנות', 'סטטיסטיקה', 'שימוש באתר', 'יומן שינויים'])
  })

  it('shows when the master admin is logged in', async () => {
    fakeApi({ ...masterSession, ...settingsRoutes })
    renderAt('/admin')

    const nav = await screen.findByRole('navigation', { name: 'תפריט ניהול' })
    expect(within(nav).getByText('מנהל ראשי')).toBeInTheDocument()
  })

  it('logs out back to the login page', async () => {
    const api = fakeApi({ ...adminSession, 'POST /api/admin/logout': () => undefined, ...settingsRoutes })
    renderAt('/admin/settings')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'יציאה' }))

    expect(await screen.findByRole('heading', { name: 'כניסת מנהל' })).toBeInTheDocument()
    await waitFor(() => expect(api.sent('POST', '/api/admin/logout')).toHaveLength(1))
  })
})
