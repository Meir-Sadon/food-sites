import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Dish, DishInput } from '../../api/catalog'
import { category, dish } from '../../test/catalogData'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const categories = [category(1, 'עופות', 2), category(2, 'סלטים', 1)]
const chicken = dish(1, 'עוף בתנור', 1, {
  options: [
    { id: 11, label: 'חצי עוף', amount: 0.5, price: 45, isDefault: true },
    { id: 12, label: 'עוף שלם', amount: 1, price: 80, isDefault: false },
  ],
  addOnDishIds: [3],
})
const eggplant = dish(2, 'חציל', 2, { sellBy: 'Weight', choiceMode: 'Free', options: [], minAmount: 0.5, maxAmount: 3, amountStep: 0.25, unitPrice: 90 })
const leg = dish(3, 'שוק', 1, { isAddOnOnly: true, parentDishIds: [1], options: [{ id: 31, label: 'יחידה', amount: 1, price: 10, isDefault: true }] })
const removed = dish(4, 'עוגה', 2, { isHidden: true })
const all = [chicken, eggplant, leg, removed]

const base = {
  ...adminSession,
  'GET /api/admin/categories': () => categories,
  'GET /api/admin/dishes': () => all,
}

describe('Dishes list', () => {
  it('groups dishes by category with price and badges', async () => {
    fakeApi(base)
    renderAt('/admin/dishes')

    const poultry = await screen.findByRole('region', { name: 'עופות' })
    const rows = within(poultry).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('עוף בתנור')
    expect(rows[0]).toHaveTextContent('₪45 · חצי עוף')
    expect(rows[1]).toHaveTextContent('תוספת בלבד')
    expect(within(screen.getByRole('region', { name: 'סלטים' })).getByText('₪90 לק"ג')).toBeInTheDocument()
  })

  it('marks a dish sold out', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/1/sold-out': () => undefined })
    renderAt('/admin/dishes')
    const row = (await screen.findByText('עוף בתנור')).closest('li')!

    await userEvent.setup().click(within(row).getByLabelText('אזל'))

    await waitFor(() => expect(within(row).getByLabelText('אזל')).toBeChecked())
    expect(api.sent('PUT', '/sold-out')[0].body).toEqual({ isSoldOut: true })
  })

  it('undoes the sold-out mark when saving fails', async () => {
    fakeApi({ ...base, 'PUT /api/admin/dishes/1/sold-out': () => ({ status: 500 }) })
    renderAt('/admin/dishes')
    const row = (await screen.findByText('עוף בתנור')).closest('li')!

    await userEvent.setup().click(within(row).getByLabelText('אזל'))

    expect(await screen.findByRole('alert')).toHaveTextContent('משהו השתבש')
    expect(within(row).getByLabelText('אזל')).not.toBeChecked()
  })

  it('removes a dish to the removed list and restores it', async () => {
    fakeApi({
      ...base,
      'DELETE /api/admin/dishes/2': () => undefined,
      'POST /api/admin/dishes/4/restore': () => ({ ...removed, isHidden: false }),
    })
    renderAt('/admin/dishes')
    const user = userEvent.setup()
    const row = (await screen.findByText('חציל')).closest('li')!

    await user.click(within(row).getByRole('button', { name: 'הסרה' }))
    await user.click(within(row).getByRole('button', { name: 'כן, להסיר' }))
    expect(await screen.findByText('מנות שהוסרו (2)')).toBeInTheDocument()

    await user.click(screen.getByText('מנות שהוסרו (2)'))
    await user.click(screen.getByRole('button', { name: 'החזרה לתפריט: עוגה' }))
    expect(await screen.findByText('מנות שהוסרו (1)')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'סלטים' })).getByText('עוגה')).toBeInTheDocument()
  })

  it('warns with the number of unsupplied orders before removing a dish', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/admin/dishes/2/affected-orders': () => ({ count: 3 }),
      'DELETE /api/admin/dishes/2': () => undefined,
    })
    renderAt('/admin/dishes')
    const user = userEvent.setup()
    const row = (await screen.findByText('חציל')).closest('li')!

    await user.click(within(row).getByRole('button', { name: 'הסרה' }))

    expect(await within(row).findByText(/יש הזמנות שעדיין לא סופקו \(3\)/)).toBeInTheDocument()
    expect(api.sent('DELETE', '/api/admin/dishes/2')).toHaveLength(0)
    await user.click(within(row).getByRole('button', { name: 'כן, להסיר' }))
    await waitFor(() => expect(api.sent('DELETE', '/api/admin/dishes/2')).toHaveLength(1))
  })
})

