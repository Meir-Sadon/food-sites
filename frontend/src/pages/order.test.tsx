import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Confirmation } from '../api/site'
import { menu, menuDish, publicApi, site } from '../test/catalogData'
import { fakeApi, invalid } from '../test/fakeApi'
import { renderAt } from '../test/render'

const confirmation: Confirmation = {
  id: 7,
  supplyDate: '2026-10-09',
  fulfillmentMethod: 'Delivery',
  paymentMethod: 'OnDelivery',
  total: 82,
  paymentPhone: null,
  needsReview: false,
  items: [
    { dishName: 'עוף בתנור', optionLabel: 'שלם', quantity: 1, unitPrice: 70, lineTotal: 70, isAddOn: false },
    { dishName: 'ירך', optionLabel: 'יחידה', quantity: 1, unitPrice: 12, lineTotal: 12, isAddOn: true },
  ],
}

async function openOrderPage(routes: Record<string, (...args: never[]) => unknown> = {}) {
  const api = fakeApi({ ...publicApi, ...routes } as Parameters<typeof fakeApi>[0])
  renderAt('/')
  await screen.findByRole('heading', { level: 2, name: 'עופות' })
  return { api, user: userEvent.setup() }
}

const dishCard = (name: string) => screen.getByRole('article', { name })
const total = () => within(screen.getByRole('region', { name: 'סיכום הזמנה' }))

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה להזמנה/ }))
  await user.type(screen.getByLabelText('שם מלא'), 'דנה')
  await user.type(screen.getByLabelText('רחוב'), 'הרצל')
  await user.type(screen.getByLabelText('מספר בית'), '1')
  await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
  await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
}

beforeEach(() => {
  localStorage.clear()
})

