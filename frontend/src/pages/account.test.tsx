import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Favorite, HistoryOrder, Profile } from '../api/account'
import { publicApi, site } from '../test/catalogData'
import { fakeApi, invalid } from '../test/fakeApi'
import { renderAt } from '../test/render'

const profile: Profile = {
  id: 1,
  phone: '0501234567',
  fullName: 'דנה כהן',
  city: 'חיפה',
  street: 'הרצל',
  houseNumber: '1',
  apartment: '',
  address: 'הרצל 1, חיפה',
  email: null,
  birthday: null,
  ethnicBackground: null,
}

const pastOrder: HistoryOrder = {
  id: 5,
  supplyDate: '2026-10-02',
  status: 'Delivered',
  fulfillmentMethod: 'Delivery',
  paymentMethod: 'OnDelivery',
  isPaid: true,
  total: 116,
  createdAt: '2026-09-30T10:00:00Z',
  items: [
    { id: 1, dishId: 1, parentItemId: null, dishName: 'עוף בתנור', optionLabel: 'חצי', quantity: 2, unitPrice: 40, lineTotal: 80 },
    { id: 2, dishId: 3, parentItemId: 1, dishName: 'ירך', optionLabel: 'יחידה', quantity: 3, unitPrice: 12, lineTotal: 36 },
  ],
}

const favorite: Favorite = {
  id: 9,
  name: 'שישי',
  items: [{ dishId: 2, optionId: null, quantity: 1.5, addOns: [] }],
}

const guest = { 'GET /api/account/me': () => ({ status: 401, body: {} }) }
const loggedIn = {
  'GET /api/account/me': () => profile,
  'GET /api/account/orders': () => [pastOrder],
  'GET /api/account/favorites': () => [favorite],
  'GET /api/account/recommendations': () => [{ id: 1, text: 'קובה סלק', createdAt: '2026-10-01T08:00:00Z', isHandled: true }],
}

type Routes = Parameters<typeof fakeApi>[0]
const open = (path: string, routes: Record<string, unknown>) => {
  const api = fakeApi({ ...publicApi, ...routes } as Routes)
  renderAt(path)
  return { api, user: userEvent.setup() }
}

async function submitPhone(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
  await user.click(screen.getByRole('button', { name: 'התחברות' }))
}

beforeEach(() => {
  localStorage.clear()
})

