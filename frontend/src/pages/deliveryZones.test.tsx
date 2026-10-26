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

/** With the advanced setting the address fields wait behind a button. */
async function revealAddress(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.queryByRole('button', { name: 'הזנת כתובת ידנית' })
  if (button) await user.click(button)
}

async function typeAddress(user: ReturnType<typeof userEvent.setup>) {
  await revealAddress(user)
  const city = screen.getByLabelText('עיר')
  if (!(city as HTMLInputElement).value) await user.type(city, 'חיפה')
  await user.type(screen.getByLabelText('רחוב'), 'הרצל')
  await user.type(screen.getByLabelText('מספר בית'), '1')
}

describe('Delivery fee by zones', () => {
  it('keeps the address fields behind a button until it is pressed', async () => {
    const { user } = await open({ deliveryPricing: 'zones' }, () => ({ status: 'ok', fee: 15, zoneName: 'קרוב' }))
    expect(screen.queryByLabelText('רחוב')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'אתרו את המיקום שלי' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'הזנת כתובת ידנית' }))

    expect(screen.getByLabelText('רחוב')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'הזנת כתובת ידנית' })).not.toBeInTheDocument()
  })

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
    expect(screen.getByText(/כולל משלוח ₪15/)).toBeInTheDocument()
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

  it('takes the base fee off the delivery of a large order and says why', async () => {
    const { user } = await open(
      { deliveryPricing: 'zones', deliveryBaseFee: 15, deliveryDiscountMinOrder: 40 },
      () => ({ status: 'ok', fee: 35, zoneName: 'רחוק' }),
    )
    expect(screen.getByText(/משלוחים חינם בהזמנות מעל ₪40/)).toBeInTheDocument()
    expect(screen.getByText(/לאזורים רחוקים תינתן הנחה בעלות המשלוח/)).toBeInTheDocument()

    await typeAddress(user)

    expect(await screen.findByText(/כולל הנחת משלוח של ₪15/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(totalText()).toContain('60')
  })

  it('makes the delivery free when the discount covers the whole fee', async () => {
    const { user } = await open(
      { deliveryPricing: 'zones', deliveryBaseFee: 15, deliveryDiscountMinOrder: 40 },
      () => ({ status: 'ok', fee: 15, zoneName: 'קרוב' }),
    )
    await typeAddress(user)

    expect(await screen.findByText('חינם', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText(/הנחת משלוח בהזמנה גדולה/)).toBeInTheDocument()
    expect(totalText()).toContain('40')
  })

  it('charges the full fee under the threshold', async () => {
    const { user } = await open(
      { deliveryPricing: 'zones', deliveryBaseFee: 15, deliveryDiscountMinOrder: 500 },
      () => ({ status: 'ok', fee: 15, zoneName: 'החלק הקרוב' }),
    )
    await typeAddress(user)

    expect(await screen.findByText(/החלק הקרוב/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText(/הנחת משלוח בהזמנה גדולה/)).not.toBeInTheDocument()
    expect(totalText()).toContain('55')
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
    await revealAddress(user)
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

    await waitFor(() => expect(screen.getAllByLabelText('רחוב')[0]).toHaveValue('הרצל'))
    expect(screen.getByLabelText('עיר')).toHaveValue('אשדוד')
    expect(await screen.findByText(/אשדוד\)/)).toBeInTheDocument()
    expect(api.sent('POST', '/api/delivery-quote/locate')[0].body).toMatchObject({ lat: 31.8, lng: 34.65 })
    expect(api.sent('POST', '/api/delivery-quote')).toHaveLength(0)
    expect(totalText()).toContain('70')
  })

  it('offers to find the location at the send button when the address is incomplete', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 31.8, longitude: 34.65 } }) },
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
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    const panel = await screen.findByRole('dialog', { name: 'עוד כמה פרטים להשלמת ההזמנה' })
    await user.click(within(panel).getByRole('button', { name: /^אתרו אותי/ }))
    // The located address fills in and the dialog moves on to the send step by itself.
    await within(panel).findByRole('heading', { name: 'הכול מוכן' })
    expect(screen.getAllByLabelText('רחוב')[0]).toHaveValue('הרצל')
    expect(api.sent('POST', '/api/delivery-quote/locate')).toHaveLength(1)
    expect(await screen.findByText(/אשדוד\)/)).toBeInTheDocument()
  })

  it('offers to switch to pickup under the locate button when the address is incomplete', async () => {
    const api = fakeApi({ 'GET /api/site': () => site({ deliveryPricing: 'zones' }), 'GET /api/menu': menuWithPlainDish })
    renderAt('/')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' }))
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    const panel = await screen.findByRole('dialog', { name: 'עוד כמה פרטים להשלמת ההזמנה' })
    await user.click(within(panel).getByRole('button', { name: 'שנה לאיסוף עצמי' }))

    // No address is needed any more: the dialog moves on to the send step and the order is a pickup.
    await within(panel).findByRole('heading', { name: 'הכול מוכן' })
    expect(screen.getByRole('radio', { name: 'איסוף עצמי' })).toBeChecked()
    expect(api.sent('POST', '/api/orders')).toHaveLength(0)
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