describe('Order page', () => {
  it('groups dishes by category, all open, and hides add-on-only dishes', async () => {
    await openOrderPage()

    const groups = document.querySelectorAll('details.category')
    expect([...groups].map((g) => g.hasAttribute('open'))).toEqual([true, true])
    expect(screen.getByRole('heading', { level: 3, name: 'עוף בתנור' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'ירך' })).not.toBeInTheDocument()
  })

  it('shows the dish details only once it is chosen, with the default option preselected', async () => {
    const { user } = await openOrderPage()
    const card = dishCard('עוף בתנור')
    expect(within(card).queryByRole('radio')).not.toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))

    expect(within(card).getByRole('radio', { name: /שלם/ })).toBeChecked()
    expect(within(card).getByRole('radio', { name: /חצי/ })).not.toBeChecked()
    expect(total().getByText('סה"כ: ₪70')).toBeInTheDocument()
  })

  it('keeps the total up to date with options, amounts and add-ons', async () => {
    const { user } = await openOrderPage()
    const card = dishCard('עוף בתנור')
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))

    await user.click(within(card).getByRole('radio', { name: /חצי/ }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוף בתנור' }))
    expect(total().getByText('סה"כ: ₪80')).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'הוספה: ירך' }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: ירך' }))
    expect(total().getByText('סה"כ: ₪104')).toBeInTheDocument()

    const meat = dishCard('בשר טחון')
    await user.click(within(meat).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(meat).getByRole('button', { name: 'הוספה: בשר טחון' }))
    expect(total().getByText('סה"כ: ₪171.5')).toBeInTheDocument()
    expect(total().getByText('3 מנות')).toBeInTheDocument()
    expect(total().getByText('0 מנות צדדיות')).toBeInTheDocument()
  })

  it('totals dishes by amount and side dishes by kind, leaving out side dishes added to a dish', async () => {
    const sideOnly = [menuDish(1, 'קוסקוס', 1, { addOnDishIds: [3] }), menuDish(3, 'כפיתה', 1, { isSideDish: true }), menuDish(4, 'סלט', 1, { isSideDish: true })]
    const { user } = await openOrderPage({ 'GET /api/menu': () => menu({ dishes: sideOnly }) })

    // Two side dishes of one kind and three of another: no dishes, two kinds of side dish.
    const pita = dishCard('כפיתה')
    await user.click(within(pita).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(pita).getByRole('button', { name: 'הוספה: כפיתה' }))
    const salad = dishCard('סלט')
    await user.click(within(salad).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(salad).getByRole('button', { name: 'הוספה: סלט' }))
    await user.click(within(salad).getByRole('button', { name: 'הוספה: סלט' }))
    expect(total().getByText('0 מנות')).toBeInTheDocument()
    expect(total().getByText('2 מנות צדדיות')).toBeInTheDocument()

    // Remove the salad; two couscous with a pita added to them: pita as part of the dish counts nowhere.
    await user.click(within(salad).getByRole('button', { name: 'הסרה מההזמנה: סלט' }))
    const couscous = dishCard('קוסקוס')
    await user.click(within(couscous).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(couscous).getByRole('button', { name: 'הוספה: קוסקוס' }))
    await user.click(within(couscous).getByRole('button', { name: 'הוספה: כפיתה' }))
    expect(total().getByText('2 מנות')).toBeInTheDocument()
    expect(total().getByText('מנה צדדית אחת')).toBeInTheDocument()
  })

  it('stops a free amount at the admin range', async () => {
    const { user } = await openOrderPage()
    const meat = dishCard('בשר טחון')
    await user.click(within(meat).getByRole('button', { name: /הוספה להזמנה/ }))

    expect(within(meat).getByRole('button', { name: 'הפחתה: בשר טחון' })).toBeDisabled()
    for (let i = 0; i < 10; i++) await user.click(within(meat).getByRole('button', { name: 'הוספה: בשר טחון' }))
    expect(within(meat).getByRole('button', { name: 'הוספה: בשר טחון' })).toBeDisabled()
    expect(within(meat).getByText(/3 ק"ג/)).toBeInTheDocument()
  })

  it('resets the whole order to the defaults', async () => {
    const { user } = await openOrderPage()
    await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.type(screen.getByLabelText('הערות (לא חובה)'), 'בלי חריף')

    await user.click(screen.getByRole('button', { name: 'איפוס ההזמנה' }))

    expect(total().getByText('סה"כ: ₪0')).toBeInTheDocument()
    expect(screen.getByLabelText('הערות (לא חובה)')).toHaveValue('')
    expect(within(dishCard('עוף בתנור')).queryByRole('radio')).not.toBeInTheDocument()
  })

  it('offers only the next open supply dates, with the pay-on-delivery sentence by default', async () => {
    await openOrderPage()
    const select = screen.getByLabelText('יום אספקה')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'יום שישי, 09/10/2026',
      'יום שישי, 16/10/2026',
    ])
    expect(screen.getByText('התשלום יבוצע במעמד מסירת המשלוח')).toBeInTheDocument()
  })

  it('blocks sending an order below the admin minimum and says how much is missing', async () => {
    const { user } = await openOrderPage({ 'GET /api/site': () => site({ minimumOrderAmount: 100 }) })
    await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה להזמנה/ }))

    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeDisabled()
    expect(screen.getByText(/המינימום להזמנה הוא ₪100\. חסרים עוד ₪30\./)).toBeInTheDocument()

    await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה: עוף בתנור/ }))
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeEnabled()
  })

  it('starts the city as אשקלון and warns when another city is typed', async () => {
    const { api, user } = await openOrderPage({
      'POST /api/orders': () => ({ ...confirmation, needsReview: true }),
    })
    const city = screen.getByLabelText('עיר')
    expect(city).toHaveValue('אשקלון')
    expect(screen.queryByText(/אנחנו עובדים רק באשקלון/)).not.toBeInTheDocument()

    await user.clear(city)
    await user.type(city, 'חיפה')
    expect(screen.getByText(/אנחנו עובדים רק באשקלון.*הכמות לא נשמרת/)).toBeInTheDocument()

    await fillAndSubmit(user)
    expect(api.sent('POST', '/api/orders')[0].body).toMatchObject({ city: 'חיפה', street: 'הרצל' })
    const dialog = await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
    expect(within(dialog).getByText(/ההזמנה תיבדק על ידי המנהל/)).toBeInTheDocument()
  })

  it('hides the Bit / PayBox option when the admin set no payment phone', async () => {
    await openOrderPage({ 'GET /api/site': () => site({ paymentPhone: null }) })
    expect(screen.queryByRole('radio', { name: /Bit/ })).not.toBeInTheDocument()
  })

  it('needs a valid phone before the order is sent', async () => {
    const { api, user } = await openOrderPage()
    await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '12')

    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))

    expect(await screen.findByLabelText('טלפון')).toHaveAccessibleDescription(/מספר הטלפון לא תקין\./)
    expect(api.sent('POST', '/api/orders')).toHaveLength(0)
  })

  it('sends the order, then shows the success popup with the summary', async () => {
    const { api, user } = await openOrderPage({ 'POST /api/orders': () => confirmation })
    await fillAndSubmit(user)

    const dialog = await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
    expect(within(dialog).getByText('מספר ההזמנה: 7')).toBeInTheDocument()
    expect(within(dialog).getByText(/ירך/)).toBeInTheDocument()
    expect(within(dialog).getByText('₪82')).toBeInTheDocument()
    expect(within(dialog).getByText('התשלום יבוצע במעמד מסירת המשלוח')).toBeInTheDocument()

    expect(api.sent('POST', '/api/orders')[0].body).toEqual({
      phone: '0501234567',
      name: 'דנה',
      city: 'אשקלון',
      street: 'הרצל',
      houseNumber: '1',
      apartment: '',
      supplyDate: '2026-10-09',
      fulfillmentMethod: 'Delivery',
      paymentMethod: 'OnDelivery',
      notes: '',
      items: [{ dishId: 1, optionId: 11, quantity: 1, addOns: [] }],
    })

    await userEvent.click(within(dialog).getByRole('button', { name: 'סגירה' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(total().getByText('סה"כ: ₪0')).toBeInTheDocument()
  })

  it('shows the Bit / PayBox number after a transfer order', async () => {
    const { user } = await openOrderPage({
      'POST /api/orders': () => ({ ...confirmation, paymentMethod: 'Transfer', paymentPhone: '052-9999999' }),
    })
    await user.click(screen.getByRole('radio', { name: /Bit/ }))
    await fillAndSubmit(user)

    const dialog = await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
    expect(within(dialog).getByText('052-9999999')).toBeInTheDocument()
    expect(within(dialog).queryByText('התשלום יבוצע במעמד מסירת המשלוח')).not.toBeInTheDocument()
  })

  it('keeps the order and explains when the server refuses it', async () => {
    const { user } = await openOrderPage({
      'POST /api/orders': () => invalid({ SupplyDate: ['supplyDateUnavailable'] }),
    })
    await fillAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('יום האספקה שנבחר כבר לא פתוח להזמנה')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(total().getByText('סה"כ: ₪70')).toBeInTheDocument()
  })

  describe('drafts', () => {
    it('asks whether to save when leaving with an order in progress, and restores a saved draft', async () => {
      const { user } = await openOrderPage()
      await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה להזמנה/ }))
      await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: 'הוספה: עוף בתנור' }))

      await user.click(screen.getByRole('link', { name: 'המלצות' }))
      const dialog = await screen.findByRole('dialog', { name: 'ההזמנה עוד לא נשלחה' })
      await user.click(within(dialog).getByRole('button', { name: 'שמירה ויציאה' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'המלצות' })).toBeInTheDocument()
      expect(localStorage.getItem('kuskus.orderDraft')).toContain('"quantity":2')

      await user.click(screen.getByRole('link', { name: 'הזמנה' }))
      expect(await screen.findByText('שחזרנו הזמנה שהתחלתם ושמרתם.')).toBeInTheDocument()
      expect(total().getByText('סה"כ: ₪140')).toBeInTheDocument()
    })

    it('discards the draft when leaving without saving', async () => {
      localStorage.setItem('kuskus.orderDraft', JSON.stringify({ selections: { 1: { optionId: 11, quantity: 1, addOns: {} } } }))
      const { user } = await openOrderPage()

      await user.click(screen.getByRole('link', { name: 'פרופיל' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'יציאה בלי לשמור' }))

      expect(await screen.findByRole('heading', { level: 1, name: 'פרופיל' })).toBeInTheDocument()
      expect(localStorage.getItem('kuskus.orderDraft')).toBeNull()
    })

    it('stays on the page when the client changes their mind', async () => {
      const { user } = await openOrderPage()
      await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה להזמנה/ }))

      await user.click(screen.getByRole('link', { name: 'פרופיל' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'להישאר בהזמנה' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: 'הזמנה' })).toBeInTheDocument()
    })

    it('leaves freely when nothing is ordered', async () => {
      const { user } = await openOrderPage()
      await user.click(screen.getByRole('link', { name: 'פרופיל' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'פרופיל' })).toBeInTheDocument()
    })

    it('tells the client when saved dishes are gone', async () => {
      localStorage.setItem(
        'kuskus.orderDraft',
        JSON.stringify({
          selections: { 1: { optionId: 11, quantity: 1, addOns: {} }, 99: { optionId: 1, quantity: 1, addOns: {} } },
        }),
      )
      await openOrderPage()

      expect(await screen.findByText(/מנה אחת כבר לא זמינה והוסרה/)).toBeInTheDocument()
      expect(total().getByText('סה"כ: ₪70')).toBeInTheDocument()
    })
  })

  it('shows sold-out dishes as sold out, without an add button', async () => {
    await openOrderPage({
      'GET /api/menu': () => menu({ dishes: [menuDish(1, 'עוף בתנור', 1, { isSoldOut: true }), menuDish(2, 'אורז', 2)] }),
    })
    const card = dishCard('עוף בתנור')
    expect(within(card).getByText('אזל')).toBeInTheDocument()
    expect(within(card).queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens a dish by default: shows the options with the default marked, and picking one adds it', async () => {
    const dish = menuDish(1, 'עוף בתנור', 1, {
      openByDefault: true,
      options: [
        { id: 11, label: 'קטן', amount: 1, price: 40, isDefault: false },
        { id: 12, label: 'גדול', amount: 2, price: 70, isDefault: true },
      ],
    })
    const { user } = await openOrderPage({ 'GET /api/menu': () => menu({ dishes: [dish, menuDish(2, 'אורז', 2)] }) })
    const card = dishCard('עוף בתנור')

    expect(within(card).queryByRole('button', { name: 'הוספה להזמנה: עוף בתנור' })).not.toBeInTheDocument()
    expect(within(card).getByText(/הכי פופולרי/)).toBeInTheDocument()
    for (const radio of within(card).getAllByRole('radio')) expect(radio).not.toBeChecked()
    expect(total().queryByText(/סה"כ: ₪[1-9]/)).not.toBeInTheDocument()

    await user.click(within(card).getAllByRole('radio')[1])
    expect(within(card).getAllByRole('radio')[1]).toBeChecked()
    expect(within(card).getByRole('button', { name: 'הסרה מההזמנה: עוף בתנור' })).toBeInTheDocument()
  })

  it('shows how much of a limited dish is left on the chosen date', async () => {
    const dates = menu().supplyDates.map((d) => d.date)
    const limited = menuDish(1, 'עוף בתנור', 1, { remaining: { [dates[0]]: 2, [dates[1]]: 0 } })
    const { user } = await openOrderPage({ 'GET /api/menu': () => menu({ dishes: [limited, menuDish(2, 'אורז', 2)] }) })
    const card = dishCard('עוף בתנור')

    expect(within(card).getByText('נותרו 2')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'הוספה להזמנה: עוף בתנור' }))
    const more = within(card).getByRole('button', { name: 'הוספה: עוף בתנור' })
    await user.click(more)
    expect(more).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('יום אספקה'), dates[1])
    expect(within(card).getByText('אזל ליום האספקה שנבחר')).toBeInTheDocument()
  })

  it('lets each category be collapsed', async () => {
    const { user } = await openOrderPage()
    const summary = screen.getByRole('heading', { level: 2, name: 'עופות' }).closest('summary')!
    await user.click(summary)
    expect(summary.closest('details')).not.toHaveAttribute('open')
  })

  it('rotates a dish carousel without a pause button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const withImages = menu({
        dishes: [menuDish(1, 'עוף בתנור', 1, { images: ['/a.jpg', '/b.jpg'] }), menuDish(2, 'אורז', 2)],
      })
      await openOrderPage({ 'GET /api/menu': () => withImages })
      const image = () => within(dishCard('עוף בתנור')).getByRole('img')
      expect(image()).toHaveAttribute('src', '/a.jpg')

      await act(() => vi.advanceTimersByTimeAsync(4600))
      expect(image()).toHaveAttribute('src', '/b.jpg')

      expect(screen.queryByRole('button', { name: /גלגול התמונות/ })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