describe('Login', () => {
  it('logs in an existing client by phone, then opens the order page', async () => {
    const { api, user } = open('/login', { ...guest, 'POST /api/account/login': () => profile })
    await screen.findByRole('heading', { name: 'התחברות' })
    expect(screen.getByRole('button', { name: 'הרשמה' })).toBeInTheDocument()
    expect(screen.queryByLabelText('רחוב')).not.toBeInTheDocument()

    await submitPhone(user)

    await screen.findByRole('heading', { level: 1, name: 'הזמנה' })
    expect(api.sent('POST', '/api/account/login')[0].body).toEqual({ phone: '0501234567' })
    expect(screen.getByRole('button', { name: 'התנתקות' })).toBeInTheDocument()
  })

  it('offers to register when the phone has no account', async () => {
    const { api, user } = open('/login', {
      ...guest,
      'POST /api/account/login': () => ({ status: 404, body: { code: 'notRegistered' } }),
      'POST /api/account/register': () => profile,
    })
    await screen.findByRole('heading', { name: 'התחברות' })

    await submitPhone(user)

    await screen.findByRole('heading', { name: 'הרשמה' })
    expect(screen.getByText(/עוד לא רשום/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('שם מלא'), 'דנה כהן')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    await screen.findByRole('heading', { level: 1, name: 'הזמנה' })
    expect(api.sent('POST', '/api/account/register')[0].body).toMatchObject({
      phone: '0501234567',
      fullName: 'דנה כהן',
      city: 'אשקלון',
      street: 'הרצל',
      houseNumber: '1',
    })
  })

  it('registration starts with the city אשקלון and warns about another city', async () => {
    const { user } = open('/login', {
      ...guest,
      'POST /api/account/login': () => ({ status: 404, body: { code: 'notRegistered' } }),
    })
    await screen.findByRole('heading', { name: 'התחברות' })
    await submitPhone(user)
    await screen.findByRole('heading', { name: 'הרשמה' })

    const city = screen.getByLabelText('עיר')
    await vi.waitFor(() => expect(city).toHaveValue('אשקלון'))
    expect(screen.queryByText(/אנחנו עובדים רק באשקלון/)).not.toBeInTheDocument()
    await user.clear(city)
    await user.type(city, 'חיפה')
    expect(screen.getByText(/אנחנו עובדים רק באשקלון/)).toBeInTheDocument()
  })

  it('registers from the Register button, with the optional fields marked', async () => {
    const { api, user } = open('/login', { ...guest, 'POST /api/account/register': () => profile })
    await screen.findByRole('heading', { name: 'התחברות' })

    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    expect(screen.getByLabelText('אימייל (לא חובה)')).toBeInTheDocument()
    expect(screen.getByLabelText('תאריך לידה (לא חובה)')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('רקע עדתי (לא חובה)')).toBeInTheDocument()

    await user.type(screen.getByLabelText('טלפון'), '0501234567')
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.click(screen.getAllByRole('button', { name: 'הרשמה' }).at(-1)!)

    await screen.findByRole('heading', { level: 1, name: 'הזמנה' })
    expect(api.sent('POST', '/api/account/register')[0].body).toMatchObject({ phone: '0501234567', fullName: 'דנה' })
  })

  it('says so when the phone already has an account', async () => {
    const { user } = open('/login', {
      ...guest,
      'POST /api/account/login': () => ({ status: 404, body: { code: 'notRegistered' } }),
      'POST /api/account/register': () => ({ status: 409, body: { code: 'phoneTaken' } }),
    })
    await screen.findByRole('heading', { name: 'התחברות' })
    await submitPhone(user)
    await screen.findByRole('heading', { name: 'הרשמה' })
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')

    await user.click(screen.getAllByRole('button', { name: 'הרשמה' }).at(-1)!)

    expect(await screen.findByText(/כבר רשום/)).toBeInTheDocument()
  })

  it('shows the field messages from the server on registration', async () => {
    const { user } = open('/login', {
      ...guest,
      'POST /api/account/login': () => ({ status: 404, body: { code: 'notRegistered' } }),
      'POST /api/account/register': () => invalid({ email: ['email'] }),
    })
    await screen.findByRole('heading', { name: 'התחברות' })
    await submitPhone(user)
    await screen.findByRole('heading', { name: 'הרשמה' })
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('אימייל (לא חובה)'), 'bad')

    await user.click(screen.getAllByRole('button', { name: 'הרשמה' }).at(-1)!)

    expect(await screen.findByText('כתובת האימייל לא תקינה.')).toBeInTheDocument()
  })

  it('shows who is logged in and lets them log out', async () => {
    const { api, user } = open('/login', { ...loggedIn, 'POST /api/account/logout': () => ({ status: 204 }) })

    expect(await screen.findByText('מחוברים כדנה כהן.')).toBeInTheDocument()
    await user.click(screen.getByRole('banner').querySelector('button')!)

    await screen.findByRole('heading', { level: 1, name: 'הזמנה' })
    expect(api.sent('POST', '/api/account/logout')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'התחברות / הרשמה' })).toBeInTheDocument()
  })
})

