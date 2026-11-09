import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { menu, menuDish, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const confirmation = {
  id: 7,
  supplyDate: '2026-10-09',
  fulfillmentMethod: 'Delivery',
  paymentMethod: 'OnDelivery',
  total: 40,
  paymentPhone: null,
  needsReview: false,
  items: [],
}

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
})

const inEmergency = (message: string | null = null) => ({ emergency: { phone: '050-123-4567', message } })

describe('Emergency mode on the site', () => {
  it('shows nothing when it is off', async () => {
    fakeApi({ 'GET /api/site': () => site(), 'GET /api/menu': () => menu() })
    renderAt('/')
    await screen.findAllByRole('heading', { level: 3 })
    expect(screen.queryByRole('dialog', { name: 'האתר לא זמין כרגע' })).toBeNull()
  })

  it('opens a dialog with the default message and a button that dials the number, and the visitor can close it', async () => {
    fakeApi({ 'GET /api/site': () => site(inEmergency()), 'GET /api/menu': () => menu() })
    renderAt('/')
    const dialog = await screen.findByRole('dialog', { name: 'האתר לא זמין כרגע' })
    expect(within(dialog).getByText('כרגע האתר לא זמין ולצורך ביצוע ההזמנה, יש להתקשר למספר טלפון')).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'התקשרו: 050-123-4567' }).getAttribute('href')).toBe('tel:0501234567')

    await userEvent.setup().click(within(dialog).getAllByRole('button', { name: 'סגירה' })[0])
    expect(screen.queryByRole('dialog', { name: 'האתר לא זמין כרגע' })).toBeNull()
  })

  it("shows the admin's own message", async () => {
    fakeApi({ 'GET /api/site': () => site(inEmergency('סגורים עד יום ראשון')), 'GET /api/menu': () => menu() })
    renderAt('/')
    expect(await screen.findByText('סגורים עד יום ראשון')).toBeTruthy()
  })

  it('warns in red and sends nothing when the client tries to order', async () => {
    const api = fakeApi({
      'GET /api/site': () => site(inEmergency()),
      'GET /api/menu': () => menu({ dishes: [...menu().dishes, menuDish(4, 'חומוס פשוט', 1)] }),
      'POST /api/orders': () => confirmation,
    })
    renderAt('/')
    const user = userEvent.setup()
    await user.click(within(await screen.findByRole('dialog', { name: 'האתר לא זמין כרגע' })).getAllByRole('button', { name: 'סגירה' })[0])
    await user.click(await screen.findByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' }))
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('האתר במצב חירום')
    expect(alert.textContent).toContain('050-123-4567')
    expect(alert.className).toContain('form-error')
    expect(api.sent('POST', '/api/orders')).toHaveLength(0)
  })
})
