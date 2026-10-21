import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SupplyDay } from '../../api/catalog'
import { popup, settings, supplyDays } from '../../test/catalogData'
import { adminSession, fakeApi, invalid, masterSession } from '../../test/fakeApi'
import { renderAt } from '../../test/render'
import { openSection } from '../../test/sections'

const base = {
  ...adminSession,
  'GET /api/admin/settings': () => settings(),
  'GET /api/admin/supply-days': () => supplyDays(),
  'GET /api/admin/closed-dates': () => [{ id: 1, date: '2026-10-14', reason: 'סוכות' }],
  'GET /api/admin/social-links': () => [],
  'GET /api/admin/popup': () => ({ body: popup() }),
}

/** A settings section once its data has loaded. */
async function section(name: string) {
  const region = await openSection(name)
  await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())
  return region
}

describe('Site style', () => {
  it('saves the picked style with the other settings as saved now', async () => {
    let saved = settings({ kashrutText: 'נשמר בינתיים' })
    const api = fakeApi({
      ...base,
      'GET /api/admin/settings': () => saved,
      'PUT /api/admin/settings': (_, body) => (saved = { ...saved, ...(body as object) }),
    })
    renderAt('/admin/appearance')
    const user = userEvent.setup()
    const form = await section('סגנון האתר')

    expect(within(form).getByRole('radio', { name: /קלאסי/ })).toBeChecked()
    const save = within(form).getByRole('button', { name: 'שמירה' })
    expect(save).toBeDisabled()
    await user.click(within(form).getByRole('radio', { name: /דוכן רחוב/ }))
    await user.click(save)

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ style: 'street', kashrutText: 'נשמר בינתיים', deliveryEnabled: true })
    expect(within(form).getByRole('radio', { name: /דוכן רחוב/ })).toBeChecked()
    expect(save).toBeDisabled()
  })
})

describe('Order layout', () => {
  it('saves where the total sits and how the menu is paged, as settings stand now', async () => {
    let saved = settings({ kashrutText: 'נשמר בינתיים' })
    const api = fakeApi({
      ...base,
      'GET /api/admin/settings': () => saved,
      'PUT /api/admin/settings': (_, body) => (saved = { ...saved, ...(body as object) }),
    })
    renderAt('/admin/appearance')
    const user = userEvent.setup()
    const form = await section('פריסת עמוד ההזמנה')

    expect(within(form).getByRole('radio', { name: /בתחתית המסך/ })).toBeChecked()
    expect(within(form).getByRole('radio', { name: /עמוד אחד/ })).toBeChecked()
    const save = within(form).getByRole('button', { name: 'שמירה' })
    expect(save).toBeDisabled()
    await user.click(within(form).getByRole('radio', { name: /בצד, במסך רחב/ }))
    await user.click(within(form).getByRole('radio', { name: /קטגוריה אחר קטגוריה/ }))
    await user.click(save)

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    const body = api.sent('PUT', '/api/admin/settings')[0].body
    expect(body).toMatchObject({ orderTotalPosition: 'side', orderFlow: 'steps', kashrutText: 'נשמר בינתיים' })
    expect(body).not.toHaveProperty('style')
    expect(save).toBeDisabled()
  })
})

