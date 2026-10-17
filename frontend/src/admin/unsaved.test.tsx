import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Contact } from '../api/site'
import { adminSession, fakeApi, invalid } from '../test/fakeApi'
import { renderAt } from '../test/render'

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
  'GET /api/admin/notify-phones': () => [],
  'GET /api/admin/categories': () => [],
}

async function editAddress(text: string) {
  const user = userEvent.setup()
  const region = await screen.findByRole('region', { name: 'איש קשר ראשי' })
  await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())
  await user.type(within(region).getByLabelText('כתובת (לא חובה)'), text)
  return user
}

const categoriesLink = () => within(screen.getByRole('navigation', { name: 'תצוגה באתר לקוח' })).getByRole('link', { name: 'קטגוריות' })

describe('Unsaved changes in the admin', () => {
  it('leaves at once when nothing was changed', async () => {
    fakeApi(base)
    renderAt('/admin/contacts')
    const user = userEvent.setup()
    await screen.findByRole('region', { name: 'איש קשר ראשי' })
    await user.click(categoriesLink())
    expect(await screen.findByRole('heading', { level: 1, name: 'קטגוריות' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before leaving, and stays when the admin chooses to', async () => {
    fakeApi(base)
    renderAt('/admin/contacts')
    const user = await editAddress('חיפה')
    await user.click(categoriesLink())

    const dialog = screen.getByRole('dialog', { name: 'יש שינויים שלא נשמרו' })
    await user.click(within(dialog).getByRole('button', { name: 'להישאר כאן' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'אנשי קשר' })).toBeInTheDocument()
  })

  it('saves every change and goes on when the admin says yes', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/contact': (_, body) => body })
    renderAt('/admin/contacts')
    const user = await editAddress('חיפה')
    await user.click(categoriesLink())

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'כן, לשמור ולעבור' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'קטגוריות' })).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/contact')[0].body).toEqual(contact({ address: 'חיפה' }))
  })

  it('goes on without saving when the admin says no', async () => {
    const api = fakeApi(base)
    renderAt('/admin/contacts')
    const user = await editAddress('חיפה')
    await user.click(categoriesLink())

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'לא, לעבור בלי לשמור' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'קטגוריות' })).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/contact')).toHaveLength(0)
  })

  it('stays when the changes cannot be saved', async () => {
    fakeApi({ ...base, 'PUT /api/admin/contact': () => invalid({ Phone: ['phone'] }) })
    renderAt('/admin/contacts')
    const user = await editAddress('חיפה')
    await user.click(categoriesLink())

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'כן, לשמור ולעבור' }))
    expect(await screen.findByText(/לא הצלחנו לשמור את כל השינויים/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'קטגוריות' })).not.toBeInTheDocument()
  })

  it('does not ask again once the changes are saved', async () => {
    fakeApi({ ...base, 'PUT /api/admin/contact': (_, body) => body })
    renderAt('/admin/contacts')
    const user = await editAddress('חיפה')
    await user.click(screen.getByRole('button', { name: 'שמירה' }))
    await screen.findByText('נשמר.')
    await user.click(categoriesLink())
    expect(await screen.findByRole('heading', { level: 1, name: 'קטגוריות' })).toBeInTheDocument()
  })
})
