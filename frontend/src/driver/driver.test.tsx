import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { DeliveryInput, DriverRoute, DriverStop } from '../api/driver'
import { fakeApi, invalid } from '../test/fakeApi'
import { renderAt } from '../test/render'

const token = 'A'.repeat(32)

const stop = (orderId: number, position: number, patch: Partial<DriverStop> = {}): DriverStop => ({
  orderId,
  position,
  plannedArrival: '12:30:00',
  name: `לקוח ${orderId}`,
  phone: '0501234567',
  address: 'הרצל 1, דירה 4, אשקלון',
  deliveryHour: '12:00:00',
  notes: null,
  items: [{ id: orderId * 10, parentItemId: null, dishName: 'קוסקוס', optionLabel: 'גדול', quantity: 2 }],
  total: 120,
  paymentMethod: 'OnDelivery',
  isPaid: false,
  paidWith: null,
  paymentComment: null,
  paidByDriver: false,
  cancelled: false,
  outcome: null,
  reportedAt: null,
  deliveryNote: null,
  proofUrl: null,
  ...patch,
})

const route = (): DriverRoute => ({
  date: '2030-01-06',
  validThrough: '2030-01-07',
  stops: [
    stop(3, 0, { outcome: 'Delivered', reportedAt: '2030-01-06T10:00:00Z', isPaid: true, paidWith: 'Cash', paidByDriver: true }),
    stop(1, 1, { notes: 'קומה שנייה' }),
    stop(2, 2, { isPaid: true, paidWith: 'Bit' }),
    stop(4, 3, { cancelled: true }),
  ],
})

function open(path = '', handlers = {}) {
  const data = route()
  // Handlers given first, so they win over the general ones below.
  const api = fakeApi({
    ...handlers,
    [`GET /api/driver/${token}`]: () => data,
    [`PUT /api/driver/${token}/orders/(\\d+)/delivery`]: (match: RegExpMatchArray, body: unknown) => {
      const input = body as DeliveryInput
      const current = data.stops.find((s) => s.orderId === Number(match[1]))!
      return {
        ...current,
        outcome: input.outcome,
        reportedAt: '2030-01-06T10:30:00Z',
        deliveryNote: input.note || null,
        ...(input.paidWith ? { isPaid: true, paidWith: input.paidWith, paidByDriver: true } : {}),
      }
    },
  })
  renderAt(`/d/${token}${path}`)
  return { api, user: userEvent.setup() }
}