describe('Item badges', () => {
  it('saves the badges on their own and keeps the other settings out of the request', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/admin/categories': () => [],
      'GET /api/admin/dishes': () => [],
      'PUT /api/admin/settings/badges': (_, body) => settings({ badges: { ...settings().badges, ...(body as object) } }),
    })
    renderAt('/admin/dishes')
    const user = userEvent.setup()
    await user.click(await screen.findByText('הגדרות כלליות למנות'))
    const form = await section('סימוני מנות')
    const save = within(form).getByRole('button', { name: 'שמירה' })

    expect(save).toBeDisabled()
    expect(within(form).queryByLabelText('כמה זמן מנה נחשבת חדשה')).not.toBeInTheDocument()
    await user.click(within(form).getByRole('checkbox', { name: /סימון ״חדש״/ }))
    fireEvent.change(within(form).getByLabelText('כמה זמן מנה נחשבת חדשה'), { target: { value: '3' } })
    await user.selectOptions(within(form).getByLabelText('יחידת זמן'), 'month')
    await user.click(within(form).getByRole('checkbox', { name: /סימון ״כמעט אזל״/ }))
    await user.selectOptions(within(form).getByLabelText('לפי מה למדוד'), 'units')
    fireEvent.change(within(form).getByLabelText('להציג כשנשארו עד (יחידות)'), { target: { value: '4' } })
    await user.click(save)

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings/badges')[0].body).toEqual({
      newEnabled: true, newAmount: 3, newUnit: 'month', lowStockEnabled: true, lowStockMode: 'units', lowStockAmount: 4,
    })
    expect(api.sent('PUT', '/api/admin/settings')).toHaveLength(0)
  })
})

describe('Corners', () => {
  it('saves the picked corners and nothing the other sections own', async () => {
    let saved = settings({ kashrutText: 'נשמר בינתיים' })
    const api = fakeApi({
      ...base,
      'GET /api/admin/settings': () => saved,
      'PUT /api/admin/settings': (_, body) => (saved = { ...saved, ...(body as object) }),
    })
    renderAt('/admin/appearance')
    const user = userEvent.setup()
    const form = await section('עיגול פינות')

    expect(within(form).getByRole('radio', { name: /המראה הרגיל של האתר/ })).toBeChecked()
    const save = within(form).getByRole('button', { name: 'שמירה' })
    expect(save).toBeDisabled()
    await user.click(within(form).getByRole('radio', { name: /^מרובע/ }))
    await user.click(save)

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    const body = api.sent('PUT', '/api/admin/settings')[0].body
    expect(body).toMatchObject({ corners: 'square', kashrutText: 'נשמר בינתיים' })
    expect(body).not.toHaveProperty('style')
    expect(body).not.toHaveProperty('orderFlow')
    expect(within(form).getByRole('radio', { name: /^מרובע/ })).toBeChecked()
  })
})

describe('Colours', () => {
  it('saves the palette, a custom colour and the line thickness, and nothing the other sections own', async () => {
    let saved = settings({ kashrutText: 'נשמר בינתיים' })
    const api = fakeApi({
      ...base,
      'GET /api/admin/settings': () => saved,
      'PUT /api/admin/settings': (_, body) => (saved = { ...saved, ...(body as object) }),
    })
    renderAt('/admin/appearance')
    const user = userEvent.setup()
    const form = await section('צבעי האתר')

    expect(within(form).getByRole('radio', { name: /הצבעים של העסק/ })).toBeChecked()
    const save = within(form).getByRole('button', { name: 'שמירה' })
    expect(save).toBeDisabled()
    await user.click(within(form).getByRole('radio', { name: /אוקיינוס/ }))
    fireEvent.change(within(form).getByLabelText('כפתורים'), { target: { value: '#aa0000' } })
    await user.selectOptions(within(form).getByLabelText('עובי פסים'), '3')
    await user.click(save)

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    const body = api.sent('PUT', '/api/admin/settings')[0].body
    expect(body).toMatchObject({ palette: 'ocean', customColors: { button: '#aa0000' }, lineWidth: 3, kashrutText: 'נשמר בינתיים' })
    expect(body).not.toHaveProperty('style')
    expect(body).not.toHaveProperty('corners')
  })

  it('says when a text colour is not readable on its background and that it was changed', async () => {
    fakeApi({ ...base, 'GET /api/admin/settings': () => settings({ customColors: { menu: '#ffffff', menuText: '#eeeeee' } }) })
    renderAt('/admin/appearance')
    const form = await section('צבעי האתר')

    expect(within(form).getByRole('status')).toHaveTextContent('טקסט תפריט ראשי')
  })

  it('does not touch the colours when another section saves', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/admin/settings': () => settings({ palette: 'berry', customColors: { button: '#aa0000' }, lineWidth: 2 }),
      'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }),
    })
    renderAt('/admin/appearance')
    const user = userEvent.setup()
    const form = await section('עיגול פינות')
    await user.click(within(form).getByRole('radio', { name: /^מרובע/ }))
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    const body = api.sent('PUT', '/api/admin/settings')[0].body
    expect(body).not.toHaveProperty('palette')
    expect(body).not.toHaveProperty('customColors')
    expect(body).not.toHaveProperty('lineWidth')
  })
})

