import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Confirmation, Site } from '../api/site'
import { menu, menuDish, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const confirmation: Confirmation = {
  id: 7,
  supplyDate: '2026-10-09',
  fulfillmentMethod: 'Delivery',
  paymentMethod: 'OnDelivery',
  total: 40,
  paymentPhone: null,
  needsReview: false,
  items: [{ dishName: 'חומוס פשוט', optionLabel: 'מנה', quantity: 1, unitPrice: 40, lineTotal: 40, isAddOn: false }],
}

const menuWithPlainDish = () =>
  menu({ dishes: [...menu().dishes, menuDish(4, 'חומוס פשוט', 1)] })

const styles = ['classic', 'street', 'tiles'] as const
const flows = ['page', 'continue', 'steps'] as const
const totals = ['bottom', 'side'] as const

let scrolled: Element[] = []

beforeEach(() => {
  localStorage.clear()
  scrolled = []
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this)
  })
})

async function open(patch: Partial<Site>) {
  const api = fakeApi({
    'GET /api/site': () => site(patch),
    'GET /api/menu': menuWithPlainDish,
    'POST /api/orders': () => confirmation,
  })
  renderAt('/')
  await screen.findByRole('heading', { level: 3, name: 'חומוס פשוט' }).catch(async () => screen.findAllByRole('heading', { level: 3 }))
  return { api, user: userEvent.setup() }
}

/** Goes to the order details from wherever the layout keeps them. */
async function toDetails(user: ReturnType<typeof userEvent.setup>, flow: (typeof flows)[number]) {
  if (flow === 'continue') await user.click(screen.getByRole('button', { name: 'המשך לפרטי ההזמנה' }))
  if (flow === 'steps') await user.click(within(screen.getByRole('navigation', { name: 'שלבי ההזמנה' })).getByRole('button', { name: 'פרטים ותשלום' }))
}

async function addPlainDish(user: ReturnType<typeof userEvent.setup>, flow: (typeof flows)[number]) {
  // A paged menu shows one category at a time: the dish is in the first one.
  void flow
  await user.click(await screen.findByRole('button', { name: 'הוספה להזמנה: חומוס פשוט' }))
}

describe.each(styles.flatMap((style) => flows.flatMap((flow) => totals.map((orderTotalPosition) => ({ style, flow, orderTotalPosition })))))(
  'Sending the order: $style style, $flow flow, total at $orderTotalPosition',
  ({ style, flow, orderTotalPosition }) => {
    const layout = { style, orderFlow: flow, orderTotalPosition } as Partial<Site>

    it('sends a valid order', async () => {
      const { api, user } = await open(layout)
      await addPlainDish(user, flow)
      await toDetails(user, flow)
      await user.type(screen.getByLabelText('שם מלא'), 'דנה')
      await user.type(screen.getByLabelText('רחוב'), 'הרצל')
      await user.type(screen.getByLabelText('מספר בית'), '1')
      await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
      await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
      await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
      expect(api.sent('POST', '/api/orders')).toHaveLength(1)
    })

    it('scrolls to the first invalid field when the form is not filled in', async () => {
      const { api, user } = await open(layout)
      await addPlainDish(user, flow)
      await toDetails(user, flow)
      await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
      await vi.waitFor(() => expect(screen.getByLabelText('טלפון')).toHaveFocus())
      expect(scrolled).toContain(screen.getByLabelText('טלפון'))
      expect(api.sent('POST', '/api/orders')).toHaveLength(0)
    })
  },
)

const fillContact = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('שם מלא'), 'דנה')
  await user.type(screen.getByLabelText('רחוב'), 'הרצל')
  await user.type(screen.getByLabelText('מספר בית'), '1')
  await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
}

describe.each(styles.flatMap((style) => flows.map((flow) => ({ style, flow }))))(
  'A dish that still has to be adjusted: $style style, $flow flow',
  ({ style, flow }) => {
    it('brings the client to what is missing, and sends once it is settled', async () => {
      const { api, user } = await open({ style, orderFlow: flow } as Partial<Site>)
      await user.click(await screen.findByRole('button', { name: 'הוספה להזמנה: עוף בתנור' }))
      // A tile asks for the choices in a dialog: leave it without settling them.
      if (style === 'tiles') await user.click(within(screen.getByRole('dialog', { name: 'עוף בתנור' })).getByRole('button', { name: 'סיום' }))
      await toDetails(user, flow)
      await fillContact(user)
      await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))

      expect(api.sent('POST', '/api/orders')).toHaveLength(0)
      // The unit to settle is on screen (in the dialog for a tile) and focused.
      const confirm = await screen.findByRole('button', { name: 'אישור ללא התאמות' })
      if (style === 'tiles') expect(screen.getByRole('dialog', { name: 'עוף בתנור' })).toContainElement(confirm)
      await vi.waitFor(() => expect(scrolled.length).toBeGreaterThan(0))

      await user.click(confirm)
      if (style === 'tiles') await user.click(within(screen.getByRole('dialog', { name: 'עוף בתנור' })).getByRole('button', { name: 'סיום' }))
      // Paged: finding the dish moved the client to its category.
      if (flow === 'steps') await toDetails(user, flow)
      await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
      await screen.findByRole('dialog', { name: 'ההזמנה התקבלה' })
      expect(api.sent('POST', '/api/orders')).toHaveLength(1)
    })
  },
)

describe('The "to details and payment" buttons', () => {
  const addressFieldset = () => screen.getByText('משלוח או איסוף').closest('fieldset')!
  const press = (name = 'לפרטים ולתשלום') => userEvent.setup().click(within(screen.getByRole('region', { name: 'סיכום הזמנה' })).getByRole('button', { name }))

  it('scrolls to the address and payment on every press of the side total button', async () => {
    const { user } = await open({ orderTotalPosition: 'side' })
    await addPlainDish(user, 'page')
    await press()
    expect(scrolled.at(-1)).toBe(addressFieldset())
    scrolled = []
    await press()
    expect(scrolled.at(-1)).toBe(addressFieldset())
  })

  it('opens the hidden details and scrolls again when they are already open (continue flow, side total)', async () => {
    const { user } = await open({ orderFlow: 'continue', orderTotalPosition: 'side' })
    await addPlainDish(user, 'continue')
    await press()
    expect(scrolled.at(-1)).toBe(addressFieldset())
    scrolled = []
    await press()
    expect(scrolled.at(-1)).toBe(addressFieldset())
  })

  it('goes to the details step and its address when paged', async () => {
    const { user } = await open({ orderFlow: 'steps', orderTotalPosition: 'side' })
    await addPlainDish(user, 'steps')
    await press()
    expect(scrolled.at(-1)).toBe(addressFieldset())
  })

  it.each(['page', 'continue', 'steps'] as const)('scrolls from the basket sheet, every time (%s flow)', async (flow) => {
    const { user } = await open({ orderFlow: flow })
    await addPlainDish(user, flow)
    for (let i = 0; i < 2; i++) {
      scrolled = []
      await user.click(screen.getByRole('button', { name: /הסל שלי/ }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'לפרטים ולתשלום' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(scrolled.at(-1)).toBe(addressFieldset())
    }
  })
})
