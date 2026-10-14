import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { menu, menuDish, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

beforeEach(() => {
  localStorage.clear()
})

const hummusMenu = () =>
  menu({
    dishes: [
      menuDish(1, 'חומוס', 1, {
        addOnDishIds: [2, 3],
        addOnGroups: [{ id: 1, name: 'תוספות לחומוס', maxUnits: 5 }],
        addOns: [
          { dishId: 2, groupId: 1, price: 3, maxQuantity: null, isCheckbox: false },
          { dishId: 3, groupId: 1, price: 2, maxQuantity: null, isCheckbox: false },
        ],
        adjustmentOptional: true,
      }),
      menuDish(2, 'ביצה', 1, { isAddOnOnly: true }),
      menuDish(3, 'פיתה', 1, { isAddOnOnly: true }),
    ],
  })

describe.each(['classic', 'tiles'] as const)('A group limit in the %s style', (style) => {
  it('is shared by the items of the group', async () => {
    fakeApi({ 'GET /api/site': () => site({ style }), 'GET /api/menu': () => hummusMenu() })
    renderAt('/')
    const user = userEvent.setup()
    const heading = await screen.findByRole('heading', { level: 3, name: 'חומוס' })
    const card = heading.closest('article')!
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה: חומוס/ }))
    let scope: HTMLElement = card
    if (style === 'tiles') {
      await user.click(within(card).getByRole('button', { name: 'התאמת המנה: חומוס' }))
      scope = screen.getByRole('dialog')
    }
    // The tiles dialog shows the adjustments open at once; the page card hides them behind a button.
    if (style === 'classic') await user.click(within(scope).getByRole('button', { name: /הצג התאמת מנות/ }))
    const plus = (name: string) => within(scope).getByRole('button', { name: `הוספה: ${name}` })
    expect(within(scope).getByText(/עד 5 · נותרו 5/)).toBeInTheDocument()
    for (let i = 0; i < 3; i++) await user.click(plus('ביצה'))
    for (let i = 0; i < 2; i++) await user.click(plus('פיתה'))
    // 3 eggs and 2 pitas make the 5 of the group.
    expect(plus('ביצה')).toBeDisabled()
    expect(plus('פיתה')).toBeDisabled()
    expect(within(scope).getByText(/עד 5 · נותרו 0/)).toBeInTheDocument()

    await user.click(within(scope).getByRole('button', { name: 'הפחתה: פיתה' }))
    expect(plus('ביצה')).toBeEnabled()
    await user.click(plus('ביצה'))
    expect(plus('ביצה')).toBeDisabled()
    expect(plus('פיתה')).toBeDisabled()
  })
})

describe('An add-on row', () => {
  it('keeps the amount control in place when the first unit brings the price in', async () => {
    fakeApi({ 'GET /api/site': () => site(), 'GET /api/menu': () => hummusMenu() })
    renderAt('/')
    const user = userEvent.setup()
    const card = (await screen.findByRole('heading', { level: 3, name: 'חומוס' })).closest('article')!
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה: חומוס/ }))
    await user.click(within(card).getByRole('button', { name: /הצג התאמת מנות/ }))

    const row = () => within(card).getByRole('group', { name: 'ביצה' }).closest('.addon')!
    const before = [...row().children].map((e) => e.className)
    expect(row().querySelector('.addon__sum')).toBeEmptyDOMElement()

    await user.click(within(card).getByRole('button', { name: 'הוספה: ביצה' }))
    expect([...row().children].map((e) => e.className)).toEqual(before)
    expect(row().querySelector('.addon__sum')).toHaveTextContent('₪3')
  })
})
