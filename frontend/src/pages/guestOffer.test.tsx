import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Confirmation } from '../api/site'
import { confirmNoAdjustments } from '../test/adjust'
import { menu, publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const confirmation: Confirmation = {
  id: 7, supplyDate: '2026-10-09', fulfillmentMethod: 'Delivery', paymentMethod: 'OnDelivery', total: 70, paymentPhone: null,
  needsReview: false, items: [{ dishName: 'עוף בתנור', optionLabel: 'שלם', quantity: 1, unitPrice: 70, lineTotal: 70, isAddOn: false }],
}

const profile = {
  id: 5, phone: '0501234567', fullName: '', city: '', street: '', houseNumber: '', apartment: '', buildingType: 'House', buildingOther: '',
  address: '', email: null, birthday: null, ethnicBackground: null, addresses: [],
}

const dishCard = (name: string) => screen.getByRole('article', { name })

/** The chicken dish at the guest's price, or at the client's after the sign-up. */
const discounted = () => menu({ dishes: menu().dishes.map((d) => (d.name === 'עוף בתנור' ? { ...d, options: d.options.map((o) => ({ ...o, price: 56 })) } : d)) })

async function open(extra: Record<string, unknown> = {}, features = ['priceLists']) {
  let loggedIn = false
  const api = fakeApi({
    ...publicApi,
    'GET /api/site': () => site({ features: features as never }),
    'GET /api/account/me': () => ({ status: 401, body: {} }),
    'GET /api/menu': () => (loggedIn ? discounted() : menu()),
    'GET /api/guest-offer': () => ({ available: true, maxOrders: 3 }),
    'POST /api/account/login': () => {
      loggedIn = true
      return { profile, isNew: true }
    },
    'POST /api/orders': () => confirmation,
    ...extra,
  } as Parameters<typeof fakeApi>[0])
  renderAt('/')
  await screen.findByRole('heading', { level: 2, name: 'עופות' })
  return { api, user: userEvent.setup() }
}

async function fillAndSend(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה להזמנה/ }))
  await confirmNoAdjustments(user)
  await user.type(screen.getByLabelText('שם מלא'), 'דנה')
  await user.type(screen.getByLabelText('רחוב'), 'הרצל')
  await user.type(screen.getByLabelText('מספר בית'), '1')
  await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
  await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('the sign-up offer to a guest who sends an order', () => {
  it('offers the registered prices, with the phone filled in and the order limit, and sends nothing yet', async () => {
    const { api, user } = await open()
    await fillAndSend(user)

    const dialog = await screen.findByRole('dialog', { name: 'הנחות והטבות ללקוחות רשומים' })
    expect(within(dialog).getByText(/ללקוחות רשומים מגיעות הנחות והטבות/)).toBeInTheDocument()
    expect(within(dialog).getByText('ההטבה תקפה ל-3 ההזמנות הראשונות בלבד.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('טלפון')).toHaveValue('050-123-4567')
    expect(api.sent('POST', '/api/orders')).toHaveLength(0)
  })

  it('signs the guest up by phone, shows the new prices and sends only when pressed again', async () => {
    const { api, user } = await open()
    await fillAndSend(user)

    const dialog = await screen.findByRole('dialog', { name: 'הנחות והטבות ללקוחות רשומים' })
    await user.click(within(dialog).getByRole('button', { name: 'להירשם ולראות את המחירים' }))

    expect(await screen.findByText(/נרשמתם! מחירי ההזמנה עודכנו/)).toBeInTheDocument()
    expect(api.sent('POST', '/api/account/login')[0].body).toEqual({ phone: '0501234567' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.sent('POST', '/api/orders')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    expect(await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })).toBeInTheDocument()
    expect(api.sent('GET', '/api/guest-offer')).toHaveLength(1)
  })

  it('sends as a guest when asked to, and remembers the answer for the visit', async () => {
    const { api, user } = await open()
    await fillAndSend(user)
    const dialog = await screen.findByRole('dialog', { name: 'הנחות והטבות ללקוחות רשומים' })
    await user.click(within(dialog).getByRole('button', { name: 'לשלוח כאורח' }))

    expect(await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })).toBeInTheDocument()
    expect(api.sent('POST', '/api/orders')).toHaveLength(1)
    expect(sessionStorage.getItem('guestOfferAsked')).toBe('1')
  })

  it('stays on the order when the guest goes back', async () => {
    const { api, user } = await open()
    await fillAndSend(user)
    const dialog = await screen.findByRole('dialog', { name: 'הנחות והטבות ללקוחות רשומים' })
    await user.click(within(dialog).getByRole('button', { name: 'חזרה להזמנה' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.sent('POST', '/api/orders')).toHaveLength(0)
  })

  it('says so when the account has no discount to give', async () => {
    const { user } = await open({ 'GET /api/menu': () => menu() })
    await fillAndSend(user)
    const dialog = await screen.findByRole('dialog', { name: 'הנחות והטבות ללקוחות רשומים' })
    await user.click(within(dialog).getByRole('button', { name: 'להירשם ולראות את המחירים' }))
    expect(await screen.findByText(/אין כרגע הנחות שחלות עליו/)).toBeInTheDocument()
  })

  it('sends straight away when there is no discount to offer', async () => {
    const { api, user } = await open({ 'GET /api/guest-offer': () => ({ available: false, maxOrders: null }) })
    await fillAndSend(user)
    expect(await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })).toBeInTheDocument()
    expect(api.sent('POST', '/api/orders')).toHaveLength(1)
  })

  it('does not even ask the server when the site has no price lists', async () => {
    const { api, user } = await open({}, [])
    await fillAndSend(user)
    expect(await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })).toBeInTheDocument()
    expect(api.sent('GET', '/api/guest-offer')).toHaveLength(0)
  })

  it('shows a one-order limit as the first order only', async () => {
    const { user } = await open({ 'GET /api/guest-offer': () => ({ available: true, maxOrders: 1 }) })
    await fillAndSend(user)
    expect(await screen.findByText('ההטבה תקפה להזמנה הראשונה בלבד.')).toBeInTheDocument()
  })
})