describe('Colour copying', () => {
  it('saves a colour copied from another element', async () => {
    let saved = settings()
    const api = fakeApi({
      ...base,
      'GET /api/admin/settings': () => saved,
      'PUT /api/admin/settings': (_, body) => (saved = { ...saved, ...(body as object) }),
    })
    renderAt('/admin/appearance')
    const user = userEvent.setup()
    const form = await section('צבעי האתר')

    fireEvent.change(within(form).getByLabelText('כפתורים'), { target: { value: '#aa0000' } })
    await user.selectOptions(within(form).getByLabelText('העתק צבע מ… עבור תפריט ראשי'), 'כפתורים')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ customColors: { button: '#aa0000', menu: '=button' } })
  })
})

describe('Tiles groups', () => {
  it('offers the minimal look only once tiles is picked, and saves it with the style', async () => {
    let saved = settings()
    const api = fakeApi({
      ...base,
      'GET /api/admin/settings': () => saved,
      'PUT /api/admin/settings': (_, body) => (saved = { ...saved, ...(body as object) }),
    })
    renderAt('/admin/appearance')
    const user = userEvent.setup()
    const form = await section('סגנון האתר')

    expect(within(form).queryByRole('radio', { name: /מינימלי/ })).not.toBeInTheDocument()
    await user.click(within(form).getByRole('radio', { name: /אריחים/ }))
    await user.click(within(form).getByRole('radio', { name: /מינימלי/ }))
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ style: 'tiles', tileGroups: 'minimal' })
  })
})

describe('Finish', () => {
  it('saves the font, shadows and spacing and nothing the other sections own', async () => {
    let saved = settings({ kashrutText: 'נשמר בינתיים' })
    const api = fakeApi({
      ...base,
      'GET /api/admin/settings': () => saved,
      'PUT /api/admin/settings': (_, body) => (saved = { ...saved, ...(body as object) }),
    })
    renderAt('/admin/appearance')
    const user = userEvent.setup()
    const form = await section('גופן, צללים וריווח')

    const save = within(form).getByRole('button', { name: 'שמירה' })
    expect(save).toBeDisabled()
    await user.click(within(form).getByRole('radio', { name: /אלגנטי/ }))
    await user.click(within(form).getByRole('radio', { name: /עדינים/ }))
    await user.click(within(form).getByRole('radio', { name: /צפוף/ }))
    await user.click(save)

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    const body = api.sent('PUT', '/api/admin/settings')[0].body
    expect(body).toMatchObject({ font: 'elegant', shadows: 'soft', spacing: 'compact', kashrutText: 'נשמר בינתיים' })
    for (const key of ['style', 'corners', 'palette', 'customColors', 'lineWidth']) expect(body).not.toHaveProperty(key)
  })
})

