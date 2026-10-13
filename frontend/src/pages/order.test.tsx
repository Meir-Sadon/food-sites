import { act, fireEvent, screen, within } from '@testing-library/react'
import { confirmNoAdjustments } from '../test/adjust'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Confirmation } from '../api/site'
import { DRAFT_KEY } from '../order/draft'
import { groupedMenu, menu, menuDish, publicApi, site } from '../test/catalogData'
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
  await confirmNoAdjustments(user)
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

    // Two units: each has its add-ons of its own.
    const first = within(card).getByRole('group', { name: 'מנה 1: עוף בתנור' })
    const second = within(card).getByRole('group', { name: 'מנה 2: עוף בתנור' })
    await user.click(within(first).getByRole('button', { name: 'הוספה: ירך' }))
    await user.click(within(first).getByRole('button', { name: 'הוספה: ירך' }))
    expect(total().getByText('סה"כ: ₪104')).toBeInTheDocument()

    // The second unit copies the first one's add-ons.
    await user.selectOptions(within(second).getByRole('combobox', { name: 'העתקת תוספות למנה 2' }), 'מנה 1')
    expect(total().getByText('סה"כ: ₪128')).toBeInTheDocument()
    await user.click(within(second).getByRole('button', { name: 'הפחתה: ירך' }))
    expect(total().getByText('סה"כ: ₪116')).toBeInTheDocument()
    await user.click(within(second).getByRole('button', { name: 'הפחתה: ירך' }))
    expect(total().getByText('סה"כ: ₪104')).toBeInTheDocument()

    const meat = dishCard('בשר טחון')
    await user.click(within(meat).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(meat).getByRole('button', { name: 'הוספה: בשר טחון' }))
    expect(total().getByText('סה"כ: ₪171.5')).toBeInTheDocument()
    expect(total().getByText('3 מנות')).toBeInTheDocument()
    expect(total().queryByText(/מנות צדדיות|מנה צדדית/)).not.toBeInTheDocument()
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
    expect(total().queryByText(/^\d+ מנות$|^מנה אחת$/)).not.toBeInTheDocument()
    expect(total().getByText('2 מנות צדדיות')).toBeInTheDocument()

    // Remove the salad; two couscous with a pita added to them: pita as part of the dish counts nowhere.
    await user.click(within(salad).getByRole('button', { name: 'הסרה מההזמנה: סלט' }))
    const couscous = dishCard('קוסקוס')
    await user.click(within(couscous).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(couscous).getByRole('button', { name: 'הוספה: קוסקוס' }))
    await user.click(within(within(couscous).getByRole('group', { name: 'מנה 1: קוסקוס' })).getByRole('button', { name: 'הוספה: כפיתה' }))
    expect(total().getByText('2 מנות')).toBeInTheDocument()
    expect(total().getByText('מנה צדדית אחת')).toBeInTheDocument()
  })

  it('shows each total only once something of its kind is in the order', async () => {
    const dishes = [menuDish(1, 'קוסקוס', 1), menuDish(3, 'סלט', 1, { isSideDish: true }), menuDish(5, 'קולה', 9)]
    const { user } = await openOrderPage({
      'GET /api/menu': () => menu({ categories: [{ id: 1, name: 'עופות' }, { id: 9, name: 'שתיה' }], dishes }),
    })
    expect(total().queryByText(/מנות|מנה|שתיה/)).not.toBeInTheDocument()

    await user.click(within(dishCard('קוסקוס')).getByRole('button', { name: /הוספה להזמנה/ }))
    expect(total().getByText('מנה אחת')).toBeInTheDocument()
    expect(total().queryByText(/צדדי|שתיה/)).not.toBeInTheDocument()

    await user.click(within(dishCard('סלט')).getByRole('button', { name: /הוספה להזמנה/ }))
    expect(total().getByText('מנה צדדית אחת')).toBeInTheDocument()
    expect(total().queryByText(/שתיה/)).not.toBeInTheDocument()

    await user.click(within(dishCard('קוסקוס')).getByRole('button', { name: 'הסרה מההזמנה: קוסקוס' }))
    expect(total().queryByText('מנה אחת')).not.toBeInTheDocument()
    expect(total().getByText('מנה צדדית אחת')).toBeInTheDocument()
  })

  it('counts the units ordered from the drinks category in their own total', async () => {
    const drinks = [menuDish(1, 'קוסקוס', 1), menuDish(5, 'קולה', 9)]
    const { user } = await openOrderPage({
      'GET /api/menu': () => menu({ categories: [{ id: 1, name: 'עופות' }, { id: 9, name: 'שתיה' }], dishes: drinks }),
    })

    const cola = dishCard('קולה')
    await user.click(within(cola).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(cola).getByRole('button', { name: 'הוספה: קולה' }))
    await user.click(within(cola).getByRole('button', { name: 'הוספה: קולה' }))
    expect(total().getByText('3 שתיה')).toBeInTheDocument()
    expect(total().queryByText(/^\d+ מנות$|^מנה אחת$/)).not.toBeInTheDocument()
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
    await confirmNoAdjustments(user)

    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeDisabled()
    expect(screen.getByText(/המינימום להזמנה הוא ₪100\. חסרים עוד ₪30\./)).toBeInTheDocument()

    await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה: עוף בתנור/ }))
    await confirmNoAdjustments(user)
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeEnabled()
  })

  it('lets a pickup order below the minimum through when the minimum is for deliveries only', async () => {
    const { user } = await openOrderPage({
      'GET /api/site': () => site({ minimumOrderAmount: 100, minimumOrderAppliesToPickup: false }),
    })
    await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה להזמנה/ }))
    await confirmNoAdjustments(user)
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'איסוף עצמי' }))
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeEnabled()
    expect(screen.queryByText(/המינימום להזמנה הוא/)).not.toBeInTheDocument()
  })

  it('starts with the first of several service cities, offers them all, and names them in the warning', async () => {
    const { user } = await openOrderPage({ 'GET /api/site': () => site({ serviceCities: ['אשדוד', 'אשקלון', 'שדרות'] }) })
    const city = screen.getByLabelText('עיר')
    await vi.waitFor(() => expect(city).toHaveValue('אשדוד'))
    const options = [...(city as HTMLInputElement).list!.options].map((o) => o.value)
    expect(options).toEqual(['אשדוד', 'אשקלון', 'שדרות'])

    await user.clear(city)
    await user.type(city, 'אשקלון')
    expect(screen.queryByText(/אנחנו עובדים רק ב/)).not.toBeInTheDocument()
    await user.clear(city)
    await user.type(city, 'חיפה')
    expect(screen.getByText(/אנחנו עובדים רק באשדוד, אשקלון ושדרות\./)).toBeInTheDocument()
  })

  it('never warns when every city is served', async () => {
    const { user } = await openOrderPage({ 'GET /api/site': () => site({ serviceCities: [] }) })
    const city = screen.getByLabelText('עיר')
    expect(city).toHaveValue('')
    await user.type(city, 'חיפה')
    expect(screen.queryByText(/אנחנו עובדים רק ב/)).not.toBeInTheDocument()
  })

  it('starts the city as אשקלון and warns when another city is typed', async () => {
    const { api, user } = await openOrderPage({
      'POST /api/orders': () => ({ ...confirmation, needsReview: true }),
    })
    const city = screen.getByLabelText('עיר')
    await vi.waitFor(() => expect(city).toHaveValue('אשקלון'))
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
    await confirmNoAdjustments(user)
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '12')

    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))

    expect(await screen.findByLabelText('טלפון')).toHaveAccessibleDescription(/מספר הטלפון לא תקין\./)
    expect(api.sent('POST', '/api/orders')).toHaveLength(0)
  })

  describe('supply hours', () => {
    const withHours = () =>
      menu({
        supplyDates: [
          {
            date: '2026-10-09',
            cutoff: '2026-10-07T20:00:00',
            hours: [
              { from: '08:00:00', to: '09:00:00' },
              { from: '09:00:00', to: '09:30:00' },
            ],
          },
          { date: '2026-10-16', cutoff: '2026-10-14T20:00:00', hours: [] },
        ],
      })

    it('offers the date\'s hours and needs one before sending', async () => {
      const { api, user } = await openOrderPage({ 'GET /api/menu': withHours })
      const hour = screen.getByLabelText('שעת אספקה מועדפת')
      expect([...hour.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['בחרו שעה', '08:00 עד 09:00', '09:00 עד 09:30'])

      await fillAndSubmit(user)
      expect(hour).toHaveAccessibleDescription(/שדה חובה/)
      expect(api.sent('POST', '/api/orders')).toHaveLength(0)

      // A date without hours asks for none.
      await user.selectOptions(screen.getByLabelText('יום אספקה'), '2026-10-16')
      expect(screen.queryByLabelText('שעת אספקה מועדפת')).not.toBeInTheDocument()
    })

    it('says nothing about a free hour, and notes a full one without blocking the order', async () => {
      const { api, user } = await openOrderPage({
        'GET /api/menu': withHours,
        'GET /api/hour-availability\\?date=[\\d-]+&hour=(\\d\\d).*': (match: RegExpMatchArray) => ({ full: match[1] === '08' }),
        'POST /api/orders': () => ({ ...confirmation, deliveryHour: '08:00:00', hourFull: true }),
      })
      const hour = screen.getByLabelText('שעת אספקה מועדפת')

      await user.selectOptions(hour, '09:00:00')
      await vi.waitFor(() => expect(api.calls.filter((c) => c.path.includes('hour-availability'))).toHaveLength(1))
      expect(screen.queryByText(/השעה הזאת כבר מלאה/)).not.toBeInTheDocument()

      await user.selectOptions(hour, '08:00:00')
      expect(await screen.findByText(/השעה הזאת כבר מלאה/)).toBeInTheDocument()

      await fillAndSubmit(user)
      expect(api.sent('POST', '/api/orders')[0].body).toMatchObject({ deliveryHour: '08:00:00' })
      const dialog = await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
      expect(within(dialog).getByText(/בשעה 08:00/)).toBeInTheDocument()
      expect(within(dialog).getByText(/ניצור איתכם קשר כדי לתאם שעה אחרת/)).toBeInTheDocument()
    })
  })

  it('lets the client write a name on each ordered dish and sends it with its unit', async () => {
    const { api, user } = await openOrderPage({ 'POST /api/orders': () => confirmation })
    const card = dishCard('עוף בתנור')
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.type(within(card).getByLabelText('שם או הערה: עוף בתנור'), 'דנה')
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוף בתנור' }))
    await user.type(within(card).getByLabelText('שם או הערה למנה 2'), 'יוסי')
    expect(within(card).getByLabelText('שם או הערה למנה 1')).toHaveValue('דנה')
    await confirmNoAdjustments(user)

    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })

    expect(api.sent('POST', '/api/orders')[0].body).toMatchObject({
      items: [{ quantity: 2, addOnUnits: [{ note: 'דנה' }, { note: 'יוסי' }] }],
    })
  })

  it('blocks sending until every unit of a dish with add-ons is adjusted or confirmed, and can apply one unit to the rest', async () => {
    const { user } = await openOrderPage()
    const card = dishCard('עוף בתנור')
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוף בתנור' }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוף בתנור' }))
    const submit = screen.getByRole('button', { name: 'שליחת ההזמנה' })
    expect(screen.getByText(/יש להתאים כל מנה/)).toBeInTheDocument()
    expect(within(card).getAllByText(/נדרשת התאמה/)).toHaveLength(3)

    // Sending opens the first unit waiting for the client and brings them to it; nothing is sent.
    await user.click(submit)
    const panels = card.querySelectorAll('details.addon-unit')
    expect(panels[0]).toHaveAttribute('open')
    expect(panels[0].querySelector('summary')).toHaveFocus()

    // One add-on on the first unit, then the same for every unit not set yet.
    const first = within(card).getByRole('group', { name: 'מנה 1: עוף בתנור' })
    await user.click(within(first).getByRole('button', { name: 'הוספה: ירך' }))
    await user.click(submit)
    expect(panels[1]).toHaveAttribute('open')
    expect(panels[1].querySelector('summary')).toHaveFocus()
    await user.click(within(first).getByRole('button', { name: /החלה על כל המנות שלא הותאמו/ }))
    expect(screen.queryByText(/יש להתאים כל מנה/)).not.toBeInTheDocument()
    expect(within(card).queryAllByText(/נדרשת התאמה/)).toHaveLength(0)
    expect(total().getByText('סה"כ: ₪' + String(3 * 70 + 3 * 12))).toBeInTheDocument()
  })

  it('shows each custom group as its own section above the categories, with dishes from any category', async () => {
    const withGroups = menu()
    withGroups.groups = [
      { id: 1, name: 'מומלצות', dishIds: [2, 1] },
      { id: 2, name: 'מנות במבצע', dishIds: [2] },
    ]
    await openOrderPage({ 'GET /api/menu': () => withGroups })
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.slice(0, 4)).toEqual(['מומלצות', 'מנות במבצע', 'עופות', 'בשרים'])
    const picks = screen.getByRole('heading', { level: 2, name: 'מומלצות' }).closest('details') as HTMLElement
    expect(within(picks).getAllByRole('article').map((a) => a.querySelector('h3')?.textContent)).toEqual(['בשר טחון', 'עוף בתנור'])
    // A dish in two groups and its category shows in each place.
    expect(screen.getAllByRole('article', { name: 'בשר טחון' })).toHaveLength(3)
    expect(within(screen.getByRole('navigation', { name: 'מעבר בין קטגוריות' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'מומלצות',
      'מנות במבצע',
      'עופות',
      'בשרים',
    ])
  })

  it('shows no group section when the menu has no groups', async () => {
    await openOrderPage()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['עופות', 'בשרים', 'פרטי ההזמנה'])
  })

  it('lets the client send units left unadjusted when the dish makes adjusting optional', async () => {
    const optional = menu()
    optional.dishes[0] = { ...optional.dishes[0], adjustmentOptional: true }
    const { api, user } = await openOrderPage({ 'GET /api/menu': () => optional, 'POST /api/orders': () => confirmation })
    const card = dishCard('עוף בתנור')
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוף בתנור' }))
    // The units wait behind a button until the client asks for them.
    expect(within(card).queryByRole('group', { name: 'מנה 1: עוף בתנור' })).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'הצג התאמת מנות: עוף בתנור' }))
    const first = within(card).getByRole('group', { name: 'מנה 1: עוף בתנור' })
    await user.click(within(first).getByRole('button', { name: 'הוספה: ירך' }))
    await user.click(within(card).getByRole('button', { name: 'הסתר התאמת מנות: עוף בתנור' }))
    expect(within(card).queryByRole('group', { name: 'מנה 1: עוף בתנור' })).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'הצג התאמת מנות: עוף בתנור' }))

    expect(screen.queryByText(/יש להתאים כל מנה/)).not.toBeInTheDocument()
    expect(within(card).queryAllByText(/נדרשת התאמה/)).toHaveLength(0)
    expect(within(card).getByText(/התאמה לא חובה/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
    expect(api.sent('POST', '/api/orders')).toHaveLength(1)
  })

  it('has one remark for a dish without add-ons, whatever the amount', async () => {
    const plain = [menuDish(1, 'קוסקוס', 1)]
    const { user } = await openOrderPage({ 'GET /api/menu': () => menu({ dishes: plain }) })
    const card = dishCard('קוסקוס')
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: קוסקוס' }))
    // A remark alone waits behind the show/hide button.
    expect(within(card).queryAllByRole('textbox')).toHaveLength(0)
    await user.click(within(card).getByRole('button', { name: 'הצג התאמת מנות: קוסקוס' }))
    expect(within(card).getAllByRole('textbox')).toHaveLength(1)
    expect(within(card).queryByRole('group', { name: /מנה 1/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/יש להתאים כל מנה/)).not.toBeInTheDocument()
  })

  it('asks the dish questions for each ordered unit and sends the answers', async () => {
    const cake = menuDish(4, 'עוגה', 1, {
      questions: [
        { id: 1, text: 'גודל', kind: 'SingleChoice', choices: ['קטן', 'גדול'], showAsDropdown: false, isRequired: true },
        { id: 2, text: 'טעם', kind: 'SingleChoice', choices: ['שוקולד', 'וניל'], showAsDropdown: true, isRequired: false },
        { id: 3, text: 'קישוטים', kind: 'MultiChoice', choices: ['פרחים', 'סוכריות', 'נרות'], showAsDropdown: false, isRequired: false },
        { id: 4, text: 'ברכה', kind: 'Text', choices: [], showAsDropdown: false, isRequired: false },
        { id: 5, text: 'חתוכה?', kind: 'YesNo', choices: [], showAsDropdown: false, isRequired: false },
        { id: 6, text: 'תאריך האירוע', kind: 'Date', choices: [], showAsDropdown: false, isRequired: false },
        { id: 7, text: 'כמה סועדים', kind: 'Number', choices: [], showAsDropdown: false, isRequired: false },
      ],
    })
    const { api, user } = await openOrderPage({
      'GET /api/menu': () => menu({ dishes: [...menu().dishes, cake] }),
      'POST /api/orders': () => confirmation,
    })
    const card = dishCard('עוגה')
    await user.click(within(card).getByRole('button', { name: 'הוספה להזמנה: עוגה' }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוגה' }))

    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('יש לענות על השאלות המסומנות ב־* במנה עוגה.')
    expect(api.sent('POST', '/api/orders')).toHaveLength(0)

    const first = within(within(card).getByRole('group', { name: 'מנה 1: עוגה' }))
    await user.click(within(first.getByRole('group', { name: /גודל/ })).getByLabelText('גדול'))
    await user.selectOptions(first.getByLabelText('טעם'), 'וניל')
    await user.click(first.getByLabelText('נרות'))
    await user.click(first.getByLabelText('פרחים'))
    await user.type(first.getByLabelText('ברכה'), 'מזל טוב')
    await user.click(within(first.getByRole('group', { name: 'חתוכה?' })).getByLabelText('כן'))
    fireEvent.change(first.getByLabelText('תאריך האירוע'), { target: { value: '2026-12-25' } })
    await user.type(first.getByLabelText('כמה סועדים'), '12')
    const second = within(within(card).getByRole('group', { name: 'מנה 2: עוגה' }))
    await user.click(within(second.getByRole('group', { name: /גודל/ })).getByLabelText('קטן'))

    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
    expect(api.sent('POST', '/api/orders')[0].body).toMatchObject({
      items: [
        {
          dishId: 4,
          quantity: 2,
          addOnUnits: [
            {
              answers: [
                { questionId: 1, value: 'גדול' },
                { questionId: 2, value: 'וניל' },
                { questionId: 3, choices: ['פרחים', 'נרות'] },
                { questionId: 4, value: 'מזל טוב' },
                { questionId: 5, value: 'yes' },
                { questionId: 6, value: '2026-12-25' },
                { questionId: 7, value: '12' },
              ],
            },
            { answers: [{ questionId: 1, value: 'קטן' }] },
          ],
        },
      ],
    })
  })

  it('preselects default answers and, with adjusting optional, sends without the required ones answered', async () => {
    const cake = menuDish(4, 'עוגה', 1, {
      adjustmentOptional: true,
      questions: [
        { id: 1, text: 'גודל', kind: 'SingleChoice', choices: ['קטן', 'גדול'], showAsDropdown: false, isRequired: true, defaultAnswer: 'גדול' },
        { id: 2, text: 'ברכה', kind: 'Text', choices: [], showAsDropdown: false, isRequired: true },
        { id: 3, text: 'קישוטים', kind: 'MultiChoice', choices: ['פרחים', 'נרות'], showAsDropdown: false, isRequired: false, defaultAnswer: 'נרות' },
      ],
    })
    const { api, user } = await openOrderPage({
      'GET /api/menu': () => menu({ dishes: [...menu().dishes, cake] }),
      'POST /api/orders': () => confirmation,
    })
    const card = dishCard('עוגה')
    await user.click(within(card).getByRole('button', { name: 'הוספה להזמנה: עוגה' }))
    await user.click(within(card).getByRole('button', { name: 'הצג התאמת מנות: עוגה' }))
    const unit = within(within(card).getByRole('group', { name: 'התאמה אישית: עוגה' }))
    expect(within(unit.getByRole('group', { name: /גודל/ })).getByLabelText('גדול')).toBeChecked()
    expect(unit.getByLabelText('נרות')).toBeChecked()
    await user.click(unit.getByLabelText('נרות'))

    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
    expect(api.sent('POST', '/api/orders')[0].body).toMatchObject({
      items: [{ dishId: 4, quantity: 1, addOnUnits: [{ answers: [{ questionId: 1, value: 'גדול' }] }] }],
    })
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
      deliveryHour: null,
      fulfillmentMethod: 'Delivery',
      paymentMethod: 'OnDelivery',
      notes: '',
      items: [{ dishId: 1, optionId: 11, quantity: 1, addOns: [], addOnUnits: [{ addOns: [] }] }],
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
      expect(localStorage.getItem(DRAFT_KEY)).toContain('"quantity":2')

      await user.click(screen.getByRole('link', { name: 'הזמנה' }))
      expect(await screen.findByText('שחזרנו הזמנה שהתחלתם ושמרתם.')).toBeInTheDocument()
      expect(total().getByText('סה"כ: ₪140')).toBeInTheDocument()
    })

    it('discards the draft when leaving without saving', async () => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ selections: { 1: { optionId: 11, quantity: 1, addOns: {} } } }))
      const { user } = await openOrderPage()

      await user.click(screen.getByRole('link', { name: 'פרופיל' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'יציאה בלי לשמור' }))

      expect(await screen.findByRole('heading', { level: 1, name: 'פרופיל' })).toBeInTheDocument()
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
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
        DRAFT_KEY,
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

describe('Grouped dishes and add-on settings', () => {
  const grouped = { ...publicApi, 'GET /api/menu': () => groupedMenu() }

  async function open() {
    const api = fakeApi(grouped as Parameters<typeof fakeApi>[0])
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'סיגרים' })
    return { api, user: userEvent.setup() }
  }

  it('shows variants in the main dish card and sends each as a line of its own', async () => {
    const { api, user } = await open()
    const card = dishCard('סיגרים עבודת יד')
    expect(within(card).getByText('תיאור משותף')).toBeInTheDocument()
    expect(within(card).getByRole('heading', { level: 4, name: 'סיגר כבד' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'סיגר כבד' })).not.toBeInTheDocument()
    // The main dish's picture stays in the card; only the variant with pictures of its own adds one.
    expect(within(card).getAllByRole('img').map((i) => i.getAttribute('src'))).toEqual(['https://img/cigar.jpg', 'https://img/chicken.jpg'])

    await user.click(within(card).getByRole('button', { name: 'הוספה להזמנה: סיגר כבד' }))
    await user.click(within(card).getByRole('button', { name: 'הוספה להזמנה: סיגר עוף' }))
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))

    await vi.waitFor(() => expect(api.sent('POST', '/api/orders')).toHaveLength(1))
    const items = (api.sent('POST', '/api/orders')[0].body as { items: { dishId: number }[] }).items
    expect(items.map((i) => i.dishId)).toEqual([2, 3])
  })

  it('prices an add-on at its price under the dish, limits its units and its group', async () => {
    const { user } = await open()
    const card = dishCard('כריך')
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))

    const salads = within(card).getByRole('group', { name: /סלטים/ })
    await user.click(within(salads).getByLabelText(/חומוס/))
    // The group takes one unit, so the second salad cannot be ticked.
    expect(within(salads).getByLabelText(/טחינה/)).toBeDisabled()

    const chicken = within(card).getByRole('group', { name: 'עוף' })
    const more = within(chicken).getByRole('button', { name: 'הוספה: עוף' })
    await user.click(more)
    await user.click(more)
    expect(more).toBeDisabled()
    // 40 for the dish, free hummus, two chicken at 8 instead of 12.
    expect(total().getByText('סה"כ: ₪56')).toBeInTheDocument()
  })
})

describe('Dish search', () => {
  it('searches dishes from two characters and shows the best match first', async () => {
    const { user } = await openOrderPage()
    const search = screen.getByRole('searchbox', { name: 'חיפוש מנה' })
    await user.type(search, 'ע')
    expect(screen.getByRole('heading', { level: 2, name: 'עופות' })).toBeInTheDocument()
    await user.type(search, 'ו')
    expect(screen.queryByRole('heading', { level: 2, name: 'עופות' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'נמצאה מנה אחת' })).toBeInTheDocument()
    // The result is a normal dish card: it can be added to the order.
    await user.click(within(dishCard('עוף בתנור')).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.type(search, 'xyz')
    expect(screen.getByRole('heading', { level: 2, name: 'לא נמצאו מנות' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ניקוי החיפוש' }))
    expect(screen.getByRole('heading', { level: 2, name: 'עופות' })).toBeInTheDocument()
    expect(total().getByText(/70/)).toBeInTheDocument()
  })
})