describe('Order page for a logged-in client', () => {
  it('prefills the details, counts the phone as confirmed and orders without a code', async () => {
    const { api, user } = open('/', {
      ...loggedIn,
      'POST /api/orders': () => ({
        id: 7, supplyDate: '2026-10-09', fulfillmentMethod: 'Delivery', paymentMethod: 'OnDelivery', total: 70, paymentPhone: null, needsReview: false, items: [],
      }),
    })
    await screen.findByRole('heading', { level: 2, name: 'עופות' })

    await waitFor(() => expect(screen.getByLabelText('שם מלא')).toHaveValue('דנה כהן'))
    expect(screen.getByLabelText('טלפון')).toHaveValue('0501234567')
    expect(screen.getByLabelText('עיר')).toHaveValue('חיפה')
    expect(screen.getByLabelText('רחוב')).toHaveValue('הרצל')
    expect(screen.getByLabelText('מספר בית')).toHaveValue('1')

    await user.click(within(screen.getByRole('article', { name: 'עוף בתנור' })).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))

    await screen.findByText('ההזמנה התקבלה')
    expect(api.sent('POST', '/api/orders')[0].body).toMatchObject({ phone: '0501234567', name: 'דנה כהן' })
  })

  it('logs out from the top bar even with an order in progress', async () => {
    const { api, user } = open('/', { ...loggedIn, 'POST /api/account/logout': () => ({ status: 204 }) })
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    await user.click(within(screen.getByRole('article', { name: 'עוף בתנור' })).getByRole('button', { name: /הוספה להזמנה/ }))

    await user.click(screen.getByRole('button', { name: 'התנתקות' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'יציאה בלי לשמור' }))

    expect(await screen.findByRole('link', { name: 'התחברות / הרשמה' })).toBeInTheDocument()
    expect(api.sent('POST', '/api/account/logout')).toHaveLength(1)
  })

  it('fills the whole order from the last order in one click, at current options', async () => {
    const { user } = open('/', loggedIn)
    await screen.findByRole('heading', { level: 2, name: 'עופות' })

    await user.click(await screen.findByRole('button', { name: 'ההזמנה האחרונה' }))

    expect(screen.getByText('ההזמנה מולאה במחירים הנוכחיים.')).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'עוף בתנור' })
    expect(within(card).getByRole('radio', { name: /חצי/ })).toBeChecked()
    // 2 × 40 plus 3 × 12
    expect(within(screen.getByRole('region', { name: 'סיכום הזמנה' })).getByText(/₪116/)).toBeInTheDocument()
  })

  it('fills the order from a favorite, skipping dishes that are gone', async () => {
    const gone: Favorite = { id: 10, name: 'ישן', items: [{ dishId: 99, optionId: null, quantity: 1, addOns: [] }] }
    const { user } = open('/', { ...loggedIn, 'GET /api/account/favorites': () => [favorite, gone] })
    await screen.findByRole('heading', { level: 2, name: 'עופות' })

    await user.click(await screen.findByText('המועדפים שלי'))
    await user.click(screen.getByRole('button', { name: 'שישי' }))

    expect(within(screen.getByRole('region', { name: 'סיכום הזמנה' })).getByText(/₪135/)).toBeInTheDocument()

    // The order now has dishes, so a second quick fill asks before replacing them.
    await user.click(screen.getByRole('button', { name: 'ישן' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'להחליף את ההזמנה הנוכחית?' })).getByRole('button', { name: 'כן, להחליף' }))
    expect(screen.getByText(/מנה אחת כבר לא זמינה והוסרה/)).toBeInTheDocument()
  })

  it('asks before replacing an order that already has dishes, and keeps it on "no"', async () => {
    const { user } = open('/', loggedIn)
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    await user.click(within(screen.getByRole('article', { name: 'עוף בתנור' })).getByRole('button', { name: /הוספה להזמנה/ }))
    const before = within(screen.getByRole('region', { name: 'סיכום הזמנה' })).getByText(/₪/).textContent

    await user.click(await screen.findByRole('button', { name: 'ההזמנה האחרונה' }))
    const dialog = await screen.findByRole('dialog', { name: 'להחליף את ההזמנה הנוכחית?' })
    await user.click(within(dialog).getByRole('button', { name: 'לא, להשאיר את ההזמנה שלי' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('ההזמנה מולאה במחירים הנוכחיים.')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'סיכום הזמנה' })).getByText(/₪/).textContent).toBe(before)
  })

  it('shows no quick-fill buttons to a guest', async () => {
    open('/', guest)
    await screen.findByRole('heading', { level: 2, name: 'עופות' })

    expect(screen.queryByRole('button', { name: 'ההזמנה האחרונה' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('שם מלא')).toHaveValue('')
  })
})

