import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Menu } from '../api/site'
import { menuDish, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

beforeEach(() => {
  localStorage.clear()
})

/** A main dish, a side dish, a drink, and a main dish with variants one of which has a picture. */
const cartMenu = (): Menu => ({
  categories: [
    { id: 1, name: 'עיקריות' },
    { id: 2, name: 'שתיה' },
  ],
  dishes: [
    menuDish(1, 'קציצות', 1),
    menuDish(2, 'אורז', 1, { isSideDish: true }),
    menuDish(3, 'לימונדה', 2),
    menuDish(4, 'כריך הבית', 1),
    menuDish(5, 'כריך שניצל', 1, { mainDishId: 4, images: ['https://img/schnitzel.jpg'] }),
    menuDish(6, 'כריך חביתה', 1, { mainDishId: 4, images: ['https://img/omelette.jpg'] }),
  ],
  supplyDates: [{ date: '2026-10-16', cutoff: '2026-10-14T20:00:00' }],
})

function open(patch: Parameters<typeof site>[0] = {}) {
  fakeApi({ 'GET /api/site': () => site(patch), 'GET /api/menu': () => cartMenu() })
  renderAt('/')
  return userEvent.setup()
}

const add = async (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(await screen.findByRole('button', { name: `הוספה להזמנה: ${name}` }))

describe('The basket button', () => {
  it('is always there and counts dishes, side dishes and drinks together', async () => {
    const user = open()
    const button = await screen.findByRole('button', { name: 'הסל שלי' })
    expect(button).toBeInTheDocument()

    await add(user, 'קציצות')
    await add(user, 'אורז')
    await add(user, 'לימונדה')
    expect(screen.getByRole('button', { name: 'הסל שלי, 3 פריטים' })).toHaveTextContent('3')
  })

  it('opens every chosen dish, where the amount can be changed and a dish removed', async () => {
    const user = open({ style: 'tiles', orderTotalPosition: 'side', orderFlow: 'continue' })
    await add(user, 'קציצות')
    await add(user, 'לימונדה')
    await user.click(screen.getByRole('button', { name: 'הסל שלי, 2 פריטים' }))

    const sheet = screen.getByRole('dialog', { name: 'הסל שלי' })
    expect(within(sheet).getByText('קציצות')).toBeInTheDocument()
    expect(within(sheet).getByText('לימונדה')).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'הוספה: קציצות' }))
    expect(within(sheet).getByText('₪120', { selector: '.cart-sheet__total strong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'הסל שלי, 3 פריטים' })).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'הסרה מההזמנה: לימונדה' }))
    expect(within(sheet).queryByText('לימונדה')).not.toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'המשך בחירת מנות' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says the basket is empty before anything is chosen', async () => {
    const user = open()
    await user.click(await screen.findByRole('button', { name: 'הסל שלי' }))
    expect(within(screen.getByRole('dialog', { name: 'הסל שלי' })).getByText(/הסל ריק/)).toBeInTheDocument()
  })
})

describe('The order summary above the send button', () => {
  it('lists the dishes with their amounts and shows a remark behind a button', async () => {
    const user = open()
    await add(user, 'קציצות')
    const summary = screen.getByRole('region', { name: 'סיכום ההזמנה' })
    expect(within(summary).getByText('קציצות')).toBeInTheDocument()
    expect(within(summary).getByText('×1')).toBeInTheDocument()
    expect(within(summary).queryByRole('button')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /הצג התאמת מנות/ }))
    await user.type(screen.getByRole('textbox', { name: /קציצות/ }), 'בלי בצל')
    await user.click(within(summary).getByRole('button', { name: 'הצגת ההתאמות של קציצות' }))
    expect(within(summary).getByText(/בלי בצל/)).toBeInTheDocument()
  })
})

describe('A group in the tiles style with no picture of its own', () => {
  it('shows its variants pictures and opens the choice of variant from the plus', async () => {
    const user = open({ style: 'tiles' })
    const tile = (await screen.findByRole('heading', { level: 3, name: 'כריך הבית' })).closest('article')!
    expect(tile.querySelectorAll('.tile__media img')).toHaveLength(2)

    await user.click(within(tile).getByRole('button', { name: 'בחירה מתוך סוגי כריך הבית' }))
    const dialog = screen.getByRole('dialog', { name: 'כריך הבית' })
    await user.click(within(dialog).getByRole('button', { name: 'הוספה להזמנה: כריך שניצל' }))
    expect(screen.getByRole('button', { name: 'הסל שלי, 1 פריטים' })).toBeInTheDocument()
  })
})
