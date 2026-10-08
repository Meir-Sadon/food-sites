import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SupplyDay } from '../../api/catalog'
import { settings, supplyDays } from '../../test/catalogData'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const base = {
  ...adminSession,
  'GET /api/admin/settings': () => settings(),
  'GET /api/admin/supply-days': () => supplyDays(),
  'GET /api/admin/closed-dates': () => [{ id: 1, date: '2026-10-14', reason: 'סוכות' }],
}

/** A settings section once its data has loaded. */
async function section(name: string) {
  const region = await screen.findByRole('region', { name })
  await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())
  return region
}

describe('General settings', () => {
  it('saves delivery, kashrut and payment details', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings': (_, body) => ({ ...settings(), ...(body as object) }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await section('משלוח, כשרות ותשלום')

    await user.click(within(form).getByLabelText('איסוף עצמי'))
    await user.type(within(form).getByLabelText('טקסט כשרות'), 'בהשגחת הרב')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    expect(await within(form).findByRole('status')).toHaveTextContent('נשמר.')
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toEqual({
      deliveryEnabled: true,
      pickupEnabled: false,
      deliveryAreaText: 'חיפה',
      deliveryFeeText: null,
      kashrutText: 'בהשגחת הרב',
      paymentPhone: '050-1234567',
      minimumOrderAmount: null,
      minimumOrderAppliesToPickup: true,
      serviceCities: 'אשקלון',
    })
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
    expect(await within(form).findByRole('status')).toHaveTextContent('נשמר.')
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
    expect(await within(form).findByRole('status')).toHaveTextContent('נשמר.')
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
    expect(await within(form).findByRole('status')).toHaveTextContent('נשמר.')
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

    await within(days).findByText('נשמר.')
    const sent = api.sent('PUT', '/api/admin/supply-days')[0].body as SupplyDay[]
    expect(sent.find((d) => d.weekday === 'Friday')).toMatchObject({ enabled: true, cutoffDay: 'Wednesday', cutoffTime: '20:00:00' })
    expect(sent.find((d) => d.weekday === 'Tuesday')?.enabled).toBe(true)
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
    renderAt('/admin/settings')
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
    renderAt('/admin/settings')
    const background = await section('תמונת רקע ראשית')

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    await userEvent.setup().upload(within(background).getByLabelText('בחירת תמונה'), big)

    expect(await within(background).findByRole('alert')).toHaveTextContent('התמונה גדולה מ־5MB.')
    expect(api.sent('PUT', '/api/admin/settings/background')).toHaveLength(0)
  })

  it('explains when picture uploads are not configured', async () => {
    fakeApi({ ...base, 'PUT /api/admin/settings/background': () => ({ status: 503, body: { code: 'imageStoreUnavailable' } }) })
    renderAt('/admin/settings')
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
    const form = await section('סיסמת מנהל')

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
    const form = await section('סיסמת מנהל')

    await user.type(within(form).getByLabelText('הסיסמה הנוכחית'), 'guess')
    await user.type(within(form).getByLabelText('סיסמה חדשה'), 'new-secret-1')
    await user.click(within(form).getByRole('button', { name: 'שינוי סיסמה' }))

    expect(await within(form).findByText('הסיסמה שגויה.')).toBeInTheDocument()
    expect(within(form).getByLabelText('סיסמה חדשה')).toHaveValue('new-secret-1')
  })
})
