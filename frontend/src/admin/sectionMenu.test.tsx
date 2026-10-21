import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { popup, settings } from '../test/catalogData'
import { adminSession, fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

function open(path = '/admin/appearance') {
  let saved = settings()
  const api = fakeApi({
    ...adminSession,
    'GET /api/admin/settings': () => saved,
    'PUT /api/admin/settings': (_, body) => (saved = { ...saved, ...(body as object) }),
    'GET /api/admin/popup': () => ({ body: popup() }),
    'GET /api/admin/social-links': () => [],
  })
  renderAt(path)
  return { api, user: userEvent.setup() }
}

describe('Settings side menu', () => {
  it('starts with every section open and lists them in the menu', async () => {
    open()
    const menu = await screen.findByRole('navigation', { name: 'קטגוריות בדף' })
    expect(within(menu).getAllByRole('button').map((b) => b.textContent)).toContain('עיגול פינות')
    const toggle = within(await screen.findByRole('region', { name: 'עיגול פינות' })).getByRole('button', { name: 'עיגול פינות' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens a folded section when it is picked in the menu', async () => {
    const { user } = open()
    const menu = await screen.findByRole('navigation', { name: 'קטגוריות בדף' })
    const region = screen.getByRole('region', { name: 'עיגול פינות' })
    await user.click(within(region).getByRole('button', { name: 'עיגול פינות' }))
    expect(within(region).getByRole('button', { name: 'עיגול פינות' })).toHaveAttribute('aria-expanded', 'false')
    await user.click(within(menu).getByRole('button', { name: 'עיגול פינות' }))
    expect(within(region).getByRole('button', { name: 'עיגול פינות' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(region).getByRole('radio', { name: /מרובע/ })).toBeVisible()
  })

  it('shows a save button beside a changed section, saves, and says saved for a moment', async () => {
    const { api, user } = open()
    const menu = await screen.findByRole('navigation', { name: 'קטגוריות בדף' })
    await user.click(within(menu).getByRole('button', { name: 'עיגול פינות' }))
    const region = screen.getByRole('region', { name: 'עיגול פינות' })
    await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())
    expect(within(menu).queryByRole('button', { name: /שמירת כל השינויים/ })).not.toBeInTheDocument()

    await user.click(within(region).getByRole('radio', { name: /מרובע/ }))
    expect(await within(menu).findByText('*')).toBeInTheDocument()
    await user.click(await within(menu).findByRole('button', { name: /שמירת כל השינויים/ }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/settings')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ corners: 'square' })
    expect(await within(menu).findByText('נשמר.')).toBeInTheDocument()
    expect(within(menu).queryByRole('button', { name: /שמירת כל השינויים/ })).not.toBeInTheDocument()
    await waitFor(() => expect(within(menu).queryByText('נשמר.')).not.toBeInTheDocument(), { timeout: 4000 })
  })

  it('gives the entry pop-up and the social and tracking settings tabs of their own', async () => {
    open('/admin/popup')
    expect(await screen.findByRole('heading', { level: 1, name: 'פופ-אפ בכניסה לאתר' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'מעקב שיווקי' })).not.toBeInTheDocument()
  })

  it('keeps marketing tracking and social links on one tab', async () => {
    open('/admin/social')
    expect(await screen.findByRole('region', { name: 'מעקב שיווקי' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'קישורים לרשתות חברתיות' })).toBeInTheDocument()
  })
})
