import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminOrder, CookingSummary, Report } from '../../api/operations'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const order = (patch: Partial<AdminOrder> = {}): AdminOrder => ({
  id: 7,
  phone: '0501234567',
  name: 'דנה',
  address: 'חיפה',
  supplyDate: '2030-01-06',
  fulfillmentMethod: 'Delivery',
  notes: null,
  paymentMethod: 'OnDelivery',
  isPaid: false,
  paidWith: null,
  paymentComment: null,
  status: 'New',
  total: 176,
  createdAt: '2030-01-01T10:00:00Z',
  isGuest: false,
  needsReview: false,
  items: [
    { id: 1, parentItemId: null, dishName: 'עוף בתנור', optionLabel: 'שלם', quantity: 2, unitPrice: 70, lineTotal: 140 },
    { id: 2, parentItemId: 1, dishName: 'ירך', optionLabel: 'יחידה', quantity: 3, unitPrice: 12, lineTotal: 36 },
  ],
  ...patch,
})

const summary: CookingSummary = {
  date: '2030-01-06',
  orderCount: 2,
  deliveryCount: 1,
  pickupCount: 1,
  mainDishCount: 2,
  sideDishCount: 1,
  rows: [{ dishId: 1, dishName: 'עוף בתנור', optionLabel: 'שלם', quantity: 4, orders: 2 }],
}

describe('Admin Orders', () => {
  it('flags an order outside the service city and lets the admin approve it', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/orders.*': () => [order({ needsReview: true })],
      'PUT /api/admin/orders/7/approve': () => undefined,
    })
    renderAt('/admin/orders')
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })
    expect(within(card).getByText(/ממתינה לאישור המנהל/)).toBeInTheDocument()

    await userEvent.setup().click(within(card).getByRole('button', { name: /אישור ההזמנה/ }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/orders/7/approve')).toHaveLength(1))
    expect(within(card).queryByText(/ממתינה לאישור המנהל/)).not.toBeInTheDocument()
  })

  it('lists orders by supply day and links the tab', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/orders.*': () => [order(), order({ id: 8, supplyDate: '2030-01-13', name: 'יעל' })] })
    renderAt('/admin/orders')

    expect(await screen.findByRole('heading', { level: 2, name: /06\/01\/2030/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /13\/01\/2030/ })).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'הזמנה #7' })
    expect(within(card).getByText(/דנה/)).toBeInTheDocument()
    expect(within(card).getByText('₪176')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'תפריט ניהול' })).getByRole('link', { name: 'הזמנות' })).toHaveAttribute('href', '/admin/orders')
  })

  it('changes the status', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/orders.*': () => [order()],
      'PUT /api/admin/orders/7/status': () => undefined,
    })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })

    await user.selectOptions(within(card).getByLabelText('סטטוס'), 'Ready')

    await waitFor(() => expect(api.sent('PUT', '/api/admin/orders/7/status')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/orders/7/status')[0].body).toEqual({ status: 'Ready' })
    expect(within(card).getByLabelText('סטטוס')).toHaveValue('Ready')
  })

  it('asks how the order was paid before marking it paid', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/orders.*': () => [order({ paymentMethod: 'Transfer' })],
      'PUT /api/admin/orders/7/paid': () => undefined,
    })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })

    await user.click(within(card).getByRole('checkbox', { name: /שולם/ }))
    const form = within(card).getByRole('form', { name: 'סימון הזמנה #7 כשולם' })
    expect(api.sent('PUT', '/api/admin/orders/7/paid')).toHaveLength(0)
    // A transfer by Bit / PayBox suggests Bit.
    expect(within(form).getByLabelText('אמצעי תשלום')).toHaveValue('Bit')

    await user.selectOptions(within(form).getByLabelText('אמצעי תשלום'), 'PayBox')
    await user.type(within(form).getByLabelText('הערה לתשלום'), 'שילם הבן')
    await user.click(within(form).getByRole('button', { name: 'סימון כשולם' }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/orders/7/paid')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/orders/7/paid')[0].body).toEqual({ isPaid: true, paidWith: 'PayBox', paymentComment: 'שילם הבן' })
    expect(within(card).queryByRole('form', { name: 'סימון הזמנה #7 כשולם' })).not.toBeInTheDocument()
    expect(within(card).getByRole('checkbox', { name: /שולם/ })).toBeChecked()
    expect(within(card).getByText('שולם: PayBox · שילם הבן')).toBeInTheDocument()
  })

  it('suggests cash for an order paid on delivery, and closes the form on cancel', async () => {
    const api = fakeApi({ ...adminSession, 'GET /api/admin/orders.*': () => [order()] })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })

    await user.click(within(card).getByRole('checkbox', { name: /שולם/ }))
    const form = within(card).getByRole('form', { name: 'סימון הזמנה #7 כשולם' })
    expect(within(form).getByLabelText('אמצעי תשלום')).toHaveValue('Cash')

    await user.click(within(form).getByRole('button', { name: 'ביטול' }))
    expect(within(card).queryByRole('form', { name: 'סימון הזמנה #7 כשולם' })).not.toBeInTheDocument()
    expect(within(card).getByRole('checkbox', { name: /שולם/ })).not.toBeChecked()
    expect(api.sent('PUT', '/api/admin/orders/7/paid')).toHaveLength(0)
  })

  it('unmarks a paid order at once and clears how it was paid', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/orders.*': () => [order({ isPaid: true, paidWith: 'Unknown' })],
      'PUT /api/admin/orders/7/paid': () => undefined,
    })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })
    expect(within(card).getByText('שולם: אמצעי התשלום לא נרשם')).toBeInTheDocument()

    await user.click(within(card).getByRole('checkbox', { name: /שולם/ }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/orders/7/paid')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/orders/7/paid')[0].body).toEqual({ isPaid: false })
    expect(within(card).queryByText(/אמצעי התשלום לא נרשם/)).not.toBeInTheDocument()
    expect(within(card).getByRole('checkbox', { name: /שולם/ })).not.toBeChecked()
  })

  it('undoes a status change that fails to save', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/orders.*': () => [order()], 'PUT /api/admin/orders/7/status': () => ({ status: 500 }) })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })

    await user.selectOptions(within(card).getByLabelText('סטטוס'), 'Ready')

    expect(await within(card).findByRole('alert')).toBeInTheDocument()
    expect(within(card).getByLabelText('סטטוס')).toHaveValue('New')
  })

  it('cancels an order after asking', async () => {
    const api = fakeApi({ ...adminSession, 'GET /api/admin/orders.*': () => [order()], 'PUT /api/admin/orders/7/status': () => undefined })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })

    await user.click(within(card).getByRole('button', { name: 'ביטול הזמנה' }))
    expect(api.sent('PUT', '/status')).toHaveLength(0)
    await user.click(within(card).getByRole('button', { name: 'כן, לבטל' }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/orders/7/status')[0].body).toEqual({ status: 'Cancelled' }))
    expect(within(card).getByLabelText('סטטוס')).toHaveValue('Cancelled')
    expect(within(card).queryByRole('button', { name: 'ביטול הזמנה' })).not.toBeInTheDocument()
  })

  it('shows the cooking summary of a day', async () => {
    const api = fakeApi({ ...adminSession, 'GET /api/admin/orders/summary.*': () => summary, 'GET /api/admin/orders\\?.*': () => [order()] })
    renderAt('/admin/orders')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /סיכום בישול/ }))

    const region = await screen.findByRole('region', { name: 'סיכום בישול ליום 06/01/2030' })
    expect(within(region).getByRole('row', { name: /עוף בתנור/ })).toHaveTextContent('4')
    expect(within(region).getByText('2 הזמנות · 1 משלוחים · 1 איסוף עצמי')).toBeInTheDocument()
    expect(within(region).getByText('מנות: 2 · מנות צדדיות: 1')).toBeInTheDocument()
    expect(api.sent('GET', 'summary?date=2030-01-06')).toHaveLength(1)
    expect(within(region).getByRole('button', { name: 'הדפסה' })).toBeInTheDocument()
  })

  it('edits an order and sends the new quantities', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/orders.*': () => [order()],
      'PUT /api/admin/orders/7': (_, body) => ({ body: order({ name: (body as { name: string }).name, total: 140 }) }),
    })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })

    await user.click(within(card).getByRole('button', { name: /עריכה/ }))
    const form = within(card).getByRole('form', { name: 'עריכת הזמנה #7' })
    await user.clear(within(form).getByLabelText('שם'))
    await user.type(within(form).getByLabelText('שם'), 'יעל')
    await user.click(within(form).getByRole('button', { name: 'הסרת ירך מההזמנה' }))
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/orders/7')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/orders/7')[0].body).toEqual({
      name: 'יעל',
      phone: '0501234567',
      address: 'חיפה',
      supplyDate: '2030-01-06',
      fulfillmentMethod: 'Delivery',
      paymentMethod: 'OnDelivery',
      notes: '',
      items: [{ id: 1, quantity: 2 }],
    })
    await waitFor(() => expect(within(card).queryByRole('form')).not.toBeInTheDocument())
    expect(within(card).getByText(/יעל/)).toBeInTheDocument()
  })

  it('shows server errors on the edit form', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/orders.*': () => [order()], 'PUT /api/admin/orders/7': () => invalid({ Phone: ['phone'] }) })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })

    await user.click(within(card).getByRole('button', { name: /עריכה/ }))
    await user.click(within(card).getByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(within(card).getByLabelText('טלפון')).toHaveAccessibleDescription('מספר הטלפון לא תקין.'))
  })
})