describe('Profile', () => {
  it('asks a guest to log in', async () => {
    open('/profile', guest)

    expect(await screen.findByRole('link', { name: 'להתחברות או הרשמה' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('שם מלא')).not.toBeInTheDocument()
  })

  it('saves edited details', async () => {
    const { api, user } = open('/profile', { ...loggedIn, 'PUT /api/account/me': (_m: unknown, body: object) => ({ ...profile, ...body }) })

    const name = await screen.findByLabelText('שם מלא')
    expect(name).toHaveValue('דנה כהן')
    await user.clear(name)
    await user.type(name, 'דנה לוי')
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect(api.sent('PUT', '/api/account/me')[0].body).toMatchObject({ phone: '0501234567', fullName: 'דנה לוי' })
  })

  it('saves a new phone number', async () => {
    const { api, user } = open('/profile', { ...loggedIn, 'PUT /api/account/me': (_m: unknown, body: object) => ({ ...profile, ...body }) })
    const phone = await screen.findByLabelText('טלפון')

    await user.clear(phone)
    await user.type(phone, '052-765-4321')
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect(api.sent('PUT', '/api/account/me')[0].body).toMatchObject({ phone: '0527654321' })
  })

  it('lists past orders with dates and statuses', async () => {
    open('/profile', loggedIn)

    const order = await screen.findByRole('article', { name: 'הזמנה #5' })
    expect(within(order).getByText('נמסרה')).toBeInTheDocument()
    expect(within(order).getByText(/09\/10\/2026|02\/10\/2026/)).toBeInTheDocument()
    expect(within(order).getByText(/2 × עוף בתנור \(חצי\)/)).toBeInTheDocument()
    expect(within(order).getByText(/3 × ירך/)).toBeInTheDocument()
  })

  it('reorders into the order page, which shows the filled order', async () => {
    const { user } = open('/profile', loggedIn)
    const order = await screen.findByRole('article', { name: 'הזמנה #5' })

    await user.click(within(order).getByRole('button', { name: 'הזמנה חוזרת' }))

    await screen.findByRole('heading', { level: 1, name: 'הזמנה' })
    expect(await screen.findByText('ההזמנה מולאה מהזמנה קודמת, במחירים הנוכחיים.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'סיכום הזמנה' })).getByText(/₪116/)).toBeInTheDocument()
  })

  it('saves a past order as a named favorite and removes favorites', async () => {
    const { api, user } = open('/profile', {
      ...loggedIn,
      'POST /api/account/favorites': () => ({ id: 11, name: 'חג', items: [{ dishId: 1, optionId: 10, quantity: 2, addOns: [] }] }),
      'DELETE /api/account/favorites/9': () => ({ status: 204 }),
    })
    const order = await screen.findByRole('article', { name: 'הזמנה #5' })

    await user.click(within(order).getByRole('button', { name: 'שמירה כמועדף' }))
    await user.type(within(order).getByLabelText('שם למועדף'), 'חג')
    await user.click(within(order).getByRole('button', { name: 'שמירה' }))

    await within(order).findByText('נשמר במועדפים.')
    expect(api.sent('POST', '/api/account/favorites')[0].body).toEqual({ name: 'חג', orderId: 5 })
    const favorites = screen.getByRole('region', { name: 'המועדפים שלי' })
    expect(within(favorites).getByText('חג')).toBeInTheDocument()

    const row = within(favorites).getByText('שישי').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'הסרה' }))
    await user.click(within(row).getByRole('button', { name: 'כן, להסיר' }))
    await waitFor(() => expect(within(favorites).queryByText('שישי')).not.toBeInTheDocument())
  })

  it('shows a duplicate favorite name as a field error', async () => {
    const { user } = open('/profile', { ...loggedIn, 'POST /api/account/favorites': () => invalid({ name: ['duplicate'] }) })
    const order = await screen.findByRole('article', { name: 'הזמנה #5' })

    await user.click(within(order).getByRole('button', { name: 'שמירה כמועדף' }))
    await user.type(within(order).getByLabelText('שם למועדף'), 'שישי')
    await user.click(within(order).getByRole('button', { name: 'שמירה' }))

    expect(await within(order).findByText('כבר קיים.')).toBeInTheDocument()
  })

  it('shows the client their own recommendations', async () => {
    open('/profile', loggedIn)

    const section = await screen.findByRole('region', { name: 'ההמלצות שלי' })
    expect(within(section).getByText('קובה סלק')).toBeInTheDocument()
    expect(within(section).getByText('טופל')).toBeInTheDocument()
  })
})

describe('Recommendations', () => {
  it('asks a guest to log in', async () => {
    open('/recommendations', guest)

    expect(await screen.findByRole('link', { name: 'להתחברות או הרשמה' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('ההמלצה שלכם')).not.toBeInTheDocument()
  })

  it('sends a suggestion from a logged-in client', async () => {
    const { api, user } = open('/recommendations', {
      ...loggedIn,
      'POST /api/account/recommendations': () => ({ id: 2, text: 'x', createdAt: '2026-10-04T08:00:00Z', isHandled: false }),
    })
    const text = await screen.findByLabelText('ההמלצה שלכם')
    expect(screen.getByRole('button', { name: 'שליחה' })).toBeDisabled()

    await user.type(text, ' קובה סלק ')
    await user.click(screen.getByRole('button', { name: 'שליחה' }))

    expect(await screen.findByText('תודה! ההמלצה נשלחה.')).toBeInTheDocument()
    expect(api.sent('POST', '/api/account/recommendations')[0].body).toEqual({ text: 'קובה סלק' })
    expect(text).toHaveValue('')
  })
})

describe('Features the site has turned off', () => {
  // The site says no feature is on, and the API has no favorites or recommendations to give.
  const featuresOff = {
    'GET /api/site': () => site({ features: [] }),
    'GET /api/account/me': () => profile,
    'GET /api/account/orders': () => [pastOrder],
  }

  it('drops the recommendations button and sends its page to the order page', async () => {
    open('/recommendations', featuresOff)

    // Until the site info answers, the page follows the build's site.json; then it moves to the order page.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'הזמנה' })).toBeInTheDocument())
    const nav = screen.getByRole('navigation', { name: 'תפריט ראשי' })
    expect(within(nav).queryByRole('link', { name: 'המלצות' })).not.toBeInTheDocument()
  })

  it('leaves favorites and recommendations off the profile, without asking the API for them', async () => {
    const { api } = open('/profile', featuresOff)

    const order = await screen.findByRole('article', { name: 'הזמנה #5' })
    expect(within(order).getByRole('button', { name: 'הזמנה חוזרת' })).toBeInTheDocument()
    expect(within(order).queryByRole('button', { name: 'שמירה כמועדף' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'המועדפים שלי' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ההמלצות שלי' })).not.toBeInTheDocument()
    expect(api.sent('GET', '/api/account/favorites')).toHaveLength(0)
    expect(api.sent('GET', '/api/account/recommendations')).toHaveLength(0)
  })

  it('offers only the last order as a quick fill', async () => {
    const { api } = open('/', featuresOff)

    expect(await screen.findByRole('button', { name: 'ההזמנה האחרונה' })).toBeInTheDocument()
    expect(screen.queryByText('המועדפים שלי')).not.toBeInTheDocument()
    expect(api.sent('GET', '/api/account/favorites')).toHaveLength(0)
  })
})
