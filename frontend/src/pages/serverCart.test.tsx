import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../api/account'
import type { Confirmation } from '../api/site'
import { DRAFT_KEY } from '../order/draft'
import { menu, menuDish, publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const profile: Profile = {
  id: 1, phone: '0501234567', fullName: 'דנה כהן', city: 'אשקלון', street: 'הרצל', houseNumber: '1',
  apartment: '', address: 'הרצל 1, אשקלון', email: null, birthday: null, ethnicBackground: null, addresses: [],
}

const confirmation: Confirmation = {
  id: 7, supplyDate: '2026-10-09', fulfillmentMethod: 'Delivery', paymentMethod: 'OnDelivery', total: 40, paymentPhone: null,
  needsReview: false, items: [{ dishName: 'חומוס פשוט', optionLabel: 'מנה', quantity: 1, unitPrice: 40, lineTotal: 40, isAddOn: false }],
}

const hummus = { 4: { optionId: 40, quantity: 2, addOns: {} } }

type Routes = Parameters<typeof fakeApi>[0]
const loggedIn = { 'GET /api/account/me': () => profile, 'GET /api/account/orders': () => [] }
const guest = { 'GET /api/account/me': () => ({ status: 401, body: {} }) }

beforeEach(() => localStorage.clear())

describe('The cart kept on the server', () => {
  const open = (routes: Record<string, unknown>, features: string[] = []) => {
    Element.prototype.scrollIntoView = vi.fn()
    const api = fakeApi({
      ...publicApi,
      'GET /api/site': () => site({ serviceCities: ['אשקלון'], features: features as never }),
      'GET /api/menu': () => menu({ dishes: [...menu().dishes, menuDish(4, 'חומוס פשוט', 1)] }),
      'POST /api/orders': () => confirmation,
      'PUT /api/account/cart': () => undefined,
      'DELETE /api/account/cart': () => undefined,
      ...routes,
    } as Routes)
    renderAt('/')
    return { api, user: userEvent.setup() }
  }
  const add = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(await screen.findByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' }))

  it('saves a logged-in client’s cart once the clicks stop, and removes it when emptied', async () => {
    const { api, user } = open({ ...loggedIn, 'GET /api/account/cart': () => undefined })
    await add(user)

    await waitFor(() => expect(api.sent('PUT', '/api/account/cart')).toHaveLength(1), { timeout: 3000 })
    const body = api.sent('PUT', '/api/account/cart')[0].body as { content: string; itemCount: number }
    expect(body.itemCount).toBe(1)
    expect(JSON.parse(body.content)).toMatchObject({ 4: { optionId: 40, quantity: 1 } })

    await user.click(screen.getAllByRole('button', { name: 'הסרה מההזמנה: חומוס פשוט' })[0])
    await waitFor(() => expect(api.sent('PUT', '/api/account/cart')).toHaveLength(2), { timeout: 3000 })
    expect(api.sent('PUT', '/api/account/cart')[1].body).toMatchObject({ itemCount: 0 })
  })

  it('brings back the cart saved from another device when this browser has none', async () => {
    open({ ...loggedIn, 'GET /api/account/cart': () => ({ content: JSON.stringify(hummus), itemCount: 2, updatedAt: '2026-10-08T10:00:00Z' }) })

    expect(await screen.findByText('שחזרנו הזמנה שהתחלתם ושמרתם.')).toBeInTheDocument()
    expect(screen.getAllByText('סה"כ: ₪80').length).toBeGreaterThan(0)
  })

  it('keeps the cart in this browser over the saved one', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ selections: { 4: { optionId: 40, quantity: 1, addOns: {} } } }))
    open({ ...loggedIn, 'GET /api/account/cart': () => ({ content: JSON.stringify(hummus), itemCount: 2, updatedAt: '2026-10-08T10:00:00Z' }) })

    expect(await screen.findByText('שחזרנו הזמנה שהתחלתם ושמרתם.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('סה"כ: ₪40').length).toBeGreaterThan(0))
  })

  it('never asks about the cart for a guest', async () => {
    const { api, user } = open(guest)
    await add(user)
    await new Promise((resolve) => setTimeout(resolve, 1300))

    expect(api.calls.filter((c) => c.path.includes('/api/account/cart'))).toHaveLength(0)
  })

  it('does not save the cart again once the order is sent', async () => {
    const { api, user } = open({ ...loggedIn, 'GET /api/account/cart': () => undefined })
    await add(user)
    await waitFor(() => expect(api.sent('PUT', '/api/account/cart')).toHaveLength(1), { timeout: 3000 })

    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    const dialog = await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
    await user.click(within(dialog).getAllByRole('button').at(-1)!)
    await new Promise((resolve) => setTimeout(resolve, 1300))

    expect(api.sent('POST', '/api/orders')).toHaveLength(1)
    expect(api.sent('PUT', '/api/account/cart')).toHaveLength(1)
  })

  it('removes the saved cart when the client leaves without keeping the order', async () => {
    const { api, user } = open({ ...loggedIn, 'GET /api/account/cart': () => undefined })
    await add(user)

    await user.click(screen.getByRole('link', { name: 'פרופיל' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'יציאה בלי לשמור' }))

    await waitFor(() => expect(api.sent('DELETE', '/api/account/cart')).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(api.sent('PUT', '/api/account/cart')).toHaveLength(0)
  })

  it('does not load the menu again with price lists off', async () => {
    const off = open({ ...loggedIn, 'GET /api/account/cart': () => undefined })
    await add(off.user)
    await waitFor(() => expect(off.api.sent('PUT', '/api/account/cart')).toHaveLength(1), { timeout: 3000 })
    expect(off.api.sent('GET', '/api/menu')).toHaveLength(1)
  })

  it('loads the menu again after the first dish with price lists on, for the prices of a client in the middle of an order', async () => {
    const { api, user } = open({ ...loggedIn, 'GET /api/account/cart': () => undefined }, ['priceLists'])
    await add(user)

    await waitFor(() => expect(api.sent('GET', '/api/menu')).toHaveLength(2), { timeout: 3000 })
  })
})
