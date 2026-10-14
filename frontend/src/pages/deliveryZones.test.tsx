import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeliveryQuote, Site } from '../api/site'
import { menu, menuDish, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const menuWithPlainDish = () => menu({ dishes: [...menu().dishes, menuDish(4, 'חומוס פשוט', 1)] })

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
})

async function open(patch: Partial<Site>, quote: (address: unknown) => DeliveryQuote) {
  const api = fakeApi({
    'GET /api/site': () => site({ features: ['deliveryZones'], ...patch }),
    'GET /api/menu': menuWithPlainDish,
    'POST /api/delivery-quote': (_, body) => ({ body: quote(body) }),
  })
  renderAt('/')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' }))
  return { api, user }
}

const totalText = () => within(screen.getByRole('region', { name: 'סיכום הזמנה' })).getByText(/^סה"כ:/).textContent ?? ''

async function typeAddress(user: ReturnType<typeof userEvent.setup>) {
  const city = screen.getByLabelText('עיר')
  if (!(city as HTMLInputElement).value) await user.type(city, 'חיפה')
  await user.type(screen.getByLabelText('רחוב'), 'הרצל')
  await user.type(screen.getByLabelText('מספר בית'), '1')
}

describe('Delivery fee by zones', () => {
  it('waits for an address, then adds the fee of its zone to the total', async () => {
    const { api, user } = await open({ deliveryPricing: 'zones' }, () => ({ status: 'ok', fee: 15, zoneName: 'החלק הקרוב' }))
    expect(screen.getByText('דמי המשלוח יחושבו אחרי שתזינו כתובת.')).toBeInTheDocument()
    expect(api.sent('POST', '/api/delivery-quote')).toHaveLength(0)
    const before = totalText()

    await typeAddress(user)

    expect(await screen.findByText(/החלק הקרוב/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(api.sent('POST', '/api/delivery-quote')[0].body).toMatchObject({ street: 'הרצל', houseNumber: '1' })
    const after = totalText()
    expect(after).not.toBe(before)
    expect(after).toContain('55')
  })

  it('stops the order where there is no delivery, and pickup still works', async () => {
    const { user } = await open({ deliveryPricing: 'zones' }, () => ({ status: 'blocked', fee: 0, zoneName: null }))
    await typeAddress(user)

    expect(await screen.findByText(/אנחנו לא מבצעים משלוחים לכתובת הזו/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'איסוף עצמי' }))
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeEnabled()
  })

  it('says so when the address cannot be placed on the map, and still lets the order go', async () => {
    const { user } = await open({ deliveryPricing: 'zones' }, () => ({ status: 'unknown', fee: 0, zoneName: null }))
    await typeAddress(user)

    expect(await screen.findByText(/לא הצלחנו לאתר את הכתובת/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeEnabled()
  })

  it('asks for nothing with the simple setting', async () => {
    const { api, user } = await open({ deliveryPricing: 'simple', deliveryFeeText: 'בין 20 ל-40 ₪' }, () => ({ status: 'none', fee: 0, zoneName: null }))
    await typeAddress(user)
    expect(screen.queryByText('דמי המשלוח יחושבו אחרי שתזינו כתובת.')).not.toBeInTheDocument()
    expect(api.sent('POST', '/api/delivery-quote')).toHaveLength(0)
  })
})
