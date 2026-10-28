import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { menu, menuDish, publicApi } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const hours = [
  { from: '08:00:00', to: '09:00:00' },
  { from: '13:00:00', to: '14:00:00' },
]

// Thursday 2026-10-08 has hours; Friday 2026-10-09 has none.
const timed = () => {
  const base = menu()
  return menu({
    dishes: base.dishes.map((d) => (d.id === 1 ? { ...d, availability: [{ weekday: 'Thursday' as const, from: '08:00:00', to: '12:00:00' }] } : d)),
    supplyDates: [
      { date: '2026-10-08', cutoff: '2026-10-06T20:00:00', hours },
      { date: '2026-10-09', cutoff: '2026-10-07T20:00:00', hours: [] },
    ],
  })
}

async function open() {
  fakeApi({ ...publicApi, 'GET /api/menu': timed })
  renderAt('/')
  await screen.findByRole('heading', { level: 2, name: 'עופות' })
  return userEvent.setup()
}

const chicken = () => screen.queryByRole('article', { name: 'עוף בתנור' })
const total = () => within(screen.getByRole('region', { name: 'סיכום הזמנה' }))

beforeEach(() => localStorage.clear())

describe('Dishes sold only at set times', () => {
  it('shows the dish with a clock and its times while the hour is open, then drops it with a message and a new total', async () => {
    const user = await open()
    // No hour is picked yet, and one of the day's hours fits.
    expect(chicken()).toBeInTheDocument()
    expect(within(chicken()!).getByRole('img', { name: /יום חמישי: 08:00 עד 12:00/ })).toBeInTheDocument()
    expect(within(chicken()!).getByText('יום חמישי: 08:00 עד 12:00')).toBeInTheDocument()

    await user.click(within(chicken()!).getByRole('button', { name: /הוספה להזמנה/ }))
    expect(total().getByText('סה"כ: ₪70')).toBeInTheDocument()

    // An hour inside the range keeps it; one outside takes it out of the menu and the order.
    await user.selectOptions(screen.getByLabelText('שעת אספקה מועדפת'), '08:00:00')
    expect(chicken()).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('שעת אספקה מועדפת'), '13:00:00')

    expect(chicken()).not.toBeInTheDocument()
    expect(screen.getByText(/המנה הבאה הוסרה מההזמנה כי היא לא נמכרת ביום ובשעה שבחרתם: עוף בתנור/)).toBeInTheDocument()
    expect(total().getByText('סה"כ: ₪0')).toBeInTheDocument()
  })

  it('leaves out a dish on a day it is not sold, and the other dishes stay', async () => {
    const user = await open()
    await user.selectOptions(screen.getByLabelText('יום אספקה'), '2026-10-09')

    expect(chicken()).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'בשר טחון' })).toBeInTheDocument()
  })

  it('shows a dish without rules at every time', async () => {
    fakeApi({ ...publicApi, 'GET /api/menu': () => menu({ dishes: [menuDish(1, 'עוף בתנור', 1)] }) })
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    expect(screen.queryByRole('img', { name: /המנה נמכרת רק/ })).not.toBeInTheDocument()
  })
})
