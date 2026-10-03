import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { category } from '../../test/catalogData'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const list = [category(1, 'בשרים', 2), category(2, 'תוספות', 0)]

/** Rows of the categories list (the admin tab bar has list items too). */
const rows = async () => within(await screen.findByRole('main')).findAllByRole('listitem')
const names = () => within(screen.getByRole('main')).getAllByRole('listitem').map((r) => r.querySelector('strong')?.textContent)

describe('Categories', () => {
  it('lists categories in order with their dish count', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/categories': () => list })
    renderAt('/admin/categories')

    const [meat, sides] = await rows()
    expect(names()).toEqual(['בשרים', 'תוספות'])
    expect(meat).toHaveTextContent('2 מנות')
    expect(within(meat).getByRole('button', { name: 'העברה למעלה: בשרים' })).toBeDisabled()
    expect(within(sides).getByRole('button', { name: 'העברה למטה: תוספות' })).toBeDisabled()
  })

  it('adds a category and shows a duplicate name error', async () => {
    let calls = 0
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/categories': () => list,
      'POST /api/admin/categories': () => (++calls === 1 ? category(3, 'סלטים') : invalid({ name: ['duplicate'] })),
    })
    renderAt('/admin/categories')
    const user = userEvent.setup()
    const input = await screen.findByLabelText('קטגוריה חדשה')

    await user.type(input, 'סלטים')
    await user.click(screen.getByRole('button', { name: 'הוספה' }))
    expect(await screen.findByText('סלטים')).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(api.sent('POST', '/api/admin/categories')[0].body).toEqual({ name: 'סלטים' })

    await user.type(input, 'סלטים')
    await user.click(screen.getByRole('button', { name: 'הוספה' }))
    await waitFor(() => expect(input).toHaveAccessibleDescription('כבר קיים.'))
  })

  it('moves a category up', async () => {
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/categories': () => list,
      'POST /api/admin/categories/2/move': () => [list[1], list[0]],
    })
    renderAt('/admin/categories')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'העברה למעלה: תוספות' }))

    await waitFor(() => expect(names()).toEqual(['תוספות', 'בשרים']))
    expect(api.sent('POST', '/move')[0].body).toEqual({ direction: 'Up' })
  })

  it('renames a category', async () => {
    let name = 'תוספות'
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/categories': () => [list[0], { ...list[1], name }],
      'PUT /api/admin/categories/2': (_, body) => {
        name = (body as { name: string }).name
        return undefined
      },
    })
    renderAt('/admin/categories')
    const user = userEvent.setup()
    const row = (await rows())[1]

    await user.click(within(row).getByRole('button', { name: 'שינוי שם' }))
    const input = screen.getByLabelText('שם הקטגוריה')
    await user.clear(input)
    await user.type(input, 'תוספות חמות')
    await user.click(screen.getByRole('button', { name: 'שמירה' }))

    expect(await screen.findByText('תוספות חמות')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/categories/2')[0].body).toEqual({ name: 'תוספות חמות' })
  })

  it('asks before removing, and explains when the category still has dishes', async () => {
    fakeApi({
      ...adminSession,
      'GET /api/admin/categories': () => list,
      'DELETE /api/admin/categories/1': () => ({ status: 409, body: { code: 'categoryNotEmpty' } }),
      'DELETE /api/admin/categories/2': () => undefined,
    })
    renderAt('/admin/categories')
    const user = userEvent.setup()
    const [meat, sides] = await rows()

    await user.click(within(meat).getByRole('button', { name: 'הסרה' }))
    expect(within(meat).getByText('להסיר את "בשרים"?')).toBeInTheDocument()
    await user.click(within(meat).getByRole('button', { name: 'כן, להסיר' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('בקטגוריה יש מנות')

    await user.click(within(sides).getByRole('button', { name: 'הסרה' }))
    await user.click(within(sides).getByRole('button', { name: 'כן, להסיר' }))
    await waitFor(() => expect(screen.queryByText('תוספות')).not.toBeInTheDocument())
  })
})
