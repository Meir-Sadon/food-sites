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

  it('opens the dialog picture full screen, and closes it with the X, a tap or Escape while the dialog stays open', async () => {
    const data = tilesMenu()
    data.dishes = data.dishes.map((d) => (d.name === 'פלאפל' ? { ...d, images: ['https://img/falafel.jpg', 'https://img/falafel2.jpg'] } : d))
    const user = open(data)
    const heading = await screen.findByRole('heading', { level: 3, name: 'פלאפל' })
    await user.click(within(heading.closest('article')!).getByRole('button', { name: 'הוספה להזמנה: פלאפל' }))
    await user.click(heading) // opens its adjustments
    const dialog = screen.getByRole('dialog', { name: 'פלאפל' })

    await user.click(within(dialog).getByRole('button', { name: 'הגדלת התמונה: פלאפל' }))
    const viewer = screen.getAllByRole('dialog', { name: 'פלאפל' }).find((d) => d.classList.contains('image-viewer'))!
    expect(within(viewer).getByRole('img', { name: 'פלאפל, תמונה 1 מתוך 2' })).toBeInTheDocument()
    await user.click(within(viewer).getByRole('button', { name: 'התמונה הבאה' }))
    expect(within(viewer).getByRole('img', { name: 'פלאפל, תמונה 2 מתוך 2' })).toBeInTheDocument()

    await user.click(within(viewer).getByRole('button', { name: 'סגירת התמונה' }))
    expect(document.querySelector('.image-viewer')).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'סיום' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'הגדלת התמונה: פלאפל' }))
    await user.click(document.querySelector('.image-viewer')!)
    expect(document.querySelector('.image-viewer')).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: 'הגדלת התמונה: פלאפל' }))
    await user.keyboard('{Escape}')
    expect(document.querySelector('.image-viewer')).toBeNull()
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

describe('The rectangles style', () => {
  it('shows each dish as a card with the add button on the picture, and sets the size on <html>', async () => {
    fakeApi({ 'GET /api/site': () => site({ style: 'rect', imageSize: 'large' }), 'GET /api/menu': () => tilesMenu() })
    renderAt('/')
    const user = userEvent.setup()
    const card = (await screen.findByRole('heading', { level: 3, name: 'חומוס פשוט' })).closest('article')!
    expect(card).toHaveClass('dish--tile')
    expect(card.querySelector('.tile__media .tile__add')).not.toBeNull()
    expect(card.querySelector('.tile__body')).toHaveTextContent('חומוס פשוט')
    expect(document.documentElement.dataset.style).toBe('rect')
    expect(document.documentElement.dataset.imageSize).toBe('large')

    await user.click(within(card).getByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' }))
    expect(within(card).getByRole('group', { name: 'חומוס פשוט' })).toBeInTheDocument()
  })
})

describe('A section with its own layout', () => {
  it('shows a category as rectangles on a site in the regular style, and the rest as before', async () => {
    const data = tilesMenu()
    data.categories = [{ id: 1, name: 'עופות', layout: 'rect', imageSize: 'huge' }, { id: 2, name: 'בשרים' }]
    fakeApi({ 'GET /api/site': () => site({ style: 'classic' }), 'GET /api/menu': () => data })
    renderAt('/')
    const chicken = (await screen.findByRole('heading', { level: 3, name: 'חומוס פשוט' })).closest('details')!
    expect(chicken).toHaveAttribute('data-layout', 'rect')
    expect(chicken).toHaveAttribute('data-image-size', 'huge')
    expect(within(chicken).getAllByRole('article')[0]).toHaveClass('dish--tile')
    const meat = (await screen.findByRole('heading', { level: 3, name: 'בשר טחון' })).closest('details')!
    expect(meat).toHaveAttribute('data-layout', 'list')
    expect(meat).not.toHaveAttribute('data-image-size')
    expect(within(meat).getAllByRole('article')[0]).not.toHaveClass('dish--tile')
  })

  it('shows a group in its own layout', async () => {
    const data = tilesMenu()
    data.groups = [{ id: 7, name: 'מומלצות', dishIds: [4], layout: 'tiles' }]
    fakeApi({ 'GET /api/site': () => site({ style: 'classic' }), 'GET /api/menu': () => data })
    renderAt('/')
    const group = (await screen.findByRole('heading', { level: 2, name: 'מומלצות' })).closest('details')!
    expect(group).toHaveAttribute('data-layout', 'tiles')
    expect(within(group).getByRole('article')).toHaveClass('dish--tile')
  })

  it('in rectangles, shows the sale mark by the name and cuts long allergen text with a show-all button', async () => {
    const data = tilesMenu()
    data.dishes = data.dishes.map((d) => (d.id === 4 ? { ...d, onSale: true, allergenInfo: 'גלוטן חלב ביצים סומסום סויה בוטנים שקדים אגוזים' } : d))
    fakeApi({ 'GET /api/site': () => site({ style: 'rect' }), 'GET /api/menu': () => data })
    renderAt('/')
    const user = userEvent.setup()
    const card = (await screen.findByRole('heading', { level: 3, name: 'חומוס פשוט' })).closest('article')!
    expect(card.querySelector('.tile__title .item-badge--onSale')).not.toBeNull()
    expect(card.querySelector('.tile__media .item-badge--onSale')).toBeNull()
    expect(card.querySelector('.tile__media .tile__allergen')).toBeNull()
    expect(within(card).queryByText(/אגוזים/)).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'הצג הכל' }))
    expect(within(card).getByText(/אגוזים/)).toBeInTheDocument()
  })
})