describe('Dish form', () => {
  it('creates a dish with two options and add-on links', async () => {
    let created: Dish | null = null
    const api = fakeApi({
      ...base,
      'GET /api/admin/dishes': () => (created ? [...all, created] : all),
      'POST /api/admin/dishes': (_, body) => {
        created = { ...dish(9, 'x', 1), ...(body as DishInput), id: 9, options: [], images: [], addOnDishIds: [] }
        return { status: 201, body: created }
      },
    })
    renderAt('/admin/dishes/new')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('שם המנה'), 'רוטב')
    await user.selectOptions(screen.getByLabelText('קטגוריה'), 'סלטים')
    await user.type(screen.getByLabelText('תיאור קצר'), 'רוטב עגבניות')
    expect(screen.getByText('נותרו 242 תווים')).toBeInTheDocument()

    const first = screen.getByRole('group', { name: 'אפשרות 1' })
    await user.type(within(first).getByLabelText('תיאור האפשרות'), 'קטן')
    await user.type(within(first).getByLabelText('מחיר (₪)'), '5')
    await user.click(screen.getByRole('button', { name: 'הוספת אפשרות' }))
    const second = screen.getByRole('group', { name: 'אפשרות 2' })
    await user.type(within(second).getByLabelText('תיאור האפשרות'), 'גדול')
    await user.clear(within(second).getByLabelText('כמות (יחידות)'))
    await user.type(within(second).getByLabelText('כמות (יחידות)'), '2')
    await user.type(within(second).getByLabelText('מחיר (₪)'), '9')
    await user.click(within(second).getByLabelText('ברירת מחדל'))

    // Add-on-only dishes and removed dishes can't be parents.
    const parents = screen.getByRole('group', { name: 'תוספת למנות' })
    expect(within(parents).queryByLabelText('שוק')).not.toBeInTheDocument()
    expect(within(parents).queryByLabelText('עוגה')).not.toBeInTheDocument()
    await user.click(within(parents).getByLabelText('עוף בתנור'))
    await user.click(screen.getByLabelText('תוספת בלבד (לא מוצגת כמנה עצמאית)'))

    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    expect(await screen.findByText('המנה נוצרה. אפשר להוסיף תמונות.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'עריכת מנה: רוטב' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'תמונות' })).toBeInTheDocument()
    const body = api.sent('POST', '/api/admin/dishes')[0].body as DishInput
    expect(body).toEqual({
      name: 'רוטב',
      categoryId: 2,
      description: 'רוטב עגבניות',
      allergenInfo: null,
      sellBy: 'Units',
      choiceMode: 'Fixed',
      minAmount: null,
      maxAmount: null,
      amountStep: null,
      unitPrice: null,
      isAddOnOnly: true,
      isSoldOut: false,
      maxPerSupplyDate: null,
      options: [
        { id: null, label: 'קטן', amount: 1, price: 5, isDefault: false },
        { id: null, label: 'גדול', amount: 2, price: 9, isDefault: true },
      ],
      parentDishIds: [1],
    })
  })

  it('saves a per-supply-date limit on a dish', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/1': (_, body) => ({ ...chicken, ...(body as object) }) })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()

    await screen.findByRole('heading', { name: /עריכת מנה/ })
    await user.type(screen.getByLabelText('הגבלת כמות ליום אספקה (יחידות)'), '30')
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect((api.sent('PUT', '/api/admin/dishes/1')[0].body as DishInput).maxPerSupplyDate).toBe(30)
  })

  it('edits a free-choice weight dish', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/2': (_, body) => ({ ...eggplant, ...(body as object) }) })
    renderAt('/admin/dishes/2')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { name: 'עריכת מנה: חציל' })).toBeInTheDocument()
    expect(screen.getByLabelText('קפיצה')).toHaveValue(0.25)
    await user.clear(screen.getByLabelText('מחיר לק"ג (₪)'))
    await user.type(screen.getByLabelText('מחיר לק"ג (₪)'), '95')
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    const body = api.sent('PUT', '/api/admin/dishes/2')[0].body as DishInput
    expect(body).toMatchObject({ choiceMode: 'Free', sellBy: 'Weight', minAmount: 0.5, maxAmount: 3, amountStep: 0.25, unitPrice: 95, options: [] })
  })

  it('keeps option ids when editing', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/1': (_, body) => ({ ...chicken, ...(body as object) }) })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'הסרת אפשרות 1' }))
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    const body = api.sent('PUT', '/api/admin/dishes/1')[0].body as DishInput
    expect(body.options).toEqual([{ id: 12, label: 'עוף שלם', amount: 1, price: 80, isDefault: true }])
  })

  it('shows server validation errors next to the fields', async () => {
    fakeApi({
      ...base,
      'PUT /api/admin/dishes/1': () => invalid({ Name: ['required'], 'options[1].price': ['positive'], IsAddOnOnly: ['hasAddOns'] }),
    })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(screen.getByLabelText('שם המנה')).toHaveAccessibleDescription('שדה חובה.'))
    const second = screen.getByRole('group', { name: 'אפשרות 2' })
    expect(within(second).getByLabelText('מחיר (₪)')).toHaveAccessibleDescription('צריך להיות גדול מאפס.')
    expect(screen.getByText('למנה הזו יש תוספות, ולכן היא לא יכולה להיות תוספת בלבד.')).toBeInTheDocument()
    // The summary points to the fields instead of repeating their messages.
    expect(screen.getByRole('alert')).toHaveTextContent('יש שדות לתיקון')
  })

  it('asks before saving a dish that is in unsupplied orders', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/admin/dishes/1/affected-orders': () => ({ count: 2 }),
      'PUT /api/admin/dishes/1': () => chicken,
    })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'שמירה' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('נמצאת בהזמנות שעדיין לא סופקו (2)')
    expect(api.sent('PUT', '/api/admin/dishes/1')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'שמירה בכל זאת' }))
    await waitFor(() => expect(api.sent('PUT', '/api/admin/dishes/1')).toHaveLength(1))
  })

  it('asks to save a new dish before adding pictures', async () => {
    fakeApi(base)
    renderAt('/admin/dishes/new')
    expect(await screen.findByText('שמרו את המנה כדי להוסיף תמונות.')).toBeInTheDocument()
  })

  it('uploads, reorders and removes pictures of a saved dish', async () => {
    const image = (id: number, n: number) => ({ id, url: `https://img.test/${id}.jpg`, displayOrder: n })
    let current: Dish = { ...chicken, images: [image(1, 0)] }
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/categories': () => categories,
      'GET /api/admin/dishes': () => [current, eggplant],
      'POST /api/admin/dishes/1/images': () => (current = { ...current, images: [image(1, 0), image(2, 1)] }),
      'POST /api/admin/dishes/1/images/2/move': () => (current = { ...current, images: [image(2, 0), image(1, 1)] }),
      'DELETE /api/admin/dishes/1/images/1': () => (current = { ...current, images: [image(2, 0)] }),
    })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()
    const pictures = await screen.findByRole('region', { name: 'תמונות' })

    await user.upload(within(pictures).getByLabelText('בחירת תמונה'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(within(pictures).getAllByRole('img')).toHaveLength(2))

    await user.click(within(pictures).getByRole('button', { name: 'העברה למעלה: תמונה 2' }))
    await waitFor(() => expect(within(pictures).getAllByRole('img')[0]).toHaveAttribute('src', 'https://img.test/2.jpg'))

    await user.click(within(pictures).getAllByRole('button', { name: 'הסרה' })[1])
    await user.click(within(pictures).getByRole('button', { name: 'כן, להסיר' }))
    await waitFor(() => expect(within(pictures).getAllByRole('img')).toHaveLength(1))
    expect(api.sent('POST', '/move')[0].body).toEqual({ direction: 'Up' })
  })
})
