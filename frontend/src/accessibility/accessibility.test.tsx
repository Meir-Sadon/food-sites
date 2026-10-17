import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessibilityInfo } from '../api/site'
import { publicApi, site } from '../test/catalogData'
import { adminSession, fakeApi, invalid } from '../test/fakeApi'
import { renderAt } from '../test/render'
import { PREFS_KEY } from './prefs'

const info = (patch: Partial<AccessibilityInfo> = {}): AccessibilityInfo => ({
  name: null,
  phone: null,
  email: null,
  notes: null,
  updatedAt: null,
  ...patch,
})

const root = document.documentElement

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('accessibility menu', () => {
  async function openMenu() {
    fakeApi({ ...publicApi })
    renderAt('/about')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'תפריט נגישות' }))
    return { user, panel: await screen.findByRole('dialog', { name: 'נגישות' }) }
  }

  it('opens from a small button and closes with Escape, returning focus to it', async () => {
    const { user } = await openMenu()
    const button = screen.getByRole('button', { name: 'תפריט נגישות' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button).toHaveFocus()
  })

  it('turns an option on for the whole page and remembers it in this browser', async () => {
    const { user, panel } = await openMenu()
    const contrast = within(panel).getByRole('button', { name: 'ניגודיות גבוהה' })
    expect(contrast).toHaveAttribute('aria-pressed', 'false')

    await user.click(contrast)

    expect(contrast).toHaveAttribute('aria-pressed', 'true')
    expect(root.dataset.a11yContrast).toBe('high')
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toMatchObject({ highContrast: true })

    await user.click(within(panel).getByRole('button', { name: 'עצירת אנימציות' }))
    expect(root.dataset.a11yMotion).toBe('off')
  })

  it('makes the text larger and smaller within its limits', async () => {
    const { user, panel } = await openMenu()
    const smaller = within(panel).getByRole('button', { name: 'הקטנת הטקסט' })
    const larger = within(panel).getByRole('button', { name: 'הגדלת הטקסט' })
    expect(smaller).toBeDisabled()

    await user.click(larger)
    expect(root.style.fontSize).toBe('115%')
    for (let i = 0; i < 6; i++) if (!(larger as HTMLButtonElement).disabled) await user.click(larger)
    expect(root.style.fontSize).toBe('175%')
    await user.click(smaller)
    expect(root.style.fontSize).toBe('150%')
  })

  it('resets everything, and finds its choices again on the next visit', async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ textSize: 2, grayscale: true }))
    const { user, panel } = await openMenu()
    expect(root.style.fontSize).toBe('130%')
    expect(root).toHaveAttribute('data-a11y-grayscale')
    expect(within(panel).getByRole('button', { name: 'גווני אפור' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(panel).getByRole('button', { name: 'איפוס' }))

    expect(root.style.fontSize).toBe('')
    expect(root).not.toHaveAttribute('data-a11y-grayscale')
    expect(localStorage.getItem(PREFS_KEY)).toBeNull()
  })

  it('ignores a damaged saved value', async () => {
    localStorage.setItem(PREFS_KEY, '{"textSize":99,"highContrast":"yes"')
    await openMenu()
    expect(root.style.fontSize).toBe('')
    expect(root).not.toHaveAttribute('data-a11y-contrast')
  })

  it('links to the accessibility statement', async () => {
    const { user, panel } = await openMenu()
    await user.click(within(panel).getByRole('link', { name: 'הצהרת נגישות' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'הצהרת נגישות' })).toBeInTheDocument()
  })
})

describe('accessibility statement', () => {
  it('shows the coordinator the admin set, with the update date', async () => {
    fakeApi({
      ...publicApi,
      'GET /api/accessibility': () =>
        info({ name: 'דנה', phone: '052-1112222', email: 'a11y@example.com', notes: 'הטופס בערבית לא נגיש', updatedAt: '2026-10-17T10:00:00Z' }),
    })
    renderAt('/accessibility')
    expect(await screen.findByRole('heading', { level: 1, name: 'הצהרת נגישות' })).toBeInTheDocument()
    const contact = await screen.findByText('רכז הנגישות')
    const address = contact.closest('address')!
    expect(within(address).getByText('דנה')).toBeInTheDocument()
    expect(within(address).getByRole('link', { name: /052-1112222/ })).toHaveAttribute('href', 'tel:0521112222')
    expect(within(address).getByRole('link', { name: /a11y@example.com/ })).toHaveAttribute('href', 'mailto:a11y@example.com')
    expect(screen.getByText('הטופס בערבית לא נגיש')).toBeInTheDocument()
    expect(screen.getByText(/הצהרה זו עודכנה לאחרונה/)).toBeInTheDocument()
  })

  it('falls back to the main contact when no coordinator was set', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ contact: { name: 'אמא', phone: '050-1234567', address: 'חיפה', email: 'ima@example.com', openingHours: null } }), 'GET /api/accessibility': () => info() })
    renderAt('/accessibility')
    const label = await screen.findByText('פרטי העסק')
    const address = label.closest('address')!
    await waitFor(() => expect(within(address).getByText('אמא')).toBeInTheDocument())
    expect(within(address).getByRole('link', { name: /050-1234567/ })).toBeInTheDocument()
    expect(screen.queryByText(/הצהרה זו עודכנה/)).toBeNull()
  })

  it('is linked from the footer of every page', async () => {
    fakeApi({ ...publicApi })
    renderAt('/about')
    expect(await screen.findByRole('link', { name: 'הצהרת נגישות', description: '' })).toHaveAttribute('href', '/accessibility')
  })
})

describe('admin accessibility coordinator', () => {
  it('saves the coordinator and shows the server errors', async () => {
    let saved: unknown
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/contact': () => ({ name: 'אמא', phone: '050-1234567', address: null, email: null, openingHours: null }),
      'GET /api/admin/notify-phones': () => [],
      'GET /api/admin/accessibility': () => info(),
      'PUT /api/admin/accessibility': (_, body) => {
        const input = body as AccessibilityInfo
        if (input.email === 'bad') return invalid({ email: ['email'] })
        saved = input
        return { ...input, updatedAt: '2026-10-17T10:00:00Z' }
      },
    })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const region = await screen.findByRole('region', { name: 'רכז נגישות והצהרת נגישות' })
    await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())

    await user.type(within(region).getByLabelText('שם רכז הנגישות (לא חובה)'), 'דנה')
    await user.type(within(region).getByLabelText('אימייל (לא חובה)'), 'bad')
    await user.click(within(region).getByRole('button', { name: 'שמירה' }))
    expect(await within(region).findByText('כתובת האימייל לא תקינה.')).toBeInTheDocument()

    await user.clear(within(region).getByLabelText('אימייל (לא חובה)'))
    await user.type(within(region).getByLabelText('אימייל (לא חובה)'), 'a11y@example.com')
    await user.click(within(region).getByRole('button', { name: 'שמירה' }))
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(saved).toMatchObject({ name: 'דנה', email: 'a11y@example.com' })
    expect(api.sent('PUT', '/api/admin/accessibility')).toHaveLength(2)
  })
})
