import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Feedback } from '../../api/admin'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const sent: Feedback = {
  id: 1,
  kind: 'Comment',
  text: 'אפשר להוסיף שדה לאלרגנים?',
  page: '/admin/dishes',
  actor: 'owner',
  createdAt: '2026-10-10T08:00:00Z',
  isHandled: true,
}

describe('report a problem / comment', () => {
  it('sends a problem with the screen it is about and lists it as waiting', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/feedback': () => [sent],
      'POST /api/admin/feedback': (_, body) => ({
        ...(body as object), id: 2, actor: 'owner', createdAt: '2026-10-11T09:00:00Z', isHandled: false,
      }),
    })
    renderAt('/admin/feedback')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'דיווח על בעיה או הערה' })).toBeInTheDocument()
    const history = await screen.findByRole('region', { name: 'דיווחים ששלחתם' })
    expect(await within(history).findByText('אפשר להוסיף שדה לאלרגנים?')).toBeInTheDocument()
    expect(within(history).getByText('טופל')).toBeInTheDocument()
    expect(within(history).getByText('מנות')).toBeInTheDocument()

    const form = screen.getByRole('region', { name: 'דיווח חדש' })
    const send = within(form).getByRole('button', { name: 'שליחה' })
    expect(send).toBeDisabled()
    expect(within(form).getByRole('radio', { name: 'בעיה' })).toBeChecked()
    await user.selectOptions(within(form).getByLabelText('באיזה מסך? (לא חובה)'), 'הזמנות')
    await user.type(within(form).getByLabelText('מה קרה, או מה הייתם רוצים?'), 'ההדפסה נחתכת')
    await user.click(send)

    expect(await screen.findByText('הדיווח נשלח. תודה!')).toBeInTheDocument()
    expect(api.sent('POST', '/api/admin/feedback')[0].body).toEqual({ kind: 'Problem', text: 'ההדפסה נחתכת', page: '/admin/orders' })
    const items = within(history).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('ההדפסה נחתכת')
    expect(items[0]).toHaveTextContent('ממתין לטיפול')
    expect(within(form).getByLabelText('מה קרה, או מה הייתם רוצים?')).toHaveValue('')
  })

  it('shows the field error the API returns', async () => {
    fakeApi({
      ...adminSession,
      'GET /api/admin/feedback': () => [],
      'POST /api/admin/feedback': () => invalid({ text: ['tooLong'] }),
    })
    renderAt('/admin/feedback')
    const user = userEvent.setup()
    const form = await screen.findByRole('region', { name: 'דיווח חדש' })

    await user.click(within(form).getByRole('radio', { name: 'הערה או בקשה' }))
    await user.type(within(form).getByLabelText('מה קרה, או מה הייתם רוצים?'), 'הרבה טקסט')
    await user.click(within(form).getByRole('button', { name: 'שליחה' }))

    expect(await within(form).findByText('הטקסט ארוך מדי.')).toBeInTheDocument()
    expect(await screen.findByText('עוד לא נשלחו דיווחים.')).toBeInTheDocument()
  })
})
