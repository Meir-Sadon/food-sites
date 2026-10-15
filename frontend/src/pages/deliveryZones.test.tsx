import { screen, waitFor, within } from '@testing-library/react'
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
    'GET /api/site': () => site(patch),
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
    const { api, user } = await open({ deliveryPricing: 'simple', deliveryFeeText: 'בין 20 ל-40 ₪' }, () => ({ status: 'outside', fee: 0, zoneName: null }))
    await typeAddress(user)
    expect(screen.queryByText('דמי המשלוח יחושבו אחרי שתזינו כתובת.')).not.toBeInTheDocument()
    expect(api.sent('POST', '/api/delivery-quote')).toHaveLength(0)
  })

  it('adds the fixed fee of the regular setting for a service city, and says the business will phone about another city', async () => {
    const { api, user } = await open({ deliveryPricing: 'simple', deliveryFeeAmount: 20, serviceCities: ['חיפה'] }, () => ({ status: 'ok', fee: 0, zoneName: null }))
    await typeAddress(user)

    expect(totalText()).toContain('60')
    expect(api.sent('POST', '/api/delivery-quote')).toHaveLength(0)

    await user.clear(screen.getByLabelText('עיר'))
    await user.type(screen.getByLabelText('עיר'), 'אילת')
    expect(screen.getByText(/יעדכן אתכם בטלפון בכמה יעלו דמי המשלוח/)).toBeInTheDocument()
    expect(totalText()).toContain('40')
  })

  it('shows none of the regular messages with the advanced setting', async () => {
    const { user } = await open(
      { deliveryPricing: 'zones', serviceCities: ['חיפה'], deliveryAreaText: 'חיפה', deliveryFeeText: 'עשרים שקלים' },
      () => ({ status: 'ok', fee: 15, zoneName: 'קרוב' }),
    )
    await user.clear(screen.getByLabelText('עיר'))
    await user.type(screen.getByLabelText('עיר'), 'אשדוד')
    expect(screen.queryByText(/ההזמנה תעבור בדיקה של המנהל/)).not.toBeInTheDocument()
    expect(screen.queryByText(/אזור המשלוחים/)).not.toBeInTheDocument()
    expect(screen.queryByText(/עשרים שקלים/)).not.toBeInTheDocument()
  })

  it('finds the location, fills the address and takes the fee that came with it', async () => {
    const position = { coords: { latitude: 31.8, longitude: 34.65 } }
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok: (p: unknown) => void) => ok(position) },
    })
    const api = fakeApi({
      'GET /api/site': () => site({ deliveryPricing: 'zones' }),
      'GET /api/menu': menuWithPlainDish,
      'POST /api/delivery-quote/locate': () => ({
        body: { found: true, city: 'אשדוד', street: 'הרצל', houseNumber: '5', quote: { status: 'ok', fee: 30, zoneName: 'אשדוד' } },
      }),
    })
    renderAt('/')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' }))
    await user.click(screen.getByRole('button', { name: 'אתרו את המיקום שלי' }))

    await waitFor(() => expect(screen.getByLabelText('רחוב')).toHaveValue('הרצל'))
    expect(screen.getByLabelText('עיר')).toHaveValue('אשדוד')
    expect(await screen.findByText(/אשדוד\)/)).toBeInTheDocument()
    expect(api.sent('POST', '/api/delivery-quote/locate')[0].body).toMatchObject({ lat: 31.8, lng: 34.65 })
    expect(api.sent('POST', '/api/delivery-quote')).toHaveLength(0)
    expect(totalText()).toContain('70')
  })

  it('calculates at once when the button is pressed', async () => {
    const { api, user } = await open({ deliveryPricing: 'zones' }, () => ({ status: 'ok', fee: 10, zoneName: 'קרוב' }))
    await typeAddress(user)
    await screen.findByText(/קרוב/, {}, { timeout: 3000 })
    expect(api.sent('POST', '/api/delivery-quote')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'חישוב עלות משלוח' }))
    await waitFor(() => expect(api.sent('POST', '/api/delivery-quote')).toHaveLength(2))
  })
})
