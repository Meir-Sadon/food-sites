import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { noDiscount, noStatuses, type PriceList, type PriceListDish } from '../../api/priceLists'
import { site as siteConfig } from '../../site/config'
import { category, dish as catalogDish, site } from '../../test/catalogData'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const withLists = adminSession

const defaultList: PriceList = { id: 1, name: null, isDefault: true, baseListId: null, phones: [], statuses: noStatuses, discount: noDiscount }
const vip: PriceList = { id: 2, name: 'לקוחות קבועים', isDefault: false, baseListId: null, phones: ['0501234567', '0527654321'], statuses: noStatuses, discount: noDiscount }

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
  subPrices: [],
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

  it('is a tab when the server turned the feature on, though the build has it off', async () => {
    siteConfig.features = features
    fakeApi({
      ...adminSession,
      ...categories,
      'GET /api/site': () => site({ features: ['priceLists'] }),
      'GET /api/admin/price-lists': () => [defaultList, vip],
    })
    renderAt('/admin/price-lists')
    expect((await screen.findAllByText('לקוחות קבועים'))[0]).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'מחירונים' })).toBeInTheDocument()
  })

  it('lists the default list first and adds a list on a chosen base', async () => {
    const api = fakeApi({
      ...withLists,
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'POST /api/admin/price-lists': () => ({ id: 3, name: 'משפחה', isDefault: false, baseListId: 2, phones: [], statuses: noStatuses, discount: noDiscount }),
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
    const family: PriceList = { id: 3, name: 'משפחה', isDefault: false, baseListId: 2, phones: [], statuses: noStatuses, discount: noDiscount }
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
        { dishId: 10, basePrice: 80, price: 65, from: null, to: '2026-11-30', subPrices: [] },
        { dishId: 11, basePrice: 50, price: 45, from: null, to: null, subPrices: [] },
      ],
    })
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
  })

  it('shows the list in foldable blocks with a side menu, and saves a category on its own', async () => {
    const api = fakeApi({
      ...withLists,
      'GET /api/admin/categories': () => [
        { id: 5, name: 'עופות', displayOrder: 0, dishCount: 1 },
        { id: 6, name: 'בשרים', displayOrder: 1, dishCount: 1 },
      ],
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'GET /api/admin/price-lists/2/dishes': () => [dish(10, 'עוף בתנור'), dish(12, 'קבב', { categoryId: 6 })],
      'PUT /api/admin/price-lists/2/dishes': (_, body) =>
        [dish(10, 'עוף בתנור'), dish(12, 'קבב', { ...(body as { dishes: PriceListDish[] }).dishes[0], categoryId: 6 })],
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/2')

    const menu = await screen.findByRole('navigation', { name: 'קטגוריות בדף' })
    expect(within(menu).getAllByRole('button').map((b) => b.textContent)).toEqual(['הגדרות כלליות', 'שיוך לקוחות למחירון', 'עופות', 'בשרים'])

    const meat = screen.getByRole('region', { name: 'בשרים' })
    await user.clear(within(meat).getByLabelText('מחיר מחירון (₪)'))
    await user.type(within(meat).getByLabelText('מחיר מחירון (₪)'), '60')
    expect(within(menu).getByRole('button', { name: 'בשרים' })).toHaveTextContent('*')
    await user.click(within(meat).getByRole('button', { name: 'שמירת המחירים' }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/price-lists/2/dishes')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/price-lists/2/dishes')[0].body).toEqual({
      dishes: [{ dishId: 12, basePrice: 70, price: 60, from: null, to: null, subPrices: [] }],
    })
    expect(await within(meat).findByText('נשמר.')).toBeInTheDocument()

    // A block folds away.
    await user.click(within(meat).getByRole('button', { name: 'בשרים' }))
    expect(within(meat).getByLabelText('מחיר מחירון (₪)')).not.toBeVisible()
  })

  it('saves a general discount with its dates and rule, and shows what a client on the list pays', async () => {
    const discounted = { ...vip, discount: { percent: 15, from: null, to: '2026-12-31', rule: 'higher' as const } }
    const api = fakeApi({
      ...withLists,
      ...categories,
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'GET /api/admin/price-lists/2/dishes': () => [dish(10, 'עוף בתנור'), dish(11, 'שניצל', { basePrice: 50, price: 45 })],
      'PUT /api/admin/price-lists/2': () => discounted,
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/2')

    const general = await screen.findByRole('region', { name: 'הגדרות כלליות' })
    expect(screen.queryByText(/לקוח במחירון משלם/)).not.toBeInTheDocument()
    await user.type(within(general).getByLabelText('אחוז הנחה (%)'), '15')
    await user.type(within(general).getByLabelText('עד תאריך'), '2026-12-31')
    await user.selectOptions(within(general).getByLabelText('איזו הנחה גוברת'), 'ההנחה הגבוהה גוברת')
    await user.click(within(general).getByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/price-lists/2')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/price-lists/2')[0].body).toEqual({
      name: 'לקוחות קבועים',
      baseListId: null,
      discount: { percent: 15, from: null, to: '2026-12-31', rule: 'higher' },
    })
    // 15% off 70 is 59.5, rounded up to 60. The schnitzel's own 45 is the smaller discount next to 15% off 50 (42.5, so 43).
    expect(await screen.findByText('לקוח במחירון משלם היום: ₪60')).toBeInTheDocument()
    expect(screen.getByText('לקוח במחירון משלם היום: ₪43')).toBeInTheDocument()
  })

  it('names a refused discount next to its field', async () => {
    fakeApi({
      ...withLists,
      ...categories,
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'GET /api/admin/price-lists/2/dishes': () => [],
      'PUT /api/admin/price-lists/2': () => invalid({ 'discount.percent': ['invalid'] }),
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/2')
    const general = await screen.findByRole('region', { name: 'הגדרות כלליות' })
    await user.type(within(general).getByLabelText('אחוז הנחה (%)'), '20')
    await user.click(within(general).getByRole('button', { name: 'שמירה' }))
    await waitFor(() => expect(within(general).getByLabelText('אחוז הנחה (%)')).toHaveAccessibleDescription('ערך לא תקין.'))
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
    // "לקוחות קבועים" is based on the default list, so the admin is asked about it.
    const question = await screen.findByRole('dialog', { name: 'לעדכן גם מחירונים מקושרים?' })
    expect(within(question).getByText(/המחירים שכאן: לקוחות קבועים\./)).toBeInTheDocument()
    await user.click(within(question).getByRole('button', { name: 'לא, רק כאן' }))
    await waitFor(() =>
      expect(api.sent('PUT', '/api/admin/price-lists/1/dishes')[0].body).toEqual({
        dishes: [{ dishId: 10, basePrice: 75, price: 75, from: null, to: null, subPrices: [] }],
      }),
    )
  })

  it('edits a dish’s other prices behind its sub-prices button, and can update the linked lists', async () => {
    const family: PriceList = { id: 3, name: 'משפחה', isDefault: false, baseListId: 2, phones: [], statuses: noStatuses, discount: noDiscount }
    const withSubs = dish(10, 'קוסקוס', {
      basePrice: 50,
      price: 50,
      subPrices: [
        { key: 'o:7', kind: 'option', name: 'גדול', regularPrice: 80, basePrice: 80, price: 80, inList: true },
        { key: 'a:12:0', kind: 'addOn', name: 'ירך', regularPrice: 8, basePrice: 8, price: 8, inList: true },
      ],
    })
    const api = fakeApi({
      ...withLists,
      ...categories,
      'GET /api/admin/price-lists': () => [defaultList, vip, family],
      'GET /api/admin/price-lists/2/dishes': () => [withSubs],
      'PUT /api/admin/price-lists/2/dishes.*': () => [withSubs],
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/2')

    const toggle = await screen.findByRole('button', { name: 'תתי מחירים (2)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    const big = screen.getByLabelText('מחיר מחירון (₪) · אפשרות: גדול')
    await user.clear(big)
    await user.type(big, '70')
    expect(screen.getByLabelText('מחיר מחירון (₪) · תוספת: ירך')).toHaveValue(8)
    await user.click(screen.getByRole('button', { name: 'שמירת המחירים' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'כן, לעדכן גם בהם' }))

    await waitFor(() => expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(1))
    const put = api.calls.find((c) => c.method === 'PUT')!
    expect(put.path).toBe('/api/admin/price-lists/2/dishes?updateLinked=true')
    expect(put.body).toEqual({
      dishes: [{
        dishId: 10, basePrice: 50, price: 50, from: null, to: null,
        subPrices: [{ key: 'o:7', basePrice: 80, price: 70 }, { key: 'a:12:0', basePrice: 8, price: 8 }],
      }],
    })
  })

  it('does not ask about linked lists when only the dates changed', async () => {
    const family: PriceList = { id: 3, name: 'משפחה', isDefault: false, baseListId: 2, phones: [], statuses: noStatuses, discount: noDiscount }
    const api = fakeApi({
      ...withLists,
      ...categories,
      'GET /api/admin/price-lists': () => [defaultList, vip, family],
      'GET /api/admin/price-lists/2/dishes': () => [dish(10, 'עוף בתנור')],
      'PUT /api/admin/price-lists/2/dishes.*': () => [dish(10, 'עוף בתנור', { to: '2026-11-30' })],
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/2')
    await user.type(await screen.findByLabelText('עד תאריך', { selector: '#pl-10-to' }), '2026-11-30')
    await user.click(screen.getByRole('button', { name: 'שמירת המחירים' }))
    await waitFor(() => expect(api.sent('PUT', '/api/admin/price-lists/2/dishes')).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

  it('saves the statuses the list is for, and shows a refused amount', async () => {
    let reply: unknown = invalid({ newClientsAmount: ['invalid'] })
    const api = fakeApi({
      ...withLists,
      ...categories,
      'GET /api/admin/price-lists': () => [defaultList, vip],
      'GET /api/admin/price-lists/2/dishes': () => [],
      'PUT /api/admin/price-lists/2/statuses': () => reply,
    })
    const user = userEvent.setup()
    renderAt('/admin/price-lists/2')

    await user.click(await screen.findByLabelText('לקוחות חדשים: נרשמו לאתר לאחרונה'))
    const amount = screen.getByLabelText('נרשמו בתוך')
    await user.clear(amount)
    await user.type(amount, '400')
    await user.selectOptions(screen.getByLabelText('יחידת זמן'), 'day')
    await user.click(screen.getByLabelText('לקוחות באמצע הזמנה: יש להם מנות בעגלה'))
    await user.click(screen.getByLabelText('לקוחות עם הזמנה פתוחה (שעוד לא סופקה ולא בוטלה) מעל סכום'))
    await user.type(screen.getByLabelText('סכום ההזמנה מעל (₪)'), '150')
    await user.click(screen.getByRole('button', { name: 'שמירת המצבים' }))

    expect(api.sent('PUT', '/api/admin/price-lists/2/statuses')[0].body).toEqual({
      newClientsAmount: 400, newClientsUnit: 'day', noOrders: false, midOrder: true, openOrderAbove: 150,
    })
    expect(await screen.findByText('ערך לא תקין.', { selector: '.field-error' })).toBeInTheDocument()

    const statuses = { newClientsAmount: 30, newClientsUnit: 'day' as const, noOrders: false, midOrder: true, openOrderAbove: 150 }
    reply = { ...vip, statuses }
    await user.clear(amount)
    await user.type(amount, '30')
    await user.click(screen.getByRole('button', { name: 'שמירת המצבים' }))
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/price-lists/2/statuses')[1].body).toEqual(statuses)
  })

  it('shows on the lists page which lists are by status', async () => {
    fakeApi({
      ...withLists,
      'GET /api/admin/price-lists': () => [defaultList, { ...vip, statuses: { ...noStatuses, noOrders: true } }],
    })
    renderAt('/admin/price-lists')
    expect(await screen.findByText('טלפונים', { exact: false })).toHaveTextContent('לפי מצב')
  })

  describe('the dish’s window', () => {
    const chicken = catalogDish(10, 'עוף בתנור', 5, {
      options: [{ id: 11, label: 'שלם', amount: 1, price: 70, isDefault: true }],
    })
    const dishRoutes = {
      ...withLists,
      'GET /api/admin/categories': () => [category(5, 'עופות', 1)],
      'GET /api/admin/dishes': () => [chicken],
    }

    it('is not in the dish form when the site has no price lists', async () => {
      siteConfig.features = features
      fakeApi(dishRoutes)
      renderAt('/admin/dishes/10')
      await screen.findByRole('heading', { name: /עריכת מנה/ })
      expect(screen.queryByRole('button', { name: 'מחירונים' })).not.toBeInTheDocument()
    })

    it('shows a row per list, the regular prices read only, and saves the lists that changed', async () => {
      const family: PriceList = { id: 3, name: 'משפחה', isDefault: false, baseListId: 2, phones: [], statuses: noStatuses, discount: noDiscount }
      const api = fakeApi({
        ...dishRoutes,
        'GET /api/admin/price-lists/dishes/10': () => [
          { list: defaultList, dish: dish(10, 'עוף בתנור') },
          { list: vip, dish: dish(10, 'עוף בתנור', { price: 60 }) },
          { list: family, dish: dish(10, 'עוף בתנור', { basePrice: 60, price: 60 }) },
        ],
        'PUT /api/admin/price-lists/2/dishes.*': () => [dish(10, 'עוף בתנור', { price: 55 })],
      })
      const user = userEvent.setup()
      renderAt('/admin/dishes/10')

      await user.click(await screen.findByRole('button', { name: 'מחירונים' }))
      const window = await screen.findByRole('dialog', { name: 'מחירונים: עוף בתנור' })
      expect(within(window).getByText('מחיר רגיל: ₪70')).toBeInTheDocument()
      expect(within(window).getAllByLabelText('מחיר מחירון (₪)')).toHaveLength(2)

      const vipPrice = within(window).getByLabelText('מחיר מחירון (₪)', { selector: '#dpl-2-price' })
      await user.clear(vipPrice)
      await user.type(vipPrice, '55')
      await user.click(within(window).getByRole('button', { name: 'שמירת המחירונים' }))
      // "משפחה" is based on "לקוחות קבועים".
      const question = await screen.findByRole('dialog', { name: 'לעדכן גם מחירונים מקושרים?' })
      expect(within(question).getByText(/המחירים שכאן: משפחה\./)).toBeInTheDocument()
      await user.click(within(question).getByRole('button', { name: 'כן, לעדכן גם בהם' }))

      await waitFor(() => expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(1))
      const put = api.calls.find((c) => c.method === 'PUT')!
      expect(put.path).toBe('/api/admin/price-lists/2/dishes?updateLinked=true')
      expect(put.body).toEqual({ dishes: [{ dishId: 10, basePrice: 70, price: 55, from: null, to: null, subPrices: [] }] })
      expect(await within(window).findByText('נשמר.')).toBeInTheDocument()
    })
  })
})