describe('General settings', () => {
  it('saves delivery, kashrut and payment details', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    await user.click(within(form).getByLabelText('איסוף עצמי'))
    await user.type(within(form).getByLabelText('טקסט כשרות'), 'בהשגחת הרב')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toEqual({
      deliveryEnabled: true,
      pickupEnabled: false,
      deliveryAreaText: 'חיפה',
      deliveryFeeText: null,
      deliveryFeeAmount: null,
      deliveryBaseFee: null,
      deliveryDiscountMinOrder: null,
      deliveryPricing: 'simple',
      kashrutText: 'בהשגחת הרב',
      paymentPhone: '050-1234567',
      bitEnabled: true,
      payBoxEnabled: true,
      bitLink: null,
      payBoxLink: null,
      minimumOrderAmount: null,
      minimumOrderAppliesToPickup: true,
      addressFirst: false,
      serviceCities: 'אשקלון',
      ordersPerHour: null,
      portionsPerSupplyDate: null,
      ownerEmail: '',
      ownerChangeMails: false,
    })
  })

  it('saves the owner mail address', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    await user.type(within(form).getByLabelText('כתובת מייל לעדכונים'), 'owner@example.com')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ ownerEmail: 'owner@example.com' })
  })

  it('saves several owner addresses and the choice to be mailed about changes, off by default', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    const changes = within(form).getByRole('checkbox', { name: 'שליחת מייל גם על עדכון פריט באתר' })
    expect(changes).not.toBeChecked()
    await user.type(within(form).getByLabelText('כתובת מייל לעדכונים'), 'a@example.com, b@example.com')
    await user.click(changes)
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ ownerEmail: 'a@example.com, b@example.com', ownerChangeMails: true })
  })

  it('saves the service cities as typed', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    const cities = within(form).getByLabelText('ערי משלוח')
    expect(cities).toHaveValue('אשקלון')
    await user.type(cities, ', אשדוד')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ serviceCities: 'אשקלון, אשדוד' })
  })

  it('saves the minimum order amount, and clearing it sends null', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    const minimum = within(form).getByLabelText('מינימום להזמנה (₪)')
    expect(minimum).toHaveValue(null)
    await user.type(minimum, '120')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ minimumOrderAmount: 120 })

    await user.clear(minimum)
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    await vi.waitFor(() => expect(api.sent('PUT', '/api/admin/settings')).toHaveLength(2))
    expect(api.sent('PUT', '/api/admin/settings')[1].body).toMatchObject({ minimumOrderAmount: null })
  })

  it('lets the admin keep the minimum for deliveries only', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    const appliesToPickup = within(form).getByLabelText('המינימום חל גם על איסוף עצמי')
    expect(appliesToPickup).toBeChecked()
    await user.click(appliesToPickup)
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ minimumOrderAppliesToPickup: false })

    await user.click(within(form).getByLabelText('איסוף עצמי'))
    expect(within(form).queryByLabelText('המינימום חל גם על איסוף עצמי')).not.toBeInTheDocument()
  })

  it('shows field errors from the server in Hebrew', async () => {
    fakeApi({ ...base, 'PUT /api/admin/settings': () => invalid({ PaymentPhone: ['phone'] }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    const phone = within(form).getByLabelText('מספר טלפון ל־Bit / PayBox')
    await waitFor(() => expect(phone).toHaveAccessibleDescription('מספר הטלפון לא תקין.'))
  })

  it('brings the admin to the first field the server refused', async () => {
    // jsdom has no scrollIntoView.
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    try {
      fakeApi({ ...base, 'PUT /api/admin/settings': () => invalid({ PaymentPhone: ['phone'] }) })
      renderAt('/admin/settings')
      const user = userEvent.setup()
      const form = await section('משלוח, כשרות ותשלום')

      await user.click(within(form).getByRole('button', { name: 'שמירה' }))

      const phone = within(form).getByLabelText('מספר טלפון ל־Bit / PayBox')
      await waitFor(() => expect(phone).toHaveFocus())
      expect(scrolled.mock.contexts).toEqual([phone])
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })

  it('saves supply days with their cutoff, starting the week on Sunday', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/supply-days': (_, body) => body })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const days = await section('ימי אספקה')

    const boxes = within(days).getAllByRole('checkbox')
    expect(boxes.map((b) => b.parentElement?.textContent)).toEqual(['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'])

    await user.selectOptions(within(days).getByLabelText('יום סגירה לשישי'), 'Wednesday')
    await user.click(within(days).getByLabelText('שלישי'))
    await user.click(within(days).getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    const sent = api.sent('PUT', '/api/admin/supply-days')[0].body as SupplyDay[]
    expect(sent.find((d) => d.weekday === 'Friday')).toMatchObject({ enabled: true, cutoffDay: 'Wednesday', cutoffTime: '20:00:00' })
    expect(sent.find((d) => d.weekday === 'Tuesday')?.enabled).toBe(true)
  })

  it('saves supply hours for a day', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/supply-days': (_, body) => body })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const days = await section('ימי אספקה')

    await user.type(within(days).getByLabelText('שעת התחלה לשישי'), '08:00')
    await user.type(within(days).getByLabelText('שעת סיום לשישי'), '14:00')
    await user.click(within(days).getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    const sent = api.sent('PUT', '/api/admin/supply-days')[0].body as SupplyDay[]
    expect(sent.find((d) => d.weekday === 'Friday')).toMatchObject({ deliveryFrom: '08:00:00', deliveryTo: '14:00:00' })
    expect(sent.find((d) => d.weekday === 'Sunday')).toMatchObject({ deliveryFrom: null, deliveryTo: null })
  })

  it('saves how many orders can be supplied in an hour', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    await user.type(within(form).getByLabelText('הזמנות בשעה'), '3')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ ordersPerHour: 3 })
  })

  it('saves the address first setting and shows "saved" right beside the save button', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    await user.click(within(form).getByLabelText('כתובת ושיטת קבלה לפני בחירת המנות'))
    const save = within(form).getByRole('button', { name: 'שמירה' })
    await user.click(save)

    const note = await within(form).findByText('נשמר.')
    expect(note.parentElement).toBe(save.parentElement)
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ addressFirst: true })
  })

  it('saves how many portions can be ordered per supply date', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    await user.type(within(form).getByLabelText('מנות ליום אספקה'), '30')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ portionsPerSupplyDate: 30 })
  })

  it('adds and removes closed dates', async () => {
    const api = fakeApi({
      ...base,
      'POST /api/admin/closed-dates': (_, body) => ({ id: 2, ...(body as object) }),
      'DELETE /api/admin/closed-dates/(\\d+)': () => undefined,
    })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const closed = await section('תאריכים סגורים')
    expect(within(closed).getByText('14/10/2026')).toBeInTheDocument()

    await user.type(within(closed).getByLabelText('תאריך'), '2026-04-02')
    await user.type(within(closed).getByLabelText('סיבה (לא חובה)'), 'פסח')
    await user.click(within(closed).getByRole('button', { name: 'הוספה' }))
    expect(await within(closed).findByText('02/04/2026')).toBeInTheDocument()
    expect(api.sent('POST', '/api/admin/closed-dates')[0].body).toEqual({ date: '2026-04-02', reason: 'פסח' })
    // Kept in date order.
    const rows = within(closed).getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toContain('02/04/2026')

    await user.click(within(closed).getAllByRole('button', { name: 'הסרה' })[1])
    await user.click(within(closed).getByRole('button', { name: 'כן, להסיר' }))
    await waitFor(() => expect(within(closed).queryByText('14/10/2026')).not.toBeInTheDocument())
    expect(api.sent('DELETE', '/api/admin/closed-dates/1')).toHaveLength(1)
  })

  it('uploads a background picture', async () => {
    const api = fakeApi({
      ...base,
      'PUT /api/admin/settings/background': () => settings({ backgroundImageUrl: 'https://img.test/bg.jpg' }),
    })
    renderAt('/admin/appearance')
    const background = await section('תמונת רקע ראשית')

    const file = new File(['x'], 'bg.jpg', { type: 'image/jpeg' })
    await userEvent.setup().upload(within(background).getByLabelText('בחירת תמונה'), file)

    expect(await within(background).findByRole('img')).toHaveAttribute('src', 'https://img.test/bg.jpg')
    const sent = api.sent('PUT', '/api/admin/settings/background')[0]
    expect((sent.body as FormData).get('file')).toBe(file)
    expect(sent.headers['Content-Type']).toBeUndefined()
  })

  it('refuses pictures over 5 MB before uploading', async () => {
    const api = fakeApi(base)
    renderAt('/admin/appearance')
    const background = await section('תמונת רקע ראשית')

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    await userEvent.setup().upload(within(background).getByLabelText('בחירת תמונה'), big)

    expect(await within(background).findByRole('alert')).toHaveTextContent('התמונה גדולה מ־5MB.')
    expect(api.sent('PUT', '/api/admin/settings/background')).toHaveLength(0)
  })

  it('explains when picture uploads are not configured', async () => {
    fakeApi({ ...base, 'PUT /api/admin/settings/background': () => ({ status: 503, body: { code: 'imageStoreUnavailable' } }) })
    renderAt('/admin/appearance')
    const background = await section('תמונת רקע ראשית')

    await userEvent.setup().upload(within(background).getByLabelText('בחירת תמונה'), new File(['x'], 'a.png', { type: 'image/png' }))

    expect(await within(background).findByRole('alert')).toHaveTextContent('Cloudinary לא מוגדר')
  })
})

