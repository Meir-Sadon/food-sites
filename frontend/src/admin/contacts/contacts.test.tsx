import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Contact, NotifyPhone } from '../../api/site'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

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
  const region = await screen.findByRole('region', { name })
  await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())
  return region
}

describe('Admin Contacts', () => {
  it('is reachable from the admin tabs', async () => {
    fakeApi(base)
    renderAt('/admin/contacts')
    expect(await screen.findByRole('heading', { level: 1, name: 'אנשי קשר' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'תפריט ניהול' })).getByRole('link', { name: 'אנשי קשר' })).toHaveAttribute(
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

    expect(await within(form).findByRole('status')).toHaveTextContent('נשמר.')
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
    const list = await section('הודעות על הזמנות חדשות')
    expect(within(list).getByText('0521111111')).toBeInTheDocument()

    await user.type(within(list).getByLabelText('טלפון'), '052-222-2222')
    await user.type(within(list).getByLabelText('שם (לא חובה)'), 'יעל')
    await user.click(within(list).getByRole('button', { name: 'הוספה' }))
    expect(await within(list).findByText('0522222222')).toBeInTheDocument()
    expect(api.sent('POST', '/api/admin/notify-phones')[0].body).toEqual({ phone: '052-222-2222', name: 'יעל' })

    await user.click(within(list).getAllByRole('button', { name: 'הסרה' })[0])
    await user.click(within(list).getByRole('button', { name: 'כן, להסיר' }))
    await waitFor(() => expect(within(list).queryByText('0521111111')).not.toBeInTheDocument())
  })

  it('shows a duplicate phone error', async () => {
    fakeApi({ ...base, 'POST /api/admin/notify-phones': () => invalid({ Phone: ['duplicate'] }) })
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    const list = await section('הודעות על הזמנות חדשות')

    await user.type(within(list).getByLabelText('טלפון'), '0521111111')
    await user.click(within(list).getByRole('button', { name: 'הוספה' }))

    await waitFor(() => expect(within(list).getByLabelText('טלפון')).toHaveAccessibleDescription('כבר קיים.'))
  })
})