describe('Driver page', () => {
  it('shows the stops in order with progress, the next stop and what is left to collect', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: 'משלוחים ל־06/01/2030' })).toBeInTheDocument()
    expect(screen.getByText('דיווחת על 1 מתוך 3 עצירות')).toBeInTheDocument()
    // Stop 1 still needs collecting; stop 2 was paid ahead; the cancelled stop doesn't count.
    expect(screen.getByText(/נשאר לגבות: ₪120/)).toHaveTextContent('גבית: ₪120')

    const stops = screen.getAllByRole('listitem', { name: /^עצירה/ })
    expect(stops.map((li) => li.getAttribute('aria-label'))).toEqual([
      'עצירה 1: לקוח 3',
      'עצירה 2: לקוח 1',
      'עצירה 3: לקוח 2',
      'עצירה 4: לקוח 4',
    ])
    expect(within(stops[0]).getByText('נמסר')).toBeInTheDocument()
    expect(within(stops[1]).getByText('העצירה הבאה')).toBeInTheDocument()
    expect(within(stops[1]).getByText('לגבות ₪120')).toBeInTheDocument()
    expect(within(stops[1]).getByText('מתוכנן ל־12:30 · הלקוח ביקש 12:00–13:00')).toBeInTheDocument()
    expect(within(stops[1]).getByRole('link', { name: /Waze/ })).toHaveAttribute(
      'href',
      `https://waze.com/ul?q=${encodeURIComponent('הרצל 1, אשקלון')}&navigate=yes`,
    )
    expect(within(stops[2]).getByText('שולם מראש, אין מה לגבות')).toBeInTheDocument()
    expect(within(stops[3]).getByText('בוטלה')).toBeInTheDocument()
  })

  it('opens a stop with the order, the client\'s contact and the client\'s note', async () => {
    const { user } = open()
    const item = await screen.findByRole('listitem', { name: 'עצירה 2: לקוח 1' })
    await user.click(within(item).getByRole('link', { name: /פרטי ההזמנה ודיווח/ }))

    expect(await screen.findByRole('heading', { name: /לקוח 1/ })).toBeInTheDocument()
    expect(screen.getByText('2 × קוסקוס (גדול)')).toBeInTheDocument()
    expect(screen.getByText(/קומה שנייה/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'חיוג' })).toHaveAttribute('href', 'tel:0501234567')
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/972501234567\?text=/)
    expect(screen.getByLabelText(/צילום תמונה/)).toHaveAttribute('capture', 'environment')
  })

  it('reports a delivery with how it was paid, and goes back to the list', async () => {
    const { api, user } = open('/1')
    await user.click(await screen.findByRole('radio', { name: 'נמסר' }))
    await user.click(screen.getByRole('button', { name: 'שמירת הדיווח' }))
    // How it was paid is never guessed.
    expect(await screen.findByText('שדה חובה.')).toBeInTheDocument()
    expect(api.sent('PUT', '/orders/1/delivery')).toHaveLength(0)

    await user.click(screen.getByRole('radio', { name: 'מזומן' }))
    await user.type(screen.getByLabelText('הערה לתשלום (לא חובה)'), 'שטר 200')
    await user.click(screen.getByRole('button', { name: 'הושאר אצל שכן' }))
    await user.click(screen.getByRole('button', { name: 'שמירת הדיווח' }))

    expect(api.sent('PUT', '/orders/1/delivery')[0].body).toEqual({
      outcome: 'Delivered',
      paidWith: 'Cash',
      paymentComment: 'שטר 200',
      note: 'הושאר אצל שכן',
    })
    expect(await screen.findByText('דיווחת על 2 מתוך 3 עצירות')).toBeInTheDocument()
    expect(screen.getByText('הדיווח נשמר')).toBeInTheDocument()
  })

  it('asks why when a stop was not delivered', async () => {
    const { api, user } = open('/1')
    await user.click(await screen.findByRole('radio', { name: 'לא נמסר' }))
    // No payment question for an order that came back.
    expect(screen.queryByRole('radio', { name: 'מזומן' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'שמירת הדיווח' }))
    expect(await screen.findByText('שדה חובה.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'לא היה בבית' }))
    await user.click(screen.getByRole('button', { name: 'לא ענה לטלפון' }))
    await user.click(screen.getByRole('button', { name: 'שמירת הדיווח' }))
    expect(api.sent('PUT', '/orders/1/delivery')[0].body).toMatchObject({
      outcome: 'NotDelivered',
      paidWith: null,
      note: 'לא היה בבית, לא ענה לטלפון',
    })
  })

  it('does not ask for a payment the office already recorded', async () => {
    const { user } = open('/2')
    expect(await screen.findByText('שולם מראש (Bit), אין מה לגבות. סה״כ ₪120')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'נמסר' }))
    expect(screen.queryByRole('radio', { name: 'מזומן' })).not.toBeInTheDocument()
  })

  it('shows a report and lets the driver change or take it back', async () => {
    const { api, user } = open('/3', {
      [`DELETE /api/driver/${token}/orders/3/delivery`]: () => stop(3, 0),
    })
    expect(await screen.findByText(/^נמסר ב־/)).toBeInTheDocument()
    expect(screen.getByText('שולם: מזומן')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'שינוי הדיווח' }))
    expect(screen.getByRole('radio', { name: 'מזומן' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'ביטול' }))

    await user.click(screen.getByRole('button', { name: 'ביטול הדיווח' }))
    expect(api.sent('DELETE', '/orders/3/delivery')).toHaveLength(1)
    expect(await screen.findByRole('radio', { name: 'נמסר' })).not.toBeChecked()
  })

  it('shows the server\'s field errors', async () => {
    const { user } = open('/1', {
      [`PUT /api/driver/${token}/orders/1/delivery`]: () => invalid({ Note: ['tooLong'] }),
    })
    await user.click(await screen.findByRole('radio', { name: 'לא נמסר' }))
    await user.type(screen.getByLabelText('למה לא נמסר?'), 'ארוך')
    await user.click(screen.getByRole('button', { name: 'שמירת הדיווח' }))
    expect(await screen.findByText('הטקסט ארוך מדי.')).toBeInTheDocument()
  })

  it('uploads a proof photo', async () => {
    const { api, user } = open('/1', {
      [`POST /api/driver/${token}/orders/1/proof`]: () => stop(1, 1, { proofUrl: 'https://images.test/p.jpg' }),
    })
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'p.jpg', { type: 'image/jpeg' })
    await user.upload(await screen.findByLabelText(/צילום תמונה/), file)
    expect(await screen.findByRole('img', { name: 'תמונה מהמסירה ללקוח 1' })).toHaveAttribute('src', 'https://images.test/p.jpg')
    expect(api.sent('POST', '/orders/1/proof')[0].body).toBeInstanceOf(FormData)
  })

  it('tells the driver when the link no longer works', async () => {
    fakeApi({ [`GET /api/driver/${token}`]: () => ({ status: 404, body: {} }) })
    renderAt(`/d/${token}`)
    expect(await screen.findByText(/הקישור הזה לא פעיל/)).toBeInTheDocument()
  })
})
