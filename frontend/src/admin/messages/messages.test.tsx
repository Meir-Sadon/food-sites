import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminOrder } from '../../api/operations'
import type { AdminReview, MessageTemplate } from '../../api/reviews'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'
import { composeMessage, whatsAppUrl } from './compose'

const order = (patch: Partial<AdminOrder> = {}): AdminOrder => ({
  id: 7,
  phone: '050-123-4567',
  name: 'דנה כהן',
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
  deliveryHour: null,
  hourFull: false,
  items: [],
  ...patch,
})

const confirmed: MessageTemplate = { id: 1, name: 'ההזמנה אושרה', text: 'הזמנה {order} ל־{date} אושרה ({total}).', includeReviewLink: false, forStatus: 'Confirmed' }
const feedback: MessageTemplate = { id: 2, name: 'איך היה?', text: 'נשמח לשמוע איך היה:', includeReviewLink: true, forStatus: 'Delivered' }

describe('Composing a message', () => {
  it('starts with the first name, fills the order details and ends with the link', () => {
    expect(composeMessage(confirmed, order(), 'https://x/r/abc')).toBe('דנה,\nהזמנה 7 ל־06/01/2030 אושרה (₪176).')
    expect(composeMessage(feedback, order(), 'https://x/r/abc')).toBe('דנה,\nנשמח לשמוע איך היה:\nhttps://x/r/abc')
  })

  it('opens a chat with the client in international format', () => {
    expect(whatsAppUrl('050-123-4567', 'שלום')).toBe(`https://wa.me/972501234567?text=${encodeURIComponent('שלום')}`)
    expect(whatsAppUrl('12', 'שלום')).toBeNull()
  })
})

