import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { DishGroup } from '../../api/catalog'
import { category, dish } from '../../test/catalogData'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const group = (id: number, name: string, dishIds: number[]): DishGroup => ({ id, name, displayOrder: id, dishIds })

const base = {
  ...adminSession,
  'GET /api/admin/categories': () => [category(1, 'בשרים', 2), category(2, 'סלטים', 1)],
  'GET /api/admin/dishes': () => [
    dish(1, 'קבב', 1),
    dish(2, 'שיפוד', 1),
    dish(3, 'סלט חצילים', 2),
    dish(4, 'טחינה', 2, { isAddOnOnly: true }),
    dish(5, 'ישן', 2, { isHidden: true }),
  ],
}

const names = () => within(screen.getByRole('main')).getAllByRole('listitem').map((r) => r.querySelector('strong')?.textContent)

describe('Dish groups', () => {
  it('lists the groups with their dish count', async () => {
    fakeApi({ ...base, 'GET /api/admin/dish-groups': () => [group(1, 'מומלצות', [1, 3]), group(2, 'מנות במבצע', [3])] })
    renderAt('/admin/dish-groups')

    await screen.findByText('מומלצות')
    expect(names()).toEqual(['מומלצות', 'מנות במבצע'])
    expect(screen.getByText('2 מנות')).toBeInTheDocument()
    expect(screen.getByText('מנה אחת')).toBeInTheDocument()
  })

  it('adds a group with dishes ticked from several categories, offering only dishes ordered on their own', async () => {
    const api = fakeApi({ ...base, 'GET /api/admin/dish-groups': () => [], 'POST /api/admin/dish-groups': () => group(1, 'מומלצות', [1, 3]) })
    renderAt('/admin/dish-groups')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('שם הקבוצה'), 'מומלצות')
    expect(screen.queryByLabelText('טחינה')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ישן')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('קבב'))
    await user.click(screen.getByLabelText('סלט חצילים'))
    await user.click(screen.getByRole('button', { name: 'הוספה' }))

    await waitFor(() => expect(api.sent('POST', '/api/admin/dish-groups')).toHaveLength(1))
    expect(api.sent('POST', '/api/admin/dish-groups')[0].body).toEqual({ name: 'מומלצות', dishIds: [1, 3] })
  })

  it('shows a duplicate name error', async () => {
    fakeApi({ ...base, 'GET /api/admin/dish-groups': () => [], 'POST /api/admin/dish-groups': () => invalid({ name: ['duplicate'] }) })
    renderAt('/admin/dish-groups')
    const user = userEvent.setup()

    const input = await screen.findByLabelText('שם הקבוצה')
    await user.type(input, 'מומלצות')
    await user.click(screen.getByRole('button', { name: 'הוספה' }))
    await waitFor(() => expect(input).toHaveAccessibleDescription('כבר קיים.'))
  })

  it('edits a group: its ticked dishes start as saved and the change is sent whole', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/admin/dish-groups': () => [group(1, 'מומלצות', [1])],
      'PUT /api/admin/dish-groups/1': () => group(1, 'מומלצות', [2]),
    })
    renderAt('/admin/dish-groups')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'עריכה: מומלצות' }))
    const form = screen.getByRole('main').querySelector('li form') as HTMLElement
    expect(within(form).getByLabelText('קבב')).toBeChecked()
    await user.click(within(form).getByLabelText('קבב'))
    await user.click(within(form).getByLabelText('שיפוד'))
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/dish-groups/1')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/dish-groups/1')[0].body).toEqual({ name: 'מומלצות', dishIds: [2] })
  })

  it('moves a group up', async () => {
    const list = [group(1, 'מומלצות', [1]), group(2, 'מנות במבצע', [3])]
    const api = fakeApi({ ...base, 'GET /api/admin/dish-groups': () => list, 'POST /api/admin/dish-groups/2/move': () => [list[1], list[0]] })
    renderAt('/admin/dish-groups')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'העברה למעלה: מנות במבצע' }))

    await waitFor(() => expect(names()).toEqual(['מנות במבצע', 'מומלצות']))
    expect(api.sent('POST', '/move')[0].body).toEqual({ direction: 'Up' })
  })
})