describe('Admin Reports', () => {
  const report: Report = {
    orders: 3,
    sales: 456,
    weeks: [{ weekStart: '2030-01-06', orders: 3, sales: 456, dishes: [{ dishId: 1, dishName: 'עוף בתנור', quantity: 6, sales: 420 }] }],
    dishes: [{ dishId: 1, dishName: 'עוף בתנור', quantity: 6, sales: 420 }],
  }
  const base = {
    ...adminSession,
    'GET /api/admin/categories': () => [{ id: 1, name: 'עופות', displayOrder: 0, dishCount: 1 }],
    'GET /api/admin/dishes': () => [],
    'GET /api/admin/reports.*': () => report,
  }

  it('shows sales per week and per dish', async () => {
    fakeApi(base)
    renderAt('/admin/reports')

    expect(await screen.findByText('3 הזמנות · מכירות: ₪456')).toBeInTheDocument()
    expect(screen.getByText(/שבוע שמתחיל ב־06\/01\/2030 ·/)).toBeInTheDocument()
    expect(screen.getAllByRole('row', { name: /עוף בתנור/ })).toHaveLength(2)
  })

  it('reloads with the chosen filters and points the export at them', async () => {
    const api = fakeApi(base)
    renderAt('/admin/reports')
    const user = userEvent.setup()
    await screen.findByText('3 הזמנות · מכירות: ₪456')

    await user.selectOptions(screen.getByLabelText('תשלום'), 'Transfer')

    await waitFor(() => expect(api.sent('GET', '/api/admin/reports?paymentMethod=Transfer')).toHaveLength(1))
    expect(screen.getByRole('link', { name: 'ייצוא ל־Excel' })).toHaveAttribute('href', '/api/admin/reports/export?paymentMethod=Transfer')
  })
})
