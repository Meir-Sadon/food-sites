import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { RegisteredClients } from '../../api/admin'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'
import { publicApi } from '../../test/catalogData'

const clients: RegisteredClients = {
  total: 2,
  clients: [
    { id: 2, fullName: 'דנה כהן', phone: '0501234567', email: 'dana@gmail.com', createdAt: '2026-10-20T08:00:00Z', orders: 3, withGoogle: true },
    { id: 1, fullName: 'יוסי לוי', phone: '0527654321', email: null, createdAt: null, orders: 0, withGoogle: false },
  ],
}

describe('registered clients', () => {
  it('lists them with a WhatsApp link to each, and searches by name or phone', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/clients': () => clients })
    const user = userEvent.setup()
    renderAt('/admin/clients')

    expect(await screen.findByText('2 לקוחות רשומים')).toBeInTheDocument()
    const dana = screen.getByRole('link', { name: 'וואטסאפ לדנה כהן' })
    expect(dana).toHaveAttribute('href', `https://wa.me/972501234567?text=${encodeURIComponent('שלום דנה,')}`)
    expect(screen.getByText(/התחבר\/ה עם Google/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('חיפוש לפי שם, טלפון או אימייל'), '052765')
    expect(screen.queryByText('דנה כהן')).not.toBeInTheDocument()
    expect(screen.getByText('יוסי לוי')).toBeInTheDocument()
  })

  it('says so when nobody registered yet', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/clients': () => ({ total: 0, clients: [] }) })
    renderAt('/admin/clients')
    expect(await screen.findByText('עוד לא נרשמו לקוחות.')).toBeInTheDocument()
  })

  it('registers a client for the owner and shows the field messages', async () => {
    let taken = true
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/clients': () => clients,
      'POST /api/admin/clients': () => (taken ? invalid({ phone: ['phone'] }) : { ...clients.clients[1], id: 9 }),
    })
    const user = userEvent.setup()
    renderAt('/admin/clients')

    await user.click(await screen.findByText('הוספת לקוח', { selector: 'summary' }))
    await user.type(screen.getByLabelText('שם מלא'), 'סבתא רחל')
    await user.type(screen.getByLabelText('טלפון'), '12')
    await user.click(screen.getByRole('button', { name: 'הוספת הלקוח' }))
    expect(await screen.findByText('מספר הטלפון לא תקין.')).toBeInTheDocument()

    taken = false
    await user.click(screen.getByRole('button', { name: 'הוספת הלקוח' }))
    expect(api.sent('POST', '/api/admin/clients')).toHaveLength(2)
    expect(api.sent('POST', '/api/admin/clients')[1].body).toMatchObject({ fullName: 'סבתא רחל', phone: '12' })
  })

  it('opens the order page as the client', async () => {
    const api = fakeApi({
      ...publicApi,
      ...adminSession,
      'GET /api/admin/clients': () => clients,
      'POST /api/admin/clients/(\\d+)/order-session': () => undefined,
      'GET /api/account/me': () => ({ status: 401, body: {} }),
    } as Parameters<typeof fakeApi>[0])
    const user = userEvent.setup()
    renderAt('/admin/clients')

    await user.click((await screen.findAllByRole('button', { name: /הזמנה עבור הלקוח/ }))[0])
    expect(api.sent('POST', '/api/admin/clients/2/order-session')).toHaveLength(1)
  })
})
