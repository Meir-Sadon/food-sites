import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PriceList, PriceListDish } from '../../api/priceLists'
import { site as siteConfig } from '../../site/config'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const withLists = adminSession

const defaultList: PriceList = { id: 1, name: null, isDefault: true, baseListId: null, phones: [] }
const vip: PriceList = { id: 2, name: 'לקוחות קבועים', isDefault: false, baseListId: null, phones: ['0501234567', '0527654321'] }

const dish = (dishId: number, name: string, patch: Partial<PriceListDish> = {}): PriceListDish => ({
  dishId,
  name,
  categoryId: 5,
  imageUrl: null,
  regularPrice: 70,
  basePrice: 70,
  price: 70,
  from: null,
  to: null,
  inList: true,
  ...patch,
})

const categories = { 'GET /api/admin/categories': () => [{ id: 5, name: 'עופות', displayOrder: 0, dishCount: 2 }] }

// The admin's tabs follow the site's site.json, where the template site leaves price lists off.
const features = siteConfig.features
beforeEach(() => {
  siteConfig.features = { ...features, priceLists: true }
})
afterEach(() => {
  siteConfig.features = features
})

describe('price lists', () => {
  it('is a tab only when the site has the feature', async () => {
    siteConfig.features = features
    fakeApi({ ...adminSession, 'GET /api/admin/dishes': () => [], ...categories })
    renderAt('/admin/price-lists')
    // The page itself sends the admin back to the dishes.
    expect(await screen.findByRole('heading', { level: 1, name: /מנות/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'מחירונים' })).not.toBeInTheDocument()
  })

  it('lists the default list first and adds a list on a chosen base', async () => {
    const api = fakeApi({
      ...withLists,
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'POST /api/admin/price-lists': () => ({ id: 3, name: 'משפחה', isDefault: false, baseListId: 2, phones: [] }),
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists')

    const first = (await screen.findByRole('link', { name: 'מחירון ברירת מחדל' })).closest('li')!
    expect(first.nextElementSibling).toBe(screen.getByRole('link', { name: 'לקוחות קבועים' }).closest('li'))
    expect(within(first).queryByRole('button', { name: /הסרה/ })).not.toBeInTheDocument()
    expect(screen.getByText('מבוסס על: מחירון ברירת מחדל · 2 טלפונים')).toBeInTheDocument()

    await user.type(screen.getByLabelText('שם המחירון'), 'משפחה')
    await user.selectOptions(screen.getByLabelText('מחירון בסיס'), 'לקוחות קבועים')
    await user.click(screen.getByRole('button', { name: 'הוספה' }))

    await waitFor(() => expect(api.sent('POST', '/api/admin/price-lists')[0].body).toEqual({ name: 'משפחה', baseListId: 2 }))
    expect(await screen.findByText('משפחה')).toBeInTheDocument()
    expect(screen.getByLabelText('שם המחירון')).toHaveValue('')
  })

  it('offers only lists without a base as a base', async () => {
    const family: PriceList = { id: 3, name: 'משפחה', isDefault: false, baseListId: 2, phones: [] }
    fakeApi({ ...withLists, 'GET /api/admin/price-lists': () => [defaultList, vip, family] })
    renderAt('/admin/price-lists')
    const base = await screen.findByLabelText('מחירון בסיס')
    expect(within(base).getAllByRole('option').map((o) => o.textContent)).toEqual(['מחירון ברירת מחדל', 'לקוחות קבועים'])
  })

  it('saves a list’s prices and dates, and a base price change moves a price that followed it', async () => {
    const api = fakeApi({
      ...withLists,
      ...categories,
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'GET /api/admin/price-lists/2/dishes': () => [dish(10, 'עוף בתנור'), dish(11, 'שניצל', { basePrice: 50, price: 45 })],
      'PUT /api/admin/price-lists/2/dishes': (_, body) =>
        (body as { dishes: PriceListDish[] }).dishes.map((d) => dish(d.dishId, d.dishId === 10 ? 'עוף בתנור' : 'שניצל', d)),
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/2')

    expect(await screen.findByRole('heading', { level: 1, name: 'לקוחות קבועים' })).toBeInTheDocument()
    const schnitzel = screen.getByText('שניצל').closest('li')!
    expect(within(schnitzel).getByText('הנחה')).toBeInTheDocument()

    const base = screen.getByLabelText('מחיר בסיס (₪)', { selector: '#pl-10-base' })
    await user.clear(base)
    await user.type(base, '80')
    expect(screen.getByLabelText('מחיר מחירון (₪)', { selector: '#pl-10-price' })).toHaveValue(80)
    await user.clear(screen.getByLabelText('מחיר מחירון (₪)', { selector: '#pl-10-price' }))
    await user.type(screen.getByLabelText('מחיר מחירון (₪)', { selector: '#pl-10-price' }), '65')
    await user.type(screen.getByLabelText('עד תאריך', { selector: '#pl-10-to' }), '2026-11-30')
    await user.click(screen.getByRole('button', { name: 'שמירת המחירים' }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/price-lists/2/dishes')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/price-lists/2/dishes')[0].body).toEqual({
      dishes: [
        { dishId: 10, basePrice: 80, price: 65, from: null, to: '2026-11-30' },
        { dishId: 11, basePrice: 50, price: 45, from: null, to: null },
      ],
    })
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
  })

  it('shows a date error next to the dish', async () => {
    fakeApi({
      ...withLists,
      ...categories,
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'GET /api/admin/price-lists/2/dishes': () => [dish(10, 'עוף בתנור')],
      'PUT /api/admin/price-lists/2/dishes': () => invalid({ 'dishes[0].to': ['toBeforeFrom'] }),
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/2')
    await user.click(await screen.findByRole('button', { name: 'שמירת המחירים' }))
    expect(await screen.findByText('תאריך הסיום לפני תאריך ההתחלה.')).toBeInTheDocument()
  })

  it('edits only the regular price in the default list', async () => {
    const api = fakeApi({
      ...withLists,
      ...categories,
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'GET /api/admin/price-lists/1/dishes': () => [dish(10, 'עוף בתנור')],
      'PUT /api/admin/price-lists/1/dishes': () => [dish(10, 'עוף בתנור', { regularPrice: 75, basePrice: 75, price: 75 })],
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/1')

    expect(await screen.findByRole('heading', { level: 1, name: 'מחירון ברירת מחדל' })).toBeInTheDocument()
    expect(screen.queryByLabelText('מחיר בסיס (₪)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('טלפונים, אחד בכל שורה')).not.toBeInTheDocument()
    const price = screen.getByLabelText('מחיר (₪)')
    await user.clear(price)
    await user.type(price, '75')
    await user.click(screen.getByRole('button', { name: 'שמירת המחירים' }))
    await waitFor(() =>
      expect(api.sent('PUT', '/api/admin/price-lists/1/dishes')[0].body).toEqual({
        dishes: [{ dishId: 10, basePrice: 75, price: 75, from: null, to: null }],
      }),
    )
  })

  it('saves the phones and names a bad one', async () => {
    let reply: unknown = invalid({ 'phones[1]': ['phone'] })
    const api = fakeApi({
      ...withLists,
      ...categories,
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'GET /api/admin/price-lists/2/dishes': () => [],
      'PUT /api/admin/price-lists/2/phones': () => reply,
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/2')

    const phones = await screen.findByLabelText('טלפונים, אחד בכל שורה')
    expect(phones).toHaveValue('0501234567\n0527654321')
    await user.clear(phones)
    await user.type(phones, '+972501234567{Enter}12')
    await user.click(screen.getByRole('button', { name: 'שמירת הטלפונים' }))
    expect(await screen.findByText('מספר הטלפון 12 לא תקין.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/price-lists/2/phones')[0].body).toEqual({ phones: ['+972501234567', '12'] })

    reply = { ...vip, phones: ['0501234567'] }
    await user.clear(phones)
    await user.type(phones, '+972501234567')
    await user.click(screen.getByRole('button', { name: 'שמירת הטלפונים' }))
    await waitFor(() => expect(phones).toHaveValue('0501234567'))
  })
})
