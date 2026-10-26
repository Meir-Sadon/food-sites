import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { RegisteredClients } from '../../api/admin'
import { adminSession, fakeApi } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

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
})
