import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminOrder } from '../../api/operations'
import { adminSession, fakeApi } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const order = (id: number, patch: Partial<AdminOrder> = {}): AdminOrder => ({
  id,
  phone: '0501234567',
  name: `לקוח ${id}`,
  address: 'הרצל 1, אשקלון',
  supplyDate: '2030-01-06',
  fulfillmentMethod: 'Delivery',
  notes: null,
  paymentMethod: 'OnDelivery',
  isPaid: false,
  paidWith: null,
  paymentComment: null,
  status: 'New',
  total: 100,
  createdAt: '2030-01-01T10:00:00Z',
  isGuest: false,
  needsReview: false,
  deliveryHour: null,
  hourFull: false,
  items: [{ id: id * 10, parentItemId: null, dishName: 'עוף בתנור', optionLabel: 'שלם', quantity: 2, unitPrice: 50, lineTotal: 100 }],
  ...patch,
})

const orders = [
  order(1, { address: 'בן גוריון 5, דירה 3, אשקלון', deliveryHour: '10:00:00', notes: 'קומה שנייה', isPaid: true, paidWith: 'Bit' }),
  order(2, { deliveryHour: '09:00:00' }),
  order(3, { fulfillmentMethod: 'Pickup' }),
  order(4, { status: 'Cancelled' }),
  order(5, { address: 'הרצל 9, אשקלון', deliveryHour: '09:00:00', total: 80 }),
]

function openReport() {
  const api = fakeApi({
    ...adminSession,
    'GET /api/admin/orders\\?from=2030-01-06&to=2030-01-06': () => orders,
    'GET /api/admin/contact': () => ({ name: null, phone: null, address: 'הנשיא 3, אשקלון', email: null, openingHours: null }),
  })
  renderAt('/admin/orders/route?date=2030-01-06')
  return { api, user: userEvent.setup() }
}

const stopTitles = () => screen.getAllByRole('listitem', { name: /^עצירה/ }).map((li) => li.getAttribute('aria-label'))

describe('Driver report', () => {
  it('lists the day\'s deliveries in driving order with times, Waze, contents and what to collect', async () => {
    openReport()

    expect(await screen.findByRole('heading', { level: 1, name: 'דוח שליח ל־06/01/2030' })).toBeInTheDocument()
    await screen.findByRole('listitem', { name: 'עצירה 1: הזמנה #2' })
    // Pickups and cancelled orders are not driven to.
    expect(stopTitles()).toEqual(['עצירה 1: הזמנה #2', 'עצירה 2: הזמנה #5', 'עצירה 3: הזמנה #1'])
    expect(screen.getByText('3 משלוחים · יציאה ב־08:50 · סיום בערך ב־10:05 · לגבות ₪180')).toBeInTheDocument()

    const first = screen.getByRole('listitem', { name: 'עצירה 1: הזמנה #2' })
    expect(within(first).getByText('לצאת ב־08:50')).toBeInTheDocument()
    expect(within(first).getByText(/ביקש בין 09:00 ל־10:00/)).toBeInTheDocument()
    expect(within(first).getByText('לגבות ₪100')).toBeInTheDocument()

    const last = screen.getByRole('listitem', { name: 'עצירה 3: הזמנה #1' })
    expect(within(last).getByText('שולם')).toBeInTheDocument()
    expect(within(last).getByText('הערות: קומה שנייה')).toBeInTheDocument()
    expect(within(last).getByText(/2 × עוף בתנור \(שלם\)/)).toBeInTheDocument()
    expect(within(last).getByRole('link', { name: /Waze/ })).toHaveAttribute(
      'href',
      `https://waze.com/ul?q=${encodeURIComponent('בן גוריון 5, אשקלון')}&navigate=yes`,
    )
    expect(within(last).getByRole('link', { name: /חיוג/ })).toHaveAttribute('href', 'tel:0501234567')
  })

  it('builds the route from the orders picked, and lets the admin move a stop', async () => {
    const { user } = openReport()
    await screen.findByRole('listitem', { name: 'עצירה 1: הזמנה #2' })

    await user.click(screen.getByText('הזמנות במסלול: 3 מתוך 3'))
    await user.click(screen.getByRole('checkbox', { name: /הזמנה #5/ }))
    expect(stopTitles()).toEqual(['עצירה 1: הזמנה #2', 'עצירה 2: הזמנה #1'])

    await user.click(screen.getByRole('button', { name: 'העברה למטה: הזמנה #2' }))
    expect(stopTitles()).toEqual(['עצירה 1: הזמנה #1', 'עצירה 2: הזמנה #2'])
    // Order 2 asked for 9:00 but now comes after a 10:00 stop.
    expect(within(screen.getByRole('listitem', { name: 'עצירה 2: הזמנה #2' })).getByRole('status')).toHaveTextContent(/אחרי השעה/)

    await user.click(screen.getByRole('button', { name: 'חזרה לסדר המומלץ' }))
    expect(stopTitles()).toEqual(['עצירה 1: הזמנה #2', 'עצירה 2: הזמנה #1'])
  })

  it('sends the whole route to the driver as one WhatsApp message', async () => {
    openReport()
    await screen.findByRole('listitem', { name: 'עצירה 1: הזמנה #2' })

    const href = screen.getByRole('link', { name: 'שליחה לשליח ב־WhatsApp' }).getAttribute('href')!
    const text = decodeURIComponent(href.replace('https://wa.me/?text=', ''))
    expect(text).toContain('1. לצאת ב־08:50 · הזמנה #2 · לקוח 2 · 0501234567')
    expect(text).toContain('https://waze.com/ul?q=')
    expect(text).toContain('הערות: קומה שנייה')
  })

  it('is linked from a day with deliveries on the Orders tab', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/orders.*': () => [order(2, { supplyDate: '2030-01-06' })] })
    renderAt('/admin/orders')
    expect(await screen.findByRole('link', { name: /דוח שליח/ })).toHaveAttribute('href', '/admin/orders/route?date=2030-01-06')
  })
})
