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
    expect(within(tile).getByRole('button', { name: 'התאמת המנה: חומוס פשוט' })).toBeInTheDocument()
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

  it('adds a dish whose adjustments are optional at once and customises it through the small button', async () => {
    const user = open()
    const tile = (await screen.findByRole('heading', { level: 3, name: 'פלאפל' })).closest('article')!
    await user.click(within(tile).getByRole('button', { name: 'הוספה להזמנה: פלאפל' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(within(tile).getByRole('button', { name: 'התאמת המנה: פלאפל' }))
    expect(screen.getByRole('dialog', { name: 'פלאפל' })).toBeInTheDocument()
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

  it('adds a dish with no picture when its tile is tapped, not only the round button', async () => {
    const user = open()
    const tile = (await screen.findByRole('heading', { level: 3, name: 'חומוס פשוט' })).closest('article')!
    await user.click(screen.getByRole('heading', { level: 3, name: 'חומוס פשוט' }))
    expect(within(tile).getByRole('group', { name: 'חומוס פשוט' })).toBeInTheDocument()
  })

  it('opens the dialog when a dish that needs choices is tapped', async () => {
    const user = open()
    await user.click(await screen.findByRole('heading', { level: 3, name: 'עוף בתנור' }))
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
    expect(within(tile).getByRole('button', { name: 'התאמת המנה: עוף בתנור' })).toBeInTheDocument()
  })
})
