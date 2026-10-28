import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../api/account'
import { DRAFT_KEY } from '../order/draft'
import { popup, publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const shown = popup({
  enabled: true,
  title: 'מבצע חג',
  body: 'עשר אחוז הנחה',
  imageUrl: 'https://img.test/popup.jpg',
  buttonText: 'להזמנה',
  buttonUrl: 'https://example.com/sale',
})

const profile: Profile = {
  id: 1,
  phone: '0501234567',
  fullName: 'דנה כהן',
  city: 'חיפה',
  street: 'הרצל',
  houseNumber: '1',
  apartment: '',
  address: 'הרצל 1, חיפה',
  email: null,
  birthday: null,
  ethnicBackground: null,
  addresses: [],
}

const ordered = (daysAgo: number) => ({
  id: 5,
  supplyDate: '2026-10-02',
  status: 'Delivered',
  fulfillmentMethod: 'Delivery',
  paymentMethod: 'OnDelivery',
  isPaid: true,
  total: 100,
  createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  items: [],
})

const loggedIn = (orders: unknown[] = []) => ({
  'GET /api/account/me': () => profile,
  'GET /api/account/orders': () => orders,
  'GET /api/account/favorites': () => [],
})

/** A pop-up that opens at once, named by its title, with the given conditions. */
const when = (slot: number, title: string, conditions: Partial<ReturnType<typeof popup>>) => popup({ slot, enabled: true, title, ...conditions })

const pause = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms))

afterEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('Entry pop-up', () => {
  it('opens with its picture, text and button when the site opens, and closes on the X', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [shown] }) })
    renderAt('/')

    const dialog = await screen.findByRole('dialog', { name: 'מבצע חג' })
    expect(dialog).toHaveTextContent('עשר אחוז הנחה')
    expect(dialog.querySelector('img')).toHaveAttribute('src', 'https://img.test/popup.jpg')
    const button = screen.getByRole('link', { name: 'להזמנה' })
    expect(button).toHaveAttribute('href', 'https://example.com/sale')
    expect(button).toHaveAttribute('target', '_blank')
    expect(button).toHaveAttribute('rel', 'noopener noreferrer')

    await userEvent.setup().click(screen.getAllByRole('button', { name: 'סגירה' })[0])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has no button unless it has both its text and its address', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [popup({ enabled: true, title: 'שלום', buttonText: 'להזמנה' })] }) })
    renderAt('/')
    await screen.findByRole('dialog', { name: 'שלום' })
    expect(screen.queryByRole('link', { name: 'להזמנה' })).not.toBeInTheDocument()
  })

  it('opens a page of the site in place and closes', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [popup({ enabled: true, title: 'שלום', buttonText: 'אודות', buttonUrl: '/about' })] }) })
    renderAt('/')
    const dialog = await screen.findByRole('dialog', { name: 'שלום' })
    await userEvent.setup().click(within(dialog).getByRole('link', { name: 'אודות' }))
    expect(screen.queryByRole('dialog', { name: 'שלום' })).not.toBeInTheDocument()
  })

  it('is not shown when the site names none', async () => {
    fakeApi({ ...publicApi })
    renderAt('/about')
    await screen.findByRole('heading', { name: 'אודות' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens once per visit when the admin chose that', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [{ ...shown, frequency: 'session' }] }) })
    const first = renderAt('/')
    await userEvent.setup().click((await screen.findAllByRole('button', { name: 'סגירה' }))[0])
    first.unmount()

    renderAt('/')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens on every load by default', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [shown] }) })
    const first = renderAt('/')
    await screen.findByRole('dialog', { name: 'מבצע חג' })
    first.unmount()

    renderAt('/')
    expect(await screen.findByRole('dialog', { name: 'מבצע חג' })).toBeInTheDocument()
  })

  it('opens on the home page only', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [shown] }) })
    renderAt('/about')
    await screen.findByRole('heading', { name: 'אודות' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('waits the delay the admin set', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [{ ...shown, delaySeconds: 1 }] }) })
    renderAt('/')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: 'מבצע חג' }, { timeout: 2500 })).toBeInTheDocument()
  })

  it('opens only when the pointer leaves through the top when the admin chose exit', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [{ ...shown, trigger: 'exit' }] }) })
    renderAt('/')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.mouseOut(document.body, { clientY: 300 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The listener arms after the site settings load, which can take longer than the wait above on a busy runner.
    await waitFor(() => {
      fireEvent.mouseOut(document.body, { clientY: 0 })
      expect(screen.getByRole('dialog', { name: 'מבצע חג' })).toBeInTheDocument()
    })
  })

  it('opens the pop-ups one after the other, the lowest slot first', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [when(1, 'ראשון', {}), when(2, 'שני', {}), when(3, 'שלישי', {})] }) })
    renderAt('/')
    const user = userEvent.setup()

    for (const title of ['ראשון', 'שני', 'שלישי']) {
      const dialog = await screen.findByRole('dialog', { name: title })
      await user.click(within(dialog).getAllByRole('button', { name: 'סגירה' })[0])
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('marks each pop-up seen on its own when they open once per visit', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [when(1, 'ראשון', { frequency: 'session' }), when(2, 'שני', {})] }) })
    const first = renderAt('/')
    const user = userEvent.setup()
    await user.click(within(await screen.findByRole('dialog', { name: 'ראשון' })).getAllByRole('button', { name: 'סגירה' })[0])
    await user.click(within(await screen.findByRole('dialog', { name: 'שני' })).getAllByRole('button', { name: 'סגירה' })[0])
    first.unmount()

    renderAt('/')
    expect(await screen.findByRole('dialog', { name: 'שני' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'ראשון' })).not.toBeInTheDocument()
  })

  describe('conditions', () => {
    it('shows by login: logged in, logged out, or both', async () => {
      fakeApi({
        ...publicApi,
        ...loggedIn(),
        'GET /api/site': () => site({ popups: [when(1, 'מחובר', { login: 'loggedIn' }), when(2, 'אורח', { login: 'loggedOut' }), when(3, 'כולם', { login: 'both' })] }),
      })
      renderAt('/')
      const user = userEvent.setup()
      await user.click(within(await screen.findByRole('dialog', { name: 'מחובר' })).getAllByRole('button', { name: 'סגירה' })[0])
      await user.click(within(await screen.findByRole('dialog', { name: 'כולם' })).getAllByRole('button', { name: 'סגירה' })[0])
      await pause()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows a guest only what is for guests', async () => {
      fakeApi({
        ...publicApi,
        'GET /api/site': () => site({ popups: [when(1, 'מחובר', { login: 'loggedIn' }), when(2, 'אורח', { login: 'loggedOut' })] }),
      })
      renderAt('/')
      expect(await screen.findByRole('dialog', { name: 'אורח' })).toBeInTheDocument()
      await userEvent.setup().click(screen.getAllByRole('button', { name: 'סגירה' })[0])
      await pause()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('tells active clients from inactive ones by their last order and the period the admin set', async () => {
      const popups = [when(1, 'פעיל', { activity: 'active' }), when(2, 'לא פעיל', { activity: 'inactive' })]
      fakeApi({ ...publicApi, ...loggedIn([ordered(20)]), 'GET /api/site': () => site({ popups, inactiveAfter: { amount: 4, unit: 'week' } }) })
      const recent = renderAt('/')
      expect(await screen.findByRole('dialog', { name: 'פעיל' })).toBeInTheDocument()
      await userEvent.setup().click(screen.getAllByRole('button', { name: 'סגירה' })[0])
      await pause()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      recent.unmount()

      vi.restoreAllMocks()
      fakeApi({ ...publicApi, ...loggedIn([ordered(40)]), 'GET /api/site': () => site({ popups, inactiveAfter: { amount: 4, unit: 'week' } }) })
      renderAt('/')
      expect(await screen.findByRole('dialog', { name: 'לא פעיל' })).toBeInTheDocument()
    })

    it('counts a client who never ordered as inactive, and ignores cancelled orders', async () => {
      const popups = [when(1, 'לא פעיל', { activity: 'inactive' })]
      fakeApi({ ...publicApi, ...loggedIn([{ ...ordered(1), status: 'Cancelled' }]), 'GET /api/site': () => site({ popups }) })
      renderAt('/')
      expect(await screen.findByRole('dialog', { name: 'לא פעיל' })).toBeInTheDocument()
    })

    it('does not show an activity condition to a guest, who has no orders to judge by', async () => {
      fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [when(1, 'פעיל', { activity: 'active' }), when(2, 'לא פעיל', { activity: 'inactive' })] }) })
      renderAt('/')
      await screen.findByRole('heading', { level: 1 })
      await pause(300)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('waits for an order restored from the draft this browser kept', async () => {
      const popups = [when(1, 'חזרתם', { orderSource: 'draft' }), when(2, 'מהאחרונה', { orderSource: 'last' })]
      fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups }) })
      renderAt('/')
      await screen.findByRole('heading', { level: 1 })
      await pause()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens once an order was restored from the draft', async () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ selections: { 1: { optionId: 11, quantity: 1, addOns: {} } } }))
      fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [when(1, 'חזרתם', { orderSource: 'draft' }), when(2, 'מהאחרונה', { orderSource: 'last' })] }) })
      renderAt('/')
      expect(await screen.findByRole('dialog', { name: 'חזרתם' })).toBeInTheDocument()
      await userEvent.setup().click(screen.getAllByRole('button', { name: 'סגירה' })[0])
      await pause()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows by the order total: above one amount and below another', async () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ selections: { 1: { optionId: 11, quantity: 1, addOns: {} } } }))
      const popups = [
        when(1, 'מעל 100', { orderTotal: true, minTotal: 100 }),
        when(2, 'בין 50 ל-80', { orderTotal: true, minTotal: 50, maxTotal: 80 }),
        when(3, 'מתחת ל-60', { orderTotal: true, maxTotal: 60 }),
      ]
      fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups }) })
      renderAt('/')
      // The order in the draft is ₪70.
      expect(await screen.findByRole('dialog', { name: 'בין 50 ל-80' })).toBeInTheDocument()
      await userEvent.setup().click(screen.getAllByRole('button', { name: 'סגירה' })[0])
      await pause()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not show an order total condition while there is no order', async () => {
      fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [when(1, 'יש הזמנה', { orderTotal: true })] }) })
      renderAt('/')
      await screen.findByRole('heading', { level: 1 })
      await pause(300)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('needs every condition that is set', async () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ selections: { 1: { optionId: 11, quantity: 1, addOns: {} } } }))
      fakeApi({
        ...publicApi,
        ...loggedIn([ordered(1)]),
        'GET /api/site': () => site({ popups: [when(1, 'מחובר ופעיל', { login: 'loggedIn', activity: 'active', orderSource: 'draft' }), when(2, 'מחובר ולא פעיל', { login: 'loggedIn', activity: 'inactive' })] }),
      })
      renderAt('/')
      expect(await screen.findByRole('dialog', { name: 'מחובר ופעיל' })).toBeInTheDocument()
      await userEvent.setup().click(screen.getAllByRole('button', { name: 'סגירה' })[0])
      await pause()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('checks the other conditions at the moment the visitor is about to leave', async () => {
      fakeApi({ ...publicApi, 'GET /api/site': () => site({ popups: [when(1, 'לא יוצג', { trigger: 'exit', login: 'loggedIn' }), when(2, 'יוצג', { trigger: 'exit', login: 'loggedOut' })] }) })
      renderAt('/')
      await screen.findByRole('heading', { level: 1 })
      await waitFor(() => {
        fireEvent.mouseOut(document.body, { clientY: 0 })
        expect(screen.getByRole('dialog', { name: 'יוצג' })).toBeInTheDocument()
      })
      expect(screen.queryByRole('dialog', { name: 'לא יוצג' })).not.toBeInTheDocument()
    })
  })
})
