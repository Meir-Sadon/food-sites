import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Contact, NotifyPhone } from '../../api/site'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { site } from '../../test/catalogData'
import { renderAt } from '../../test/render'
import { openSection } from '../../test/sections'

const contact = (patch: Partial<Contact> = {}): Contact => ({
  name: 'אמא',
  phone: '050-1234567',
  address: null,
  email: null,
  openingHours: null,
  ...patch,
})

const base = {
  ...adminSession,
  'GET /api/admin/contact': () => contact(),
  'GET /api/admin/notify-phones': () => [{ id: 1, phone: '0521111111', name: 'דוד' }] satisfies NotifyPhone[],
}

async function section(name: string) {
  const region = await openSection(name)
  await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())
  return region
}

describe('Admin Contacts', () => {
  it('is reachable from the admin tabs', async () => {
    fakeApi(base)
    renderAt('/admin/contacts')
    expect(await screen.findByRole('heading', { level: 1, name: 'אנשי קשר' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'תצוגה באתר לקוח' })).getByRole('link', { name: 'אנשי קשר' })).toHaveAttribute(
      'href',
      '/admin/contacts',
    )
  })

  it('saves the main contact', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/contact': (_, body) => body })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const form = await section('איש קשר ראשי')

    await user.type(within(form).getByLabelText('כתובת (לא חובה)'), 'חיפה')
    await user.type(within(form).getByLabelText('שעות פעילות (לא חובה)'), 'א׳–ה׳ 9:00–17:00')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/contact')[0].body).toEqual(
      contact({ address: 'חיפה', openingHours: 'א׳–ה׳ 9:00–17:00' }),
    )
  })

  it('shows contact errors from the server in Hebrew', async () => {
    fakeApi({ ...base, 'PUT /api/admin/contact': () => invalid({ Phone: ['phone'], Email: ['email'] }) })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const form = await section('איש קשר ראשי')

    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(within(form).getByLabelText('טלפון')).toHaveAccessibleDescription('מספר הטלפון לא תקין.'))
    expect(within(form).getByLabelText('אימייל (לא חובה)')).toHaveAccessibleDescription('כתובת האימייל לא תקינה.')
  })

  it('adds and removes phones that get a WhatsApp for every new order', async () => {
    const api = fakeApi({
      ...base,
      'POST /api/admin/notify-phones': (_, body) => ({ id: 2, phone: '0522222222', name: (body as { name: string }).name }),
      'DELETE /api/admin/notify-phones/1': () => ({ status: 204 }),
    })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const list = await section("מספרים להתראות ולצ'אט בוואטסאפ")
    expect(within(list).getByText('0521111111')).toBeInTheDocument()

    await user.type(within(list).getByLabelText('טלפון'), '052-222-2222')
    await user.type(within(list).getByLabelText('שם (לא חובה)'), 'יעל')
    await user.click(within(list).getByRole('button', { name: 'הוספה' }))
    expect(await within(list).findByText('0522222222')).toBeInTheDocument()
    expect(api.sent('POST', '/api/admin/notify-phones')[0].body).toEqual({ phone: '052-222-2222', name: 'יעל', pushoverKey: '', pushoverSound: '' })

    await user.click(within(list).getAllByRole('button', { name: 'הסרה' })[0])
    await user.click(within(list).getByRole('button', { name: 'כן, להסיר' }))
    await waitFor(() => expect(within(list).queryByText('0521111111')).not.toBeInTheDocument())
  })

  it('lets the admin add a Pushover key and sound when phone alerts are on', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/site': () => site({ features: ['phoneAlerts'] }),
      'POST /api/admin/notify-phones': (_, body) => ({ id: 2, phone: '0522222222', name: null, ...(body as object) }),
    })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const list = await section("מספרים להתראות ולצ'אט בוואטסאפ")

    await user.type(within(list).getByLabelText('טלפון'), '0522222222')
    await user.type(await within(list).findByLabelText('מפתח Pushover (לא חובה)'), 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG')
    await user.selectOptions(within(list).getByLabelText('צליל ההתראה'), 'alien')
    await user.click(within(list).getByRole('button', { name: 'הוספה' }))

    expect(await within(list).findByText(/התראה בטלפון/)).toBeInTheDocument()
    expect(api.sent('POST', '/api/admin/notify-phones')[0].body).toMatchObject({
      pushoverKey: 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG',
      pushoverSound: 'alien',
    })
  })

  it('edits a phone\'s Pushover key and sound without removing it', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/site': () => site({ features: ['phoneAlerts'] }),
      'GET /api/admin/notify-phones': () => [{ id: 1, phone: '0521111111', name: 'דוד', pushoverKey: 'k'.repeat(30), pushoverSound: 'siren' }],
      'PUT /api/admin/notify-phones/1': (_, body) => ({ id: 1, ...(body as object) }),
    })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const list = await section("מספרים להתראות ולצ'אט בוואטסאפ")

    await user.click(await within(list).findByRole('button', { name: 'עריכה' }))
    const key = within(list).getByLabelText('מפתח Pushover (לא חובה)', { selector: '#edit-1-key' })
    await user.clear(key)
    await user.type(key, 'n'.repeat(30))
    await user.selectOptions(within(list).getByLabelText('צליל ההתראה', { selector: '#edit-1-sound' }), 'alien')
    await user.click(within(list).getByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(within(list).queryByRole('button', { name: 'שמירה' })).not.toBeInTheDocument())
    expect(api.sent('PUT', '/api/admin/notify-phones/1')[0].body).toEqual({
      phone: '0521111111',
      name: 'דוד',
      pushoverKey: 'n'.repeat(30),
      pushoverSound: 'alien',
    })
  })

  it('sends a test alert to a phone that has a Pushover key', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/site': () => site({ features: ['phoneAlerts'] }),
      'GET /api/admin/notify-phones': () => [{ id: 1, phone: '0521111111', name: 'דוד', pushoverKey: 'k'.repeat(30), pushoverSound: 'siren' }],
      'POST /api/admin/notify-phones/1/test': () => ({ status: 204 }),
    })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const list = await section("מספרים להתראות ולצ'אט בוואטסאפ")

    await user.click(await within(list).findByRole('button', { name: 'שליחת התראת ניסיון' }))

    expect(await within(list).findByText(/נשלחה התראת ניסיון/)).toBeInTheDocument()
    expect(api.sent('POST', '/api/admin/notify-phones/1/test')).toHaveLength(1)
  })

  it('shows why a test alert failed', async () => {
    fakeApi({
      ...base,
      'GET /api/site': () => site({ features: ['phoneAlerts'] }),
      'GET /api/admin/notify-phones': () => [{ id: 1, phone: '0521111111', name: null, pushoverKey: 'k'.repeat(30), pushoverSound: null }],
      'POST /api/admin/notify-phones/1/test': () => invalid({ PushoverKey: ['pushoverFailed'] }),
    })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const list = await section("מספרים להתראות ולצ'אט בוואטסאפ")

    await user.click(await within(list).findByRole('button', { name: 'שליחת התראת ניסיון' }))

    expect(await within(list).findByText(/שליחת ההתראה נכשלה/)).toBeInTheDocument()
  })

  it('hides the Pushover fields when phone alerts are off', async () => {
    fakeApi({ ...base, 'GET /api/site': () => site({ features: [] }) })
    renderAt('/admin/contacts')
    const list = await section("מספרים להתראות ולצ'אט בוואטסאפ")
    expect(within(list).queryByLabelText('מפתח Pushover (לא חובה)')).not.toBeInTheDocument()
  })

  it('shows a duplicate phone error', async () => {
    fakeApi({ ...base, 'POST /api/admin/notify-phones': () => invalid({ Phone: ['duplicate'] }) })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const list = await section("מספרים להתראות ולצ'אט בוואטסאפ")

    await user.type(within(list).getByLabelText('טלפון'), '0521111111')
    await user.click(within(list).getByRole('button', { name: 'הוספה' }))

    await waitFor(() => expect(within(list).getByLabelText('טלפון')).toHaveAccessibleDescription('כבר קיים.'))
  })
})
