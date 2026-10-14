import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

beforeEach(() => {
  localStorage.clear()
})

async function open(patch: Parameters<typeof site>[0]) {
  fakeApi({ ...publicApi, 'GET /api/site': () => site(patch) })
  renderAt('/')
  await screen.findByRole('navigation', { name: 'שלבי ההזמנה' }).catch(() => undefined)
  return userEvent.setup()
}

describe('Order total position', () => {
  it('has no details button in the total panel by default', async () => {
    fakeApi(publicApi)
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    const panel = screen.getByRole('region', { name: 'סיכום הזמנה' })
    expect(panel.closest('.order-page')).toHaveAttribute('data-total', 'bottom')
    expect(within(panel).queryByRole('button', { name: 'לפרטים ולתשלום' })).not.toBeInTheDocument()
  })

  it('adds a button to the order details when the total sits at the side', async () => {
    fakeApi({
      ...publicApi,
      'GET /api/site': () => site({ orderTotalPosition: 'side' }),
    })
    renderAt('/')
    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'עופות',
    })
    const panel = screen.getByRole('region', { name: 'סיכום הזמנה' })
    expect(panel.closest('.order-page')).toHaveAttribute('data-total', 'side')
    expect(heading).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'לפרטים ולתשלום' })).toBeInTheDocument()
  })
})

describe('Order flow by category steps', () => {
  it('shows every category and the form on one page by default', async () => {
    fakeApi(publicApi)
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    expect(screen.getByRole('heading', { level: 2, name: 'בשרים' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'שלבי ההזמנה' })).not.toBeInTheDocument()
  })

  it('shows the first category, pages with the arrows and jumps to the details', async () => {
    const user = await open({ orderFlow: 'steps' })
    const steps = await screen.findByRole('navigation', {
      name: 'שלבי ההזמנה',
    })

    expect(screen.getByRole('heading', { level: 2, name: 'עופות' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'בשרים' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'שליחת ההזמנה' })).not.toBeInTheDocument()
    expect(within(steps).getByRole('button', { name: 'לשלב הקודם' })).toBeDisabled()

    await user.click(within(steps).getByRole('button', { name: 'לשלב הבא' }))
    expect(screen.getByRole('heading', { level: 2, name: 'בשרים' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'עופות' })).not.toBeInTheDocument()

    await user.click(within(steps).getByRole('button', { name: 'פרטים ותשלום' }))
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'בשרים' })).not.toBeInTheDocument()
    expect(within(steps).getByRole('button', { name: 'לשלב הבא' })).toBeDisabled()
  })

  it('counts the picked dishes on the step and keeps them when paging', async () => {
    const user = await open({ orderFlow: 'steps' })
    const steps = await screen.findByRole('navigation', {
      name: 'שלבי ההזמנה',
    })
    await user.click(within(screen.getByRole('article', { name: 'עוף בתנור' })).getByRole('button', { name: /הוספה להזמנה/ }))
    expect(within(steps).getByLabelText('1 נבחרו בקטגוריה')).toBeInTheDocument()

    await user.click(within(steps).getByRole('button', { name: /בשרים/ }))
    await user.click(within(steps).getByRole('button', { name: /עופות/ }))
    expect(within(screen.getByRole('article', { name: 'עוף בתנור' })).getByRole('radio', { name: /שלם/ })).toBeChecked()
  })

  it('goes on with the footer button, and to the details from the side total', async () => {
    const user = await open({ orderFlow: 'steps', orderTotalPosition: 'side' })
    await screen.findByRole('navigation', { name: 'שלבי ההזמנה' })
    await user.click(screen.getByRole('button', { name: 'המשך' }))
    expect(screen.getByRole('heading', { level: 2, name: 'בשרים' })).toBeInTheDocument()

    await user.click(within(screen.getByRole('region', { name: 'סיכום הזמנה' })).getByRole('button', { name: 'לפרטים ולתשלום' }))
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeInTheDocument()
  })
})

describe('Category jump bar', () => {
  it('lists the categories at the top of the one-page flows and not when paged', async () => {
    fakeApi(publicApi)
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    const bar = screen.getByRole('navigation', { name: 'מעבר בין קטגוריות' })
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['עופות', 'בשרים'])
    expect(screen.getByRole('heading', { level: 2, name: 'בשרים' }).closest('details')).toHaveAttribute('id', 'category-2')
  })

  it('is left out when the menu is paged one category at a time', async () => {
    await open({ orderFlow: 'steps' })
    await screen.findByRole('navigation', { name: 'שלבי ההזמנה' })
    expect(screen.queryByRole('navigation', { name: 'מעבר בין קטגוריות' })).not.toBeInTheDocument()
  })
})

describe('Order flow with a continue button', () => {
  it('hides the order details until the client presses continue', async () => {
    const user = await open({ orderFlow: 'continue' })
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    expect(screen.getByRole('heading', { level: 2, name: 'בשרים' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'שליחת ההזמנה' })).not.toBeInTheDocument()
    const forward = screen.getByRole('button', { name: 'המשך לפרטי ההזמנה' })
    expect(forward).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'הוספה להזמנה: בשר טחון' }))
    await user.click(forward)
    expect(screen.getByRole('button', { name: 'שליחת ההזמנה' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'המשך לפרטי ההזמנה' })).not.toBeInTheDocument()
  })

  it('shows the approved reviews before the details are opened', async () => {
    fakeApi({
      ...publicApi,
      'GET /api/site': () => site({ orderFlow: 'continue', features: ['reviews'] }),
      'GET /api/reviews': () => [
        { id: 1, name: 'משה', rating: 5, comment: 'היה ממש טעים', images: [], submittedAt: '2026-10-14T19:52:06Z' },
      ],
    })
    renderAt('/')
    expect(await screen.findByText('היה ממש טעים')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'שליחת ההזמנה' })).not.toBeInTheDocument()
  })
})
