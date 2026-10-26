import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile, SavedAddress } from '../api/account'
import type { Confirmation } from '../api/site'
import { menu, menuDish, publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const home: SavedAddress = { id: 1, label: 'בית', city: 'אשקלון', street: 'הרצל', houseNumber: '1', apartment: '', address: 'הרצל 1, אשקלון', isDefault: true }
const work: SavedAddress = { id: 2, label: 'עבודה', city: 'אשקלון', street: 'ויצמן', houseNumber: '9', apartment: '3', address: 'ויצמן 9, דירה 3, אשקלון', isDefault: false }

const profile: Profile = {
  id: 1, phone: '0501234567', fullName: 'דנה כהן', city: home.city, street: home.street, houseNumber: home.houseNumber,
  apartment: '', address: home.address, email: null, birthday: null, ethnicBackground: null, addresses: [home, work],
}

const confirmation: Confirmation = {
  id: 7, supplyDate: '2026-10-09', fulfillmentMethod: 'Delivery', paymentMethod: 'OnDelivery', total: 40, paymentPhone: null,
  needsReview: false, items: [{ dishName: 'חומוס פשוט', optionLabel: 'מנה', quantity: 1, unitPrice: 40, lineTotal: 40, isAddOn: false }],
}

const menuWithPlainDish = () => menu({ dishes: [...menu().dishes, menuDish(4, 'חומוס פשוט', 1)] })

type Routes = Parameters<typeof fakeApi>[0]
const guest = { 'GET /api/account/me': () => ({ status: 401, body: {} }) }
const loggedIn = (me: Profile) => ({ 'GET /api/account/me': () => me, 'GET /api/account/orders': () => [] })

beforeEach(() => localStorage.clear())

describe('Saved addresses on the profile page', () => {
  const open = (extra: Record<string, unknown> = {}) => {
    const api = fakeApi({ ...publicApi, ...loggedIn(profile), ...extra } as Routes)
    renderAt('/profile')
    return { api, user: userEvent.setup() }
  }

  it('lists the addresses with the default marked', async () => {
    open()
    const section = await screen.findByRole('region', { name: 'הכתובות שלי' })

    expect(within(section).getByText('הרצל 1, אשקלון')).toBeInTheDocument()
    expect(within(section).getByText('ויצמן 9, דירה 3, אשקלון')).toBeInTheDocument()
    expect(section.querySelectorAll('.badge')).toHaveLength(1)
  })

  it('makes another address the default', async () => {
    const { api, user } = open({
      'PUT /api/account/addresses/2/default': () => ({ ...profile, addresses: [{ ...work, isDefault: true }, { ...home, isDefault: false }] }),
    })
    const section = await screen.findByRole('region', { name: 'הכתובות שלי' })

    await user.click(within(section).getByRole('button', { name: 'ברירת מחדל' }))

    expect(api.sent('PUT', '/api/account/addresses/2/default')).toHaveLength(1)
    expect(await within(section).findAllByRole('listitem').then((items) => items[0])).toHaveTextContent('ויצמן 9')
  })

  it('adds an address with a name', async () => {
    const { api, user } = open({ 'POST /api/account/addresses': () => profile })
    const section = await screen.findByRole('region', { name: 'הכתובות שלי' })

    await user.click(within(section).getByRole('button', { name: 'הוספת כתובת' }))
    await user.type(screen.getByLabelText('שם לכתובת (לא חובה)'), 'הורים')
    await user.type(screen.getByLabelText('רחוב'), 'הנשיא')
    await user.type(screen.getByLabelText('מספר בית'), '4')
    await user.click(within(screen.getByRole('form', { name: 'הוספת כתובת' })).getByRole('button', { name: 'שמירה' }))

    expect(api.sent('POST', '/api/account/addresses')[0].body).toMatchObject({ label: 'הורים', street: 'הנשיא', houseNumber: '4', makeDefault: false })
  })

  it('asks before deleting an address', async () => {
    const { api, user } = open({ 'DELETE /api/account/addresses/2': () => ({ ...profile, addresses: [home] }) })
    const section = await screen.findByRole('region', { name: 'הכתובות שלי' })

    await user.click(within(section).getAllByRole('button', { name: 'מחיקה' })[1])
    expect(api.sent('DELETE', '/api/account/addresses/2')).toHaveLength(0)
    await user.click(within(section).getByRole('button', { name: 'כן, למחוק' }))

    expect(api.sent('DELETE', '/api/account/addresses/2')).toHaveLength(1)
    expect(within(section).queryByText('ויצמן 9, דירה 3, אשקלון')).not.toBeInTheDocument()
  })
})

describe('The order page', () => {
  const open = async (routes: Record<string, unknown>) => {
    Element.prototype.scrollIntoView = vi.fn()
    const api = fakeApi({
      ...publicApi,
      'GET /api/site': () => site({ serviceCities: ['אשקלון'] }),
      'GET /api/menu': menuWithPlainDish,
      'POST /api/orders': () => confirmation,
      ...routes,
    } as Routes)
    renderAt('/')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' }))
    return { api, user }
  }

  it('offers the saved addresses, the default first, and fills the fields when another is picked', async () => {
    const { user } = await open(loggedIn(profile))
    await user.click(await screen.findByText('פרטי קשר וכתובת', { exact: false }))
    const list = await screen.findByLabelText('כתובת למשלוח')

    expect(list).toHaveValue('1')
    const options = within(list).getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toContain('בית: הרצל 1, אשקלון')
    expect(options.at(-1)).toBe('כתובת אחרת')

    await user.selectOptions(list, '2')
    expect(screen.getByLabelText('רחוב')).toHaveValue('ויצמן')
    expect(screen.getByLabelText('מספר בית')).toHaveValue('9')

    await user.selectOptions(list, 'other')
    expect(screen.getByLabelText('רחוב')).toHaveValue('')
  })

  it('does not offer the list to a client with no saved address', async () => {
    await open(loggedIn({ ...profile, city: '', street: '', houseNumber: '', address: '', addresses: [] }))
    await screen.findByLabelText('שם מלא')
    expect(screen.queryByLabelText('כתובת למשלוח')).not.toBeInTheDocument()
  })

  async function send(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    return screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
  }

  it('asks a guest whether to keep the details, and keeps them by phone', async () => {
    const { api, user } = await open({
      ...guest,
      'POST /api/account/remember': () => ({ saved: true, profile: null }),
    })
    await user.type(await screen.findByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    const dialog = await send(user)

    await user.click(within(dialog).getByRole('button', { name: 'כן, לשמור' }))

    expect(api.sent('POST', '/api/account/remember')[0].body).toEqual({
      orderId: 7, phone: '0501234567', name: 'דנה', city: 'אשקלון', street: 'הרצל', houseNumber: '1', apartment: '',
    })
    expect(await within(dialog).findByText(/בפעם הבאה שתתחברו עם המספר הזה/)).toBeInTheDocument()
  })

  it('does not keep anything when the client says no', async () => {
    const { api, user } = await open(guest)
    await user.type(await screen.findByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    const dialog = await send(user)

    await user.click(within(dialog).getByRole('button', { name: 'לא תודה' }))

    expect(within(dialog).queryByText('לשמור את הפרטים להזמנות הבאות?')).not.toBeInTheDocument()
    expect(api.sent('POST', '/api/account/remember')).toHaveLength(0)
  })

  it('puts the details on the account of a logged-in client when a new address was used', async () => {
    const saved: Profile = { ...profile, addresses: [home, work, { ...work, id: 3, street: 'החדשה', isDefault: false }] }
    const { api, user } = await open({
      ...loggedIn(profile),
      'POST /api/account/remember': () => ({ saved: true, profile: saved }),
    })
    const list = await screen.findByLabelText('כתובת למשלוח')
    await user.selectOptions(list, 'other')
    await user.type(screen.getByLabelText('רחוב'), 'החדשה')
    await user.type(screen.getByLabelText('מספר בית'), '5')
    const dialog = await send(user)

    await user.click(within(dialog).getByRole('button', { name: 'כן, לשמור' }))

    expect(api.sent('POST', '/api/account/remember')[0].body).toMatchObject({ orderId: 7, street: 'החדשה', houseNumber: '5' })
    expect(await within(dialog).findByText('הפרטים נשמרו בחשבון שלכם.')).toBeInTheDocument()
  })

  it('does not ask a logged-in client who ordered to a saved address', async () => {
    const { user } = await open(loggedIn(profile))
    await screen.findByLabelText('כתובת למשלוח')
    const dialog = await send(user)

    expect(within(dialog).queryByText('לשמור את הפרטים להזמנות הבאות?')).not.toBeInTheDocument()
  })
})