describe('Admin password', () => {
  it('changes the password and clears the form', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/password': () => undefined })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('סיסמת בעל העסק')

    await user.type(within(form).getByLabelText('הסיסמה הנוכחית'), 'old-secret')
    await user.type(within(form).getByLabelText('סיסמה חדשה'), 'new-secret-1')
    await user.click(within(form).getByRole('button', { name: 'שינוי סיסמה' }))

    expect(await within(form).findByRole('status')).toHaveTextContent('הסיסמה שונתה.')
    expect(api.sent('PUT', '/api/admin/password')[0].body).toEqual({
      currentPassword: 'old-secret',
      newPassword: 'new-secret-1',
    })
    expect(within(form).getByLabelText('הסיסמה הנוכחית')).toHaveValue('')
    expect(within(form).getByLabelText('סיסמה חדשה')).toHaveValue('')
  })

  it('shows which field is wrong', async () => {
    fakeApi({ ...base, 'PUT /api/admin/password': () => invalid({ currentPassword: ['wrongPassword'] }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('סיסמת בעל העסק')

    await user.type(within(form).getByLabelText('הסיסמה הנוכחית'), 'guess')
    await user.type(within(form).getByLabelText('סיסמה חדשה'), 'new-secret-1')
    await user.click(within(form).getByRole('button', { name: 'שינוי סיסמה' }))

    expect(await within(form).findByText('הסיסמה שגויה.')).toBeInTheDocument()
    expect(within(form).getByLabelText('סיסמה חדשה')).toHaveValue('new-secret-1')
  })

  it('lets the master set a new owner password without the current one', async () => {
    const api = fakeApi({ ...base, ...masterSession, 'PUT /api/admin/owner-password': () => undefined })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('סיסמת בעל העסק')

    expect(within(form).queryByLabelText('הסיסמה הנוכחית')).not.toBeInTheDocument()
    await user.type(within(form).getByLabelText('סיסמה חדשה'), 'owner-forgot-it')
    await user.click(within(form).getByRole('button', { name: 'הגדרת סיסמה חדשה' }))

    expect(await within(form).findByRole('status')).toHaveTextContent('לבעל העסק הוגדרה סיסמה חדשה.')
    expect(api.sent('PUT', '/api/admin/owner-password')[0].body).toEqual({ newPassword: 'owner-forgot-it' })
    expect(api.sent('PUT', '/api/admin/password')).toHaveLength(0)
  })
})

describe('Console token', () => {
  it('is not shown to the owner', async () => {
    fakeApi(base)
    renderAt('/admin/settings')
    await section('סיסמת בעל העסק')
    expect(screen.queryByRole('region', { name: 'חיבור למסוף הניהול' })).not.toBeInTheDocument()
  })

  it('lets the master make a token, shown once, and revoke it', async () => {
    const api = fakeApi({
      ...base,
      ...masterSession,
      'GET /api/admin/ops-token': () => ({ createdAt: null }),
      'POST /api/admin/ops-token': () => ({ token: 'fso_secret-token', createdAt: '2026-10-11T09:00:00Z' }),
      'DELETE /api/admin/ops-token': () => undefined,
    })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const region = await section('חיבור למסוף הניהול')

    expect(within(region).getByText('אין מפתח. מסוף הניהול לא יכול להתחבר לאתר.')).toBeInTheDocument()
    await user.click(within(region).getByRole('button', { name: 'יצירת מפתח' }))

    expect(await within(region).findByLabelText('המפתח')).toHaveValue('fso_secret-token')
    expect(within(region).getByText(/יש מפתח פעיל מ-/)).toBeInTheDocument()
    expect(api.sent('POST', '/api/admin/ops-token')).toHaveLength(1)

    await user.click(within(region).getByRole('button', { name: 'ביטול המפתח' }))
    await user.click(await within(region).findByRole('button', { name: 'כן, לבטל' }))

    expect(await within(region).findByText('אין מפתח. מסוף הניהול לא יכול להתחבר לאתר.')).toBeInTheDocument()
    expect(within(region).queryByLabelText('המפתח')).not.toBeInTheDocument()
    expect(api.sent('DELETE', '/api/admin/ops-token')).toHaveLength(1)
  })

  it('asks before replacing a token the console uses', async () => {
    const api = fakeApi({
      ...base,
      ...masterSession,
      'GET /api/admin/ops-token': () => ({ createdAt: '2026-10-01T09:00:00Z' }),
      'POST /api/admin/ops-token': () => ({ token: 'fso_new', createdAt: '2026-10-11T09:00:00Z' }),
    })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const region = await section('חיבור למסוף הניהול')

    await user.click(within(region).getByRole('button', { name: 'יצירת מפתח חדש' }))
    expect(within(region).getByText(/מפתח חדש מבטל את הקודם/)).toBeInTheDocument()
    expect(api.sent('POST', '/api/admin/ops-token')).toHaveLength(0)
    await user.click(within(region).getByRole('button', { name: 'כן, ליצור מפתח חדש' }))

    expect(await within(region).findByLabelText('המפתח')).toHaveValue('fso_new')
  })
})

describe('Social links', () => {
  it('saves the filled links and refuses an address that is not https beside its field', async () => {
    let links: unknown[] = []
    const api = fakeApi({
      ...base,
      'GET /api/admin/social-links': () => links,
      'PUT /api/admin/social-links': (_, body) => {
        const sent = (body as { links: { kind: string; url: string }[] }).links
        const bad = sent.findIndex((l) => !l.url.startsWith('https://'))
        if (bad >= 0) return invalid({ [`links[${bad}].url`]: ['link'] })
        return (links = sent)
      },
    })
    renderAt('/admin/social')
    const user = userEvent.setup()
    const form = await section('קישורים לרשתות חברתיות')

    const save = within(form).getByRole('button', { name: 'שמירה' })
    expect(save).toBeDisabled()
    await user.type(within(form).getByLabelText('פייסבוק'), 'http://facebook.com/shop')
    await user.click(within(form).getByRole('button', { name: 'הוספת קישור' }))
    await user.type(within(form).getByLabelText('שם הכפתור'), 'האתר שלנו')
    await user.type(within(form).getByLabelText('כתובת'), 'https://example.com/shop')
    await user.click(save)

    expect(await within(form).findByText('הקישור צריך להתחיל ב־https://')).toBeInTheDocument()
    expect(within(form).getByLabelText('פייסבוק')).toHaveAttribute('aria-describedby', 'social-facebook-error')

    await user.clear(within(form).getByLabelText('פייסבוק'))
    await user.type(within(form).getByLabelText('פייסבוק'), 'https://facebook.com/shop')
    await user.click(save)

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/social-links').at(-1)?.body).toEqual({
      links: [
        { kind: 'facebook', label: null, url: 'https://facebook.com/shop' },
        { kind: 'custom', label: 'האתר שלנו', url: 'https://example.com/shop' },
      ],
    })
  })

  it('leaves out a field that was emptied', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/admin/social-links': () => [{ kind: 'instagram', label: null, url: 'https://instagram.com/shop' }],
      'PUT /api/admin/social-links': (_, body) => (body as { links: unknown[] }).links,
    })
    renderAt('/admin/social')
    const user = userEvent.setup()
    const form = await section('קישורים לרשתות חברתיות')

    await user.clear(within(form).getByLabelText('אינסטגרם'))
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect(api.sent('PUT', '/api/admin/social-links')[0].body).toEqual({ links: [] })
  })
})

