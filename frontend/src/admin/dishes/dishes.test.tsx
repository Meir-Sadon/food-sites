import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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

/** The dishes list starts with every category folded; opens them all. */
async function openCategories() {
  const toggles = await screen.findAllByRole('button', { expanded: false })
  for (const toggle of toggles) if (toggle.closest('.category-fold')) await userEvent.click(toggle)
}

const base = {
  ...adminSession,
  'GET /api/admin/categories': () => categories,
  'GET /api/admin/dishes': () => all,
}

describe('Dishes list', () => {
  it('groups dishes by category with price and badges', async () => {
    fakeApi(base)
    renderAt('/admin/dishes')
    await openCategories()

    const poultry = await screen.findByRole('region', { name: /^עופות/ })
    const rows = within(poultry).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('עוף בתנור')
    expect(rows[0]).toHaveTextContent('₪45 · חצי עוף')
    expect(rows[1]).toHaveTextContent('תוספת בלבד')
    expect(within(screen.getByRole('region', { name: /^סלטים/ })).getByText('₪90 לק"ג')).toBeInTheDocument()
  })

  it('starts with the categories folded and opens or closes them all', async () => {
    fakeApi(base)
    renderAt('/admin/dishes')
    const user = userEvent.setup()
    await screen.findByRole('region', { name: /^עופות/ })
    expect(screen.queryByText('עוף בתנור')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'פתיחת הכול' }))
    expect(screen.getByText('עוף בתנור')).toBeInTheDocument()
    expect(screen.getByText('חציל')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'סגירת הכול' }))
    expect(screen.queryByText('חציל')).not.toBeInTheDocument()
  })

  it('searches dishes and opens the categories that hold a match', async () => {
    fakeApi(base)
    renderAt('/admin/dishes')
    const user = userEvent.setup()
    await user.type(await screen.findByRole('searchbox', { name: 'חיפוש מנה' }), 'חצי')

    expect(screen.getByText('חציל')).toBeInTheDocument()
    expect(screen.queryByText('עוף בתנור')).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'זזזז')
    expect(screen.getByText('לא נמצאו מנות.')).toBeInTheDocument()
  })

  it('adds a picture from the list without opening the dish', async () => {
    const api = fakeApi({ ...base, 'POST /api/admin/dishes/2/images': () => ({ ...eggplant, images: [{ id: 7, url: 'https://img/7.jpg', displayOrder: 0 }] }) })
    renderAt('/admin/dishes')
    await openCategories()
    const user = userEvent.setup()
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file)
    // The first picker belongs to the first dish without a picture in the list; both have none.
    await waitFor(() => expect(api.sent('POST', '/images').length).toBe(1))
  })

  it('asks before changing a picture and deletes it on request', async () => {
    const pictured = { ...eggplant, images: [{ id: 7, url: 'https://img/7.jpg', displayOrder: 0 }] }
    const api = fakeApi({
      ...base,
      'GET /api/admin/dishes': () => [pictured],
      'DELETE /api/admin/dishes/2/images/7': () => ({ ...pictured, images: [] }),
    })
    renderAt('/admin/dishes')
    await openCategories()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'שינוי תמונה: חציל' }))
    await user.click(screen.getByRole('button', { name: 'מחיקת התמונה' }))

    await waitFor(() => expect(api.sent('DELETE', '/images/7')).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'הוספת תמונה: חציל' })).toBeInTheDocument()
  })

  it('moves a dish down within its category', async () => {
    const third = dish(5, 'פרגיות', 1)
    const api = fakeApi({
      ...base,
      'GET /api/admin/dishes': () => [...all, third],
      'PUT /api/admin/dishes/order': () => [{ ...leg, displayOrder: 0 }, { ...chicken, displayOrder: 1 }, { ...third, displayOrder: 2 }, eggplant, removed],
    })
    renderAt('/admin/dishes')
    await openCategories()
    const poultry = await screen.findByRole('region', { name: /^עופות/ })

    expect(within(poultry).getByRole('button', { name: 'העברה למעלה: עוף בתנור' })).toBeDisabled()
    await userEvent.setup().click(within(poultry).getByRole('button', { name: 'העברה למטה: עוף בתנור' }))

    await waitFor(() => expect(within(poultry).getAllByRole('listitem')[1]).toHaveTextContent('עוף בתנור'))
    expect(api.sent('PUT', '/dishes/order')[0].body).toEqual({ categoryId: 1, dishIds: [3, 1, 5] })
    // A category with one dish has nothing to reorder.
    expect(within(screen.getByRole('region', { name: /^סלטים/ })).queryByRole('button', { name: /העברה/ })).not.toBeInTheDocument()
  })

  it('drags a dish to a new place', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/order': () => [{ ...leg, displayOrder: 0 }, { ...chicken, displayOrder: 1 }, eggplant, removed] })
    renderAt('/admin/dishes')
    await openCategories()
    const poultry = await screen.findByRole('region', { name: /^עופות/ })
    // jsdom has no layout: the rows are 40px tall, one under the other.
    within(poultry).getAllByRole('listitem').forEach((row, i) => {
      row.getBoundingClientRect = () => ({ top: i * 40, bottom: i * 40 + 40, left: 0, right: 300 }) as DOMRect
    })

    const grip = within(poultry).getAllByTitle('גררו כדי לשנות את הסדר')[0]
    fireEvent.pointerDown(grip, { button: 0 })
    fireEvent(window, Object.assign(new Event('pointermove'), { clientX: 10, clientY: 70 }))
    await waitFor(() => expect(within(poultry).getAllByRole('listitem')[0]).toHaveTextContent('שוק'))
    fireEvent(window, new Event('pointerup'))

    await waitFor(() => expect(api.sent('PUT', '/dishes/order')).toHaveLength(1))
    expect(api.sent('PUT', '/dishes/order')[0].body).toEqual({ categoryId: 1, dishIds: [3, 1] })
  })

  it('puts the order back when saving it fails', async () => {
    fakeApi({ ...base, 'PUT /api/admin/dishes/order': () => ({ status: 409, body: { code: 'listChanged' } }) })
    renderAt('/admin/dishes')
    await openCategories()
    const poultry = await screen.findByRole('region', { name: /^עופות/ })

    await userEvent.setup().click(within(poultry).getByRole('button', { name: 'העברה למטה: עוף בתנור' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('הרשימה השתנתה')
    expect(within(poultry).getAllByRole('listitem')[0]).toHaveTextContent('עוף בתנור')
  })

  it('marks a dish sold out', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/1/sold-out': () => undefined })
    renderAt('/admin/dishes')
    await openCategories()
    const row = (await screen.findByText('עוף בתנור')).closest('li')!

    await userEvent.setup().click(within(row).getByLabelText('אזל'))

    await waitFor(() => expect(within(row).getByLabelText('אזל')).toBeChecked())
    expect(api.sent('PUT', '/sold-out')[0].body).toEqual({ isSoldOut: true })
  })

  it('undoes the sold-out mark when saving fails', async () => {
    fakeApi({ ...base, 'PUT /api/admin/dishes/1/sold-out': () => ({ status: 500 }) })
    renderAt('/admin/dishes')
    await openCategories()
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
    await openCategories()
    const user = userEvent.setup()
    const row = (await screen.findByText('חציל')).closest('li')!

    await user.click(within(row).getByRole('button', { name: 'הסרה' }))
    await user.click(within(row).getByRole('button', { name: 'כן, להסיר' }))
    expect(await screen.findByText('מנות שהוסרו (2)')).toBeInTheDocument()

    await user.click(screen.getByText('מנות שהוסרו (2)'))
    await user.click(screen.getByRole('button', { name: 'החזרה לתפריט: עוגה' }))
    expect(await screen.findByText('מנות שהוסרו (1)')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /^סלטים/ })).getByText('עוגה')).toBeInTheDocument()
  })

  it('warns with the number of unsupplied orders before removing a dish', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/admin/dishes/2/affected-orders': () => ({ count: 3 }),
      'DELETE /api/admin/dishes/2': () => undefined,
    })
    renderAt('/admin/dishes')
    await openCategories()
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
        created = { ...dish(9, 'x', 1), ...(body as DishInput), id: 9, options: [], images: [], addOnDishIds: [], addOnGroups: [], addOns: [], questions: [] }
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
    expect(await screen.findByRole('heading', { name: 'עריכת מנה: רוטב' })).toBeInTheDocument()
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
      unitName: null,
      optionsTitle: null,
      showOptionDifference: false,
      dietaryTags: [],
      dietaryTagsSingle: false,
      isAddOnOnly: true,
      isSoldOut: false,
      openByDefault: false,
      isSideDish: false,
      onSale: false,
      maxPerSupplyDate: null,
      options: [
        { id: null, label: 'קטן', amount: 1, price: 5, isDefault: false },
        { id: null, label: 'גדול', amount: 2, price: 9, isDefault: true },
      ],
      parentDishIds: [1],
      mainDishId: null,
      useMainDishPrice: false,
      isYesNo: false,
      // Optional unless the admin unticks it.
      adjustmentOptional: true,
      addOnGroups: [],
      addOns: [],
      questions: [],
    })
  })

  it('saves a dish as open by default', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/1': (_, body) => ({ ...chicken, ...(body as object) }) })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()

    await screen.findByRole('heading', { name: /עריכת מנה/ })
    await user.click(screen.getByLabelText(/פתוחה כברירת מחדל/))
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect((api.sent('PUT', '/api/admin/dishes/1')[0].body as DishInput).openByDefault).toBe(true)
  })

  it('saves a dish marked as on sale', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/1': (_, body) => ({ ...chicken, ...(body as object) }) })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()

    await screen.findByRole('heading', { name: /עריכת מנה/ })
    await user.click(screen.getByLabelText(/במבצע/))
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect((api.sent('PUT', '/api/admin/dishes/1')[0].body as DishInput).onSale).toBe(true)
  })

  it('saves a dish whose adjustment is optional', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/1': (_, body) => ({ ...chicken, ...(body as object) }) })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()

    await screen.findByRole('heading', { name: /עריכת מנה/ })
    await user.click(screen.getByLabelText('התאמת המנות אינה חובה'))
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect((api.sent('PUT', '/api/admin/dishes/1')[0].body as DishInput).adjustmentOptional).toBe(true)
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

  it('names the unit of a free-choice dish', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/2': (_, body) => ({ ...eggplant, ...(body as object) }) })
    renderAt('/admin/dishes/2')
    const user = userEvent.setup()

    await screen.findByRole('heading', { name: 'עריכת מנה: חציל' })
    await user.click(screen.getByLabelText('יחידות'))
    await user.type(screen.getByLabelText('שם יחידת המידה (לא חובה)'), ' מגש של 50 ')
    expect(screen.getByRole('group', { name: 'כמות (מגש של 50)' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('מחיר למגש של 50 (₪)'))
    await user.type(screen.getByLabelText('מחיר למגש של 50 (₪)'), '120')
    for (const field of ['מינימום', 'קפיצה']) {
      await user.clear(screen.getByLabelText(field))
      await user.type(screen.getByLabelText(field), '1')
    }
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/dishes/2')[0].body).toMatchObject({ sellBy: 'Units', unitName: 'מגש של 50', unitPrice: 120 })
  })

  it('shows a named unit in the dishes list', async () => {
    fakeApi({ ...base, 'GET /api/admin/dishes': () => [{ ...eggplant, unitName: 'מגש' }] })
    renderAt('/admin/dishes')
    await openCategories()
    expect(await screen.findByText('₪90 למגש')).toBeInTheDocument()
  })

  it('adds questions of each kind to a dish', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/dishes/1': (_, body) => ({ ...chicken, ...(body as object) }) })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'הוספת שאלה' }))
    const first = screen.getByRole('group', { name: 'שאלה 1' })
    await user.type(within(first).getByLabelText('השאלה'), 'רמת חריפות')
    await user.selectOptions(within(first).getByLabelText('סוג התשובה'), 'בחירה אחת מרשימה')
    await user.type(within(first).getByLabelText('אפשרויות (אחת בכל שורה)'), 'עדין{Enter}חריף{Enter}')
    await user.click(within(first).getByLabelText('רשימה נפתחת'))
    await user.click(within(first).getByLabelText('חובה לענות'))
    // The default answer is picked from an empty choice and the question's own choices.
    const defaultAnswer = within(first).getByLabelText('תשובת ברירת מחדל')
    expect([...(defaultAnswer as HTMLSelectElement).options].map((o) => o.text)).toEqual(['ללא', 'עדין', 'חריף'])
    await user.selectOptions(defaultAnswer, 'חריף')

    await user.click(screen.getByRole('button', { name: 'הוספת שאלה' }))
    const second = screen.getByRole('group', { name: 'שאלה 2' })
    await user.type(within(second).getByLabelText('השאלה'), 'מה לכתוב על העוגה?')
    await user.click(within(second).getByRole('button', { name: /העברה למעלה/ }))
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect((api.sent('PUT', '/api/admin/dishes/1')[0].body as DishInput).questions).toEqual([
      { id: null, text: 'מה לכתוב על העוגה?', kind: 'Text', choices: [], showAsDropdown: false, isRequired: false, defaultAnswer: null },
      { id: null, text: 'רמת חריפות', kind: 'SingleChoice', choices: ['עדין', 'חריף'], showAsDropdown: true, isRequired: true, defaultAnswer: 'חריף' },
    ])
  })

  it('duplicates a dish into a new one with every detail and its pictures', async () => {
    const pictured = dish(1, 'עוף בתנור', 1, {
      ...chicken,
      images: [{ id: 5, url: 'https://img/1.jpg', displayOrder: 0 }],
      questions: [{ id: 7, text: 'חריפות', kind: 'YesNo', choices: [], showAsDropdown: false, isRequired: true, defaultAnswer: 'yes' }],
    })
    const api = fakeApi({
      ...base,
      'GET /api/admin/dishes': () => [pictured, eggplant, leg, removed],
      'POST /api/admin/dishes': (_, body) => ({ status: 201, body: { ...pictured, ...(body as object), id: 9 } }),
      'GET /api/admin/dishes/9/affected-orders': () => ({ count: 0 }),
    })
    renderAt('/admin/dishes')
    await openCategories()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: 'שכפול המנה: עוף בתנור' }))
    expect(await screen.findByRole('heading', { name: 'מנה חדשה: עותק של עוף בתנור' })).toBeInTheDocument()
    expect(screen.getByLabelText('שם המנה')).toHaveValue('עוף בתנור (עותק)')
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(api.sent('POST', '/api/admin/dishes')).toHaveLength(1))
    expect(api.sent('POST', '/api/admin/dishes')[0].body).toMatchObject({
      name: 'עוף בתנור (עותק)',
      categoryId: 1,
      copyImagesFrom: 1,
      options: [
        { id: null, label: 'חצי עוף', price: 45 },
        { id: null, label: 'עוף שלם', price: 80 },
      ],
      questions: [{ id: null, text: 'חריפות', kind: 'YesNo', isRequired: true }],
    })
  })

  it('saves a heading and the difference display for the options', async () => {
    let body: DishInput | undefined
    fakeApi({
      ...base,
      'POST /api/admin/dishes': (_, sent) => {
        body = sent as DishInput
        return { status: 201, body: { ...dish(9, 'x', 1), ...body, id: 9, options: [], images: [], addOnDishIds: [], addOnGroups: [], addOns: [], questions: [] } }
      },
    })
    renderAt('/admin/dishes/new')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('שם המנה'), 'צ׳יפס')
    await user.selectOptions(screen.getByLabelText('קטגוריה'), 'סלטים')
    expect(screen.queryByLabelText('הצג את התוספת למחיר ברירת המחדל')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('כותרת האפשרויות (לא חובה)'), 'בחרו גודל')
    await user.type(within(screen.getByRole('group', { name: 'אפשרות 1' })).getByLabelText('תיאור האפשרות'), 'קטן')
    await user.type(within(screen.getByRole('group', { name: 'אפשרות 1' })).getByLabelText('מחיר (₪)'), '18')
    await user.click(screen.getByRole('button', { name: 'הוספת אפשרות' }))
    const second = screen.getByRole('group', { name: 'אפשרות 2' })
    await user.type(within(second).getByLabelText('תיאור האפשרות'), 'גדול')
    await user.type(within(second).getByLabelText('מחיר (₪)'), '25')
    await user.click(screen.getByLabelText('הצג את התוספת למחיר ברירת המחדל'))
    await user.click(screen.getByRole('button', { name: /שמירה|הוספת מנה|יצירת/ }))

    await waitFor(() => expect(body).toBeDefined())
    expect(body).toMatchObject({ optionsTitle: 'בחרו גודל', showOptionDifference: true })
  })

  it('saves the dietary tags ticked in their own block', async () => {
    let body: DishInput | undefined
    fakeApi({
      ...base,
      'POST /api/admin/dishes': (_, sent) => {
        body = sent as DishInput
        return { status: 201, body: { ...dish(9, 'x', 1), ...body, id: 9, options: [], images: [], addOnDishIds: [], addOnGroups: [], addOns: [], questions: [] } }
      },
    })
    renderAt('/admin/dishes/new')
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('שם המנה'), 'עוגה')
    await user.selectOptions(screen.getByLabelText('קטגוריה'), 'סלטים')
    await user.type(within(screen.getByRole('group', { name: 'אפשרות 1' })).getByLabelText('תיאור האפשרות'), 'חתיכה')
    await user.type(within(screen.getByRole('group', { name: 'אפשרות 1' })).getByLabelText('מחיר (₪)'), '10')
    await user.click(screen.getByRole('button', { name: /באילו אפשרויות המנה מגיעה/ }))
    await user.click(screen.getByLabelText('ללא גלוטן'))
    await user.click(screen.getByLabelText('טבעונית'))
    await user.click(screen.getByLabelText('אפשר לבחור רק אפשרות אחת'))
    await user.click(screen.getByRole('button', { name: /שמירה|הוספת מנה|יצירת/ }))

    await waitFor(() => expect(body).toBeDefined())
    expect(body).toMatchObject({ dietaryTags: ['glutenFree', 'vegan'], dietaryTagsSingle: true })
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
    // Blocks holding a field to fix open by themselves and say so; the others stay folded.
    const price = screen.getByRole('region', { name: 'מחיר וכמויות' })
    expect(price.querySelector('details')).toHaveAttribute('open')
    expect(price).toHaveTextContent('יש כאן שדות לתיקון')
    expect(screen.getByRole('region', { name: 'זמינות ואופן הצגה' }).querySelector('details')).toHaveAttribute('open')
    expect(screen.getByRole('region', { name: 'שאלות ללקוח' }).querySelector('details')).not.toHaveAttribute('open')
  })

  it('folds each topic of the form under a block with an Info button about it', async () => {
    fakeApi(base)
    renderAt('/admin/dishes/1')
    const basics = await screen.findByRole('region', { name: 'פרטים בסיסיים' })
    const price = screen.getByRole('region', { name: 'מחיר וכמויות' })

    expect(basics.querySelector('details')).toHaveAttribute('open')
    for (const name of ['מחיר וכמויות', 'זמינות ואופן הצגה', 'תוספת למנות אחרות', 'שאלות ללקוח', 'תמונות'])
      expect(screen.getByRole('region', { name }).querySelector('details')).not.toHaveAttribute('open')
    const user = userEvent.setup()
    expect(within(price).queryByRole('note')).not.toBeInTheDocument()
    // The explanation opens from its button without unfolding the block.
    await user.click(within(price).getByRole('button', { name: 'הסבר: מחיר וכמויות' }))
    expect(within(price).getByRole('note')).toHaveTextContent(/איך המנה נמכרת/)
    expect(price.querySelector('details')).not.toHaveAttribute('open')
    await user.keyboard('{Escape}')
    expect(within(price).queryByRole('note')).not.toBeInTheDocument()

    await user.click(within(price).getByText('מחיר וכמויות').closest('summary')!)
    expect(price.querySelector('details')).toHaveAttribute('open')
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

  it('leaves an add-on link made on the parent dish unticked on the add-on, and names it there', async () => {
    const sauce = dish(5, 'רוטב', 2)
    const api = fakeApi({
      ...base,
      'GET /api/admin/dishes': () => [{ ...chicken, addOnDishIds: [3, 5] }, eggplant, leg, removed, sauce],
      'GET /api/admin/dishes/5/affected-orders': () => ({ count: 0 }),
      'PUT /api/admin/dishes/5': () => sauce,
    })
    renderAt('/admin/dishes/5')
    const user = userEvent.setup()

    expect(await screen.findByText('מוצעת גם כתוספת במנות שהוגדרו במסך שלהן: עוף בתנור')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'תוספת למנות' })).getByLabelText('עוף בתנור')).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'שמירה' }))
    await waitFor(() => expect(api.sent('PUT', '/api/admin/dishes/5')).toHaveLength(1))
    expect((api.sent('PUT', '/api/admin/dishes/5')[0].body as DishInput).parentDishIds).toEqual([])
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
      'PUT /api/admin/dishes/1/images/order': () => (current = { ...current, images: [image(2, 0), image(1, 1)] }),
      'DELETE /api/admin/dishes/1/images/1': () => (current = { ...current, images: [image(2, 0)] }),
    })
    renderAt('/admin/dishes/1')
    const user = userEvent.setup()
    const pictures = await screen.findByRole('region', { name: 'תמונות' })

    await user.upload(within(pictures).getByLabelText('בחירת תמונה'), new File(['x'], 'a.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(within(pictures).getAllByRole('img')).toHaveLength(2))

    expect(within(pictures).getAllByRole('listitem')[0]).toHaveTextContent('תמונה ראשית')
    await user.click(within(pictures).getByRole('button', { name: 'העברה למעלה: תמונה 2' }))
    await waitFor(() => expect(within(pictures).getAllByRole('img')[0]).toHaveAttribute('src', 'https://img.test/2.jpg'))
    expect(api.sent('PUT', '/images/order')[0].body).toEqual({ imageIds: [2, 1] })

    await user.click(within(pictures).getAllByRole('button', { name: 'הסרה' })[1])
    await user.click(within(pictures).getByRole('button', { name: 'כן, להסיר' }))
    await waitFor(() => expect(within(pictures).getAllByRole('img')).toHaveLength(1))
  })
})

