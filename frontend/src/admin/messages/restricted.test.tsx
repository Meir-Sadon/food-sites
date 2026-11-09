import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminOrder } from '../../api/operations'
import { adminSession, fakeApi } from '../../test/fakeApi'
import { renderAt } from '../../test/render'
import { composeRestrictedMessage } from './compose'

const order: AdminOrder = {
  id: 7, phone: '0501234567', name: 'דנה כהן', address: 'חיפה', supplyDate: '2030-01-06', fulfillmentMethod: 'Delivery',
  notes: null, paymentMethod: 'OnDelivery', isPaid: false, paidWith: null, paymentComment: null, status: 'New', total: 176,
  createdAt: '2030-01-01T10:00:00Z', isGuest: false, needsReview: false, deliveryHour: null, hourFull: false, items: [], restricted: true,
}

describe('Restricted clients', () => {
  it('fills the placeholders of the prepayment message', () => {
    expect(composeRestrictedMessage('{name} #{order} {date} {total} {paymentPhone}', order, '050-1111111')).toBe('דנה #7 06/01/2030 ₪176 050-1111111')
  })

  it('warns on the order and prepares the message with the payment number, sent by hand', async () => {
    fakeApi({
      ...adminSession,
      'GET /api/admin/orders.*': () => [order],
      'GET /api/admin/restricted-clients': () => ({ message: 'שלום {name}, לשלם ל-{paymentPhone}', phones: ['0501234567'] }),
      'GET /api/admin/settings': () => ({ paymentPhone: '050-1111111' }),
    })
    renderAt('/admin/orders')
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: 'הזמנה #7' })
    expect(within(card).getAllByText('הזמנה מלקוח מוגבל').length).toBeGreaterThan(0)
    await user.click(within(card).getByRole('button', { name: /בקשת תשלום מראש/ }))
    const link = await within(card).findByRole('link', { name: 'פתיחה בוואטסאפ' })
    expect(link.getAttribute('href')).toBe(`https://wa.me/972501234567?text=${encodeURIComponent('שלום דנה, לשלם ל-050-1111111')}`)
  })
})

describe('Prepayment message location', () => {
  it('is edited on the WhatsApp messages screen, not in the settings', async () => {
    fakeApi({
      ...adminSession,
      'GET /api/admin/message-templates': () => [],
      'GET /api/admin/restricted-clients': () => ({ message: 'שלום {name}', phones: [] }),
      'GET /api/admin/settings': () => ({}),
    })
    renderAt('/admin/messages')
    expect(await screen.findByRole('textbox', { name: 'הודעת בקשת תשלום מראש' })).toHaveValue('שלום {name}')
  })
})
