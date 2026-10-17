import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { groupedMenu, menu, menuDish, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

beforeEach(() => {
  localStorage.clear()
})

const tilesMenu = () =>
  menu({
    dishes: [
      ...menu().dishes,
      menuDish(4, 'חומוס פשוט', 1),
      menuDish(5, 'פלאפל', 1, {
        addOnDishIds: [3],
        addOns: [{ dishId: 3, groupId: null, price: null, maxQuantity: null, isCheckbox: true }],
        adjustmentOptional: true,
      }),
    ],
  })

function open(data = tilesMenu()) {
  fakeApi({ 'GET /api/site': () => site({ style: 'tiles' }), 'GET /api/menu': () => data })
  renderAt('/')
  return userEvent.setup()
}

describe('The tiles style', () => {
  it('shows dishes as tiles, and adds a dish that needs nothing with one tap', async () => {
    const user = open()
    const tile = (await screen.findByRole('heading', { level: 3, name: 'חומוס פשוט' })).closest('article')!
    expect(tile).toHaveClass('dish--tile')

    await user.click(within(tile).getByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(tile).getByRole('group', { name: 'חומוס פשוט' })).toBeInTheDocument()
    // The stepper sits on the picture; there is no remove or adjust button, and 0 takes the dish out of the order.
    expect(within(tile).queryByRole('button', { name: /התאמת המנה|הסרה מההזמנה/ })).not.toBeInTheDocument()
    await user.click(within(tile).getByRole('button', { name: 'הפחתה: חומוס פשוט' }))
    expect(within(tile).queryByRole('group', { name: 'חומוס פשוט' })).not.toBeInTheDocument()
    expect(within(tile).getByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' })).toBeInTheDocument()
  })

  it('opens the dialog straight away for a dish with set options', async () => {
    const user = open()
    const tile = (await screen.findByRole('heading', { level: 3, name: 'עוף בתנור' })).closest('article')!
    await user.click(within(tile).getByRole('button', { name: 'הוספה להזמנה: עוף בתנור' }))

    const dialog = screen.getByRole('dialog', { name: 'עוף בתנור' })
    expect(within(dialog).getByRole('group', { name: 'בחירה עבור עוף בתנור' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'סיום' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('adds a dish whose adjustments are optional at once and customises it by tapping the card', async () => {
    const user = open()
    const tile = (await screen.findByRole('heading', { level: 3, name: 'פלאפל' })).closest('article')!
    await user.click(within(tile).getByRole('button', { name: 'הוספה להזמנה: פלאפל' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('heading', { level: 3, name: 'פלאפל' }))
    expect(screen.getByRole('dialog', { name: 'פלאפל' })).toBeInTheDocument()
  })

  it('marks a dish with allergens by a small "!" that shows them when pressed', async () => {
    const data = tilesMenu()
    data.dishes = data.dishes.map((d) => (d.name === 'חומוס פשוט' ? { ...d, allergenInfo: 'שומשום, גלוטן' } : d))
    const user = open(data)
    const tile = (await screen.findByRole('heading', { level: 3, name: 'חומוס פשוט' })).closest('article')!
    expect(within(tile).queryByText(/אלרגנים/)).not.toBeInTheDocument()
    await user.click(within(tile).getByRole('button', { name: 'הצגת אלרגנים במנה' }))
    expect(within(tile).getByText('אלרגנים: שומשום, גלוטן')).toBeInTheDocument()
    // Pressing it does not add the dish.
    expect(within(tile).queryByRole('group', { name: 'חומוס פשוט' })).not.toBeInTheDocument()
  })

  it('enlarges the picture in the dialog to fill it, and goes back to the details', async () => {
    const data = tilesMenu()
    data.dishes = data.dishes.map((d) => (d.name === 'פלאפל' ? { ...d, images: ['https://img/falafel.jpg'] } : d))
    const user = open(data)
    const heading = await screen.findByRole('heading', { level: 3, name: 'פלאפל' })
    await user.click(within(heading.closest('article')!).getByRole('button', { name: 'הוספה להזמנה: פלאפל' }))
    await user.click(heading) // opens its adjustments
    const dialog = screen.getByRole('dialog', { name: 'פלאפל' })

    await user.click(within(dialog).getByRole('button', { name: 'הגדלת התמונה: פלאפל' }))
    expect(within(dialog).queryByRole('button', { name: 'סיום' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('img', { name: 'פלאפל' })).toBeInTheDocument()

    await user.click(within(dialog).getAllByRole('button', { name: 'חזרה לפרטי המנה' })[0])
    expect(within(dialog).getByRole('button', { name: 'סיום' })).toBeInTheDocument()
  })

  it('opens the variants of a main dish in a dialog', async () => {
    const user = open(groupedMenu())
    const tile = (await screen.findByRole('heading', { level: 3, name: 'סיגרים עבודת יד' })).closest('article')!
    await user.click(within(tile).getByRole('button', { name: 'בחירה מתוך סוגי סיגרים עבודת יד' }))
    const dialog = screen.getByRole('dialog', { name: 'סיגרים עבודת יד' })
    await user.click(within(dialog).getByRole('button', { name: 'הוספה להזמנה: סיגר כבד' }))
    await user.click(within(dialog).getByRole('button', { name: 'סיום' }))
    expect(within(tile).getByText('1 נבחרו')).toBeInTheDocument()
  })

  it('does not add a dish when its tile is tapped: the add button comes first, then a tap opens its choices', async () => {
    const user = open()
    const tile = (await screen.findByRole('heading', { level: 3, name: 'חומוס פשוט' })).closest('article')!
    await user.click(screen.getByRole('heading', { level: 3, name: 'חומוס פשוט' }))
    expect(within(tile).queryByRole('group', { name: 'חומוס פשוט' })).not.toBeInTheDocument()

    const chicken = (await screen.findByRole('heading', { level: 3, name: 'עוף בתנור' })).closest('article')!
    await user.click(screen.getByRole('heading', { level: 3, name: 'עוף בתנור' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(within(chicken).getByRole('button', { name: 'הוספה להזמנה: עוף בתנור' }))
    await user.click(within(screen.getByRole('dialog', { name: 'עוף בתנור' })).getByRole('button', { name: 'סיום' }))
    await user.click(screen.getByRole('heading', { level: 3, name: 'עוף בתנור' }))
    expect(screen.getByRole('dialog', { name: 'עוף בתנור' })).toBeInTheDocument()
  })

  it('closes a dialog on a tap behind it, like the done button, and keeps the choice', async () => {
    const user = open()
    const tile = (await screen.findByRole('heading', { level: 3, name: 'עוף בתנור' })).closest('article')!
    await user.click(within(tile).getByRole('button', { name: 'הוספה להזמנה: עוף בתנור' }))
    const dialog = screen.getByRole('dialog', { name: 'עוף בתנור' })

    await user.click(dialog) // inside the dialog: stays open
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(dialog.parentElement!) // the dimmed area
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(tile).getByRole('group', { name: 'עוף בתנור' })).toBeInTheDocument()
  })

  it('opens the dialog from the picture without adding the dish, and closes it with the X', async () => {
    const user = open()
    const tile = (await screen.findByRole('heading', { level: 3, name: 'חומוס פשוט' })).closest('article')!
    await user.click(tile.querySelector('.tile__media')!)

    const dialog = screen.getByRole('dialog', { name: 'חומוס פשוט' })
    expect(within(tile).queryByRole('group', { name: 'חומוס פשוט' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'סגירה' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(tile).getByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' })).toBeInTheDocument()
  })
})
