import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UsageReport } from '../api/operations'
import { publicApi } from '../test/catalogData'
import { adminSession, fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'
import { DEVICE_KEY, EXCLUDED_KEY, resetUsageForTests, usageTracking } from './track'

const confirmation = {
  id: 7,
  supplyDate: '2026-10-09',
  fulfillmentMethod: 'Delivery',
  paymentMethod: 'OnDelivery',
  total: 70,
  paymentPhone: null,
  needsReview: false,
  items: [{ dishName: 'עוף בתנור', optionLabel: 'שלם', quantity: 1, unitPrice: 70, lineTotal: 70, isAddOn: false }],
}

const days = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    day: `2026-10-${String(i + 1).padStart(2, '0')}`,
    visitors: i,
    started: 0,
    submitted: 0,
    orders: 0,
  }))

const report = (patch: Partial<UsageReport> = {}): UsageReport => ({
  from: '2026-09-11',
  to: '2026-10-10',
  approximate: false,
  keptSince: '2026-07-13',
  totalDevices: 340,
  funnel: { visitors: 200, newVisitors: 120, started: 50, submitted: 20 },
  registered: { total: 45, new: 6 },
  orders: {
    orders: 24, sales: 2400, averageOrder: 100, customers: 18, returningCustomers: 9,
    newCustomerOrders: 10, returningCustomerOrders: 14,
  },
  days: days(10),
  ordersByWeekday: [5, 4, 3, 2, 4, 6, 0],
  ordersByHour: Array.from({ length: 24 }, (_, h) => (h === 20 ? 10 : 0)),
  topDishes: [{ dishName: 'עוף בתנור', quantity: 30, sales: 2100 }],
  ...patch,
})

beforeEach(() => {
  localStorage.clear()
  resetUsageForTests()
  usageTracking.enabled = true
})

afterEach(() => {
  usageTracking.enabled = false
})

describe('Usage tracking', () => {
  it('reports a visit, a started order and a sent order with one random device id', async () => {
    const api = fakeApi({ ...publicApi, 'POST /api/orders': () => confirmation, 'POST /api/usage': () => undefined })
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    const user = userEvent.setup()

    const card = screen.getByRole('article', { name: 'עוף בתנור' })
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוף בתנור' }))
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    await screen.findByRole('dialog')

    const deviceId = localStorage.getItem(DEVICE_KEY)
    expect(deviceId).toMatch(/^[\w-]{16,64}$/)
    // Each step once, however many dishes were added.
    expect(api.sent('POST', '/api/usage').map((c) => c.body)).toEqual([
      { deviceId, kind: 'Visit' },
      { deviceId, kind: 'OrderStarted' },
      { deviceId, kind: 'OrderSubmitted' },
    ])
  })

  it('sends nothing from the admin’s device', async () => {
    localStorage.setItem(EXCLUDED_KEY, '1')
    const api = fakeApi(publicApi)
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    expect(api.sent('POST', '/api/usage')).toEqual([])
    expect(localStorage.getItem(DEVICE_KEY)).toBeNull()
  })

  it('marks the device as the admin’s once the admin logs in', async () => {
    localStorage.setItem(DEVICE_KEY, 'an-earlier-device-id')
    fakeApi({ ...adminSession, 'GET /api/admin/usage\\?.*': () => report() })
    renderAt('/admin/usage')
    await screen.findByRole('heading', { level: 1, name: 'שימוש באתר' })
    expect(localStorage.getItem(EXCLUDED_KEY)).toBe('1')
    expect(localStorage.getItem(DEVICE_KEY)).toBeNull()
  })
})

describe('Usage report', () => {
  it('shows the steps, their rates, returning customers and helper data for the last 30 days', async () => {
    const api = fakeApi({ ...adminSession, 'GET /api/admin/usage\\?.*': () => report() })
    renderAt('/admin/usage')

    const tiles = await screen.findByRole('list', { name: 'סיכום' })
    const tile = (name: string) => within(tiles).getByText(name).closest('li')!
    expect(tile('נכנסו לאתר')).toHaveTextContent('200')
    expect(tile('נכנסו לאתר')).toHaveTextContent('120 מכשירים חדשים')
    expect(tile('התחילו הזמנה')).toHaveTextContent('25% מהנכנסים')
    expect(tile('שלחו הזמנה')).toHaveTextContent('10% מהנכנסים')
    expect(tile('לקוחות רשומים')).toHaveTextContent('6 נרשמו בטווח')
    expect(tile('לקוחות חוזרים')).toHaveTextContent('50% מתוך 18 שהזמינו בטווח')
    expect(tile('הזמנה ממוצעת')).toHaveTextContent('₪100')

    expect(screen.getByText('40% מהשלב הקודם · 30 לא המשיכו')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'לפי יום בשבוע' })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: 'עוף בתנור 30 ₪2,100' })).toBeInTheDocument()
    expect(screen.queryByText(/נספר יותר מפעם אחת/)).not.toBeInTheDocument()

    const [call] = api.sent('GET', '').filter((c) => c.path.includes('/api/admin/usage'))
    const params = new URL(call.path, 'http://x').searchParams
    const span = (Date.parse(params.get('to')!) - Date.parse(params.get('from')!)) / 86_400_000
    expect(span).toBe(29)
  })

  it('asks for another range and warns when old days are only counted per day', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/usage\\?from=2026-01-01&to=2026-03-31': () => report({ approximate: true }),
      'GET /api/admin/usage\\?.*': () => report(),
    })
    renderAt('/admin/usage')
    const user = userEvent.setup()
    await screen.findByRole('list', { name: 'סיכום' })

    await user.selectOptions(screen.getByLabelText('תקופה'), 'טווח אחר')
    await user.clear(screen.getByLabelText('מתאריך'))
    await user.type(screen.getByLabelText('מתאריך'), '2026-01-01')
    await user.clear(screen.getByLabelText('עד תאריך'))
    await user.type(screen.getByLabelText('עד תאריך'), '2026-03-31')

    expect(await screen.findByText(/הנתונים המפורטים נשמרים מ־13\/07\/2026/)).toBeInTheDocument()
    expect(api.sent('GET', '?from=2026-01-01&to=2026-03-31')).toHaveLength(1)
  })

  it('explains a range the server refused', async () => {
    fakeApi({
      ...adminSession,
      'GET /api/admin/usage\\?.*': () => ({ status: 400, body: { errors: { To: ['rangeTooLong'] } } }),
    })
    renderAt('/admin/usage')
    expect(await screen.findByRole('alert')).toHaveTextContent('אפשר להציג עד שנה אחת בכל פעם.')
  })
})