describe('Admin WhatsApp messages', () => {
  it('prepares the review request for a delivered order and opens WhatsApp with it', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/orders.*': () => [order({ status: 'Delivered' })],
      'GET /api/admin/message-templates': () => [confirmed, feedback],
      'POST /api/admin/reviews/for-order/7': () => ({ token: 'abcdefghij', submitted: false }),
    })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })
    await user.click(within(card).getByRole('button', { name: /וואטסאפ/ }))

    const text = await within(card).findByLabelText('ההודעה שתישלח')
    expect(within(card).getByLabelText('תבנית')).toHaveValue('2')
    const message = `דנה,\nנשמח לשמוע איך היה:\n${window.location.origin}/r/abcdefghij`
    await waitFor(() => expect(text).toHaveValue(message))
    expect(within(card).getByRole('link', { name: 'פתיחה בוואטסאפ' })).toHaveAttribute(
      'href',
      `https://wa.me/972501234567?text=${encodeURIComponent(message)}`,
    )
    expect(api.sent('POST', '/api/admin/reviews/for-order/7')).toHaveLength(1)

    // A template without the link doesn't make one, and the admin can edit the text before sending.
    await user.selectOptions(within(card).getByLabelText('תבנית'), '1')
    expect(api.sent('POST', '/api/admin/reviews/for-order/7')).toHaveLength(1)
    expect(text).toHaveValue('דנה,\nהזמנה 7 ל־06/01/2030 אושרה (₪176).')
    await user.type(text, ' תודה!')
    expect(within(card).getByRole('link', { name: 'פתיחה בוואטסאפ' }).getAttribute('href')).toContain(encodeURIComponent('תודה!'))

    // The edit is for this message only: going back to the template's text undoes it.
    await user.click(within(card).getByRole('button', { name: 'חזרה לנוסח התבנית' }))
    expect(text).toHaveValue('דנה,\nהזמנה 7 ל־06/01/2030 אושרה (₪176).')
  })

  it('picks the message for the order status, and makes no review link for it', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/orders.*': () => [order({ status: 'Confirmed' })],
      'GET /api/admin/message-templates': () => [feedback, confirmed],
    })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })
    await user.click(within(card).getByRole('button', { name: /וואטסאפ/ }))

    expect(await within(card).findByLabelText('ההודעה שתישלח')).toHaveValue('דנה,\nהזמנה 7 ל־06/01/2030 אושרה (₪176).')
    expect(within(card).getByLabelText('תבנית')).toHaveValue('1')
    expect(api.sent('POST', '/api/admin/reviews/for-order/7')).toHaveLength(0)
  })

  it('lets the admin add and edit templates', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/message-templates': () => [confirmed],
      'PUT /api/admin/message-templates/1': (_, body) => ({ ...confirmed, ...(body as object) }),
      'POST /api/admin/message-templates': (_, body) => {
        const input = body as { name: string }
        return input.name ? { id: 3, ...input } : invalid({ Name: ['required'] })
      },
    })
    renderAt('/admin/messages')
    const user = userEvent.setup()
    expect(await screen.findByRole('heading', { name: 'תבניות הודעות וואטסאפ' })).toBeInTheDocument()

    const section = await screen.findByRole('region', { name: 'ההזמנה אושרה' })
    await user.clear(within(section).getByLabelText('טקסט ההודעה'))
    await user.type(within(section).getByLabelText('טקסט ההודעה'), 'מאושר')
    await user.click(within(section).getByRole('button', { name: 'שמירה' }))
    await waitFor(() => expect(api.sent('PUT', '/api/admin/message-templates/1')[0].body).toEqual({
      name: 'ההזמנה אושרה',
      text: 'מאושר',
      includeReviewLink: false,
      forStatus: 'Confirmed',
    }))

    await user.click(screen.getByRole('button', { name: 'הוספת תבנית' }))
    const form = screen.getByRole('region', { name: 'תבנית חדשה' })
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await within(form).findByText('שדה חובה.')).toBeInTheDocument()

    await user.type(within(form).getByLabelText('שם התבנית'), 'מוכן')
    await user.type(within(form).getByLabelText('טקסט ההודעה'), 'ההזמנה מוכנה')
    await user.selectOptions(within(form).getByLabelText('סוג ההודעה'), 'Ready')
    await user.click(within(form).getByLabelText(/קישור לחוות דעת/))
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await screen.findByRole('region', { name: 'מוכן' })).toBeInTheDocument()
    expect(api.sent('POST', '/api/admin/message-templates').at(-1)?.body).toEqual({
      name: 'מוכן',
      text: 'ההזמנה מוכנה',
      includeReviewLink: true,
      forStatus: 'Ready',
    })
  })
})

describe('Admin reviews', () => {
  const pending: AdminReview = {
    id: 4,
    orderId: 7,
    orderName: 'דנה כהן',
    phone: '0501234567',
    name: 'דנה',
    rating: 4,
    comment: 'טעים',
    images: [{ id: 1, url: 'https://images.test/1.jpg' }],
    status: 'Pending',
    submittedAt: '2030-01-07T10:00:00Z',
  }

  it('approves a waiting review, which then leaves the waiting list', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/reviews\\?status=Pending': () => [pending],
      'PUT /api/admin/reviews/4/status': () => undefined,
    })
    renderAt('/admin/reviews')
    const card = await screen.findByRole('article', { name: 'חוות הדעת של דנה (הזמנה #7)' })
    expect(within(card).getByRole('img', { name: '4 מתוך 5 כוכבים' })).toBeInTheDocument()
    expect(within(card).getByText('טעים')).toBeInTheDocument()

    await userEvent.setup().click(within(card).getByRole('button', { name: /אישור/ }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/reviews/4/status')[0].body).toEqual({ status: 'Approved' }))
    expect(await screen.findByText('אין חוות דעת להצגה.')).toBeInTheDocument()
  })

  it('links the new tabs from the admin bar', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/reviews.*': () => [] })
    renderAt('/admin/reviews')
    const nav = await screen.findByRole('navigation', { name: 'תפריט ניהול' })
    expect(within(nav).getByRole('link', { name: 'הודעות וואטסאפ' })).toHaveAttribute('href', '/admin/messages')
    expect(within(nav).getByRole('link', { name: 'חוות דעת' })).toHaveAttribute('href', '/admin/reviews')
  })
})