describe('Entry pop-up', () => {
  const open = (extra: Parameters<typeof fakeApi>[0] = {}) => {
    let saved = popup()
    const api = fakeApi({
      ...base,
      'GET /api/admin/popup': () => ({ body: saved }),
      'PUT /api/admin/popup': (_, input) => ({ body: (saved = { ...saved, ...(input as object) }) }),
      ...extra,
    })
    renderAt('/admin/popup')
    return api
  }

  it('saves the size, title, text and button', async () => {
    const api = open()
    const user = userEvent.setup()
    const form = await section('פופ-אפ בכניסה לאתר')

    expect(within(form).getByRole('button', { name: 'שמירה' })).toBeDisabled()
    expect(within(form).getByRole('radio', { name: /בינוני/ })).toBeChecked()
    await user.click(within(form).getByRole('checkbox', { name: 'להציג את הפופ-אפ באתר' }))
    await user.click(within(form).getByRole('radio', { name: /גדול/ }))
    await user.click(within(form).getByRole('radio', { name: /פעם אחת בביקור/ }))
    await user.click(within(form).getByRole('radio', { name: /כשהלקוח עומד לעזוב/ }))
    await user.clear(within(form).getByLabelText('כמה שניות לחכות לפני שמתחילים לזהות יציאה'))
    await user.type(within(form).getByLabelText('כמה שניות לחכות לפני שמתחילים לזהות יציאה'), '8')
    await user.type(within(form).getByLabelText('כותרת'), 'מבצע חג')
    await user.type(within(form).getByLabelText('תוכן'), '10% הנחה')
    await user.type(within(form).getByLabelText('תוכן הכפתור'), 'להזמנה')
    await user.type(within(form).getByLabelText('קישור'), 'https://example.com/sale')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/popup')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/popup')[0].body).toEqual({
      enabled: true,
      size: 'large',
      frequency: 'session',
      trigger: 'exit',
      delaySeconds: 8,
      title: 'מבצע חג',
      body: '10% הנחה',
      buttonText: 'להזמנה',
      buttonUrl: 'https://example.com/sale',
    })
    expect(await within(form).findByText('נשמר.')).toBeInTheDocument()
  })

  it('shows what the server refused beside the field', async () => {
    open({ 'PUT /api/admin/popup': () => invalid({ title: ['required'] }) })
    const user = userEvent.setup()
    const form = await section('פופ-אפ בכניסה לאתר')
    await user.click(within(form).getByRole('checkbox', { name: 'להציג את הפופ-אפ באתר' }))
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await within(form).findByText('שדה חובה.')).toBeInTheDocument()
  })

  it('uploads a picture without touching what is typed', async () => {
    const api = open({ 'PUT /api/admin/popup/image': () => ({ body: popup({ imageUrl: 'https://img.test/popup.jpg' }) }) })
    const user = userEvent.setup()
    const form = await section('פופ-אפ בכניסה לאתר')
    await user.type(within(form).getByLabelText('כותרת'), 'מבצע')

    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
    await user.upload(within(form).getByLabelText('בחירת תמונה'), file)

    expect(await within(form).findByRole('img')).toHaveAttribute('src', 'https://img.test/popup.jpg')
    expect((api.sent('PUT', '/api/admin/popup/image')[0].body as FormData).get('file')).toBe(file)
    expect(within(form).getByLabelText('כותרת')).toHaveValue('מבצע')
  })

  it('previews the pop-up with what is typed so far', async () => {
    open()
    const user = userEvent.setup()
    const form = await section('פופ-אפ בכניסה לאתר')
    await user.type(within(form).getByLabelText('כותרת'), 'מבצע חג')
    await user.click(within(form).getByRole('button', { name: 'תצוגה מקדימה' }))
    expect(await screen.findByRole('dialog', { name: 'מבצע חג' })).toBeInTheDocument()
  })
})