describe('Variant form', () => {
  it('lists the add-ons it gets from its main dish', async () => {
    const main = dish(1, 'כריך', 1, { addOns: [{ dishId: 3, groupId: null, price: null, maxQuantity: null, isCheckbox: true, slot: 0, label: null, showImage: false, isDefault: false, overLimitPrice: null }], addOnDishIds: [3] })
    const side = dish(3, 'סלט', 1, { isAddOnOnly: true })
    const variant = dish(2, 'כריך שניצל', 1, { mainDishId: 1, useMainDishPrice: true, options: [] })
    fakeApi({ ...base, 'GET /api/admin/dishes': () => [main, variant, side] })
    renderAt('/admin/dishes/2')
    expect(await screen.findByText(/מתקבלות ממנת האב.*סלט/)).toBeInTheDocument()
  })

  it('lets a variant have pictures of its own', async () => {
    const main = dish(1, 'כריך', 1)
    const variant = dish(2, 'כריך שניצל', 1, { mainDishId: 1, useMainDishPrice: true, options: [] })
    fakeApi({ ...base, 'GET /api/admin/dishes': () => [main, variant] })
    renderAt('/admin/dishes/2')
    expect(await screen.findByRole('region', { name: 'תמונות' })).toBeInTheDocument()
  })
})
