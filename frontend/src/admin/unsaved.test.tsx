import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { popup, settings, supplyDays } from '../test/catalogData'
import { adminSession, fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'
import { openSection } from '../test/sections'

function open() {
  let saved = settings()
  const api = fakeApi({
    ...adminSession,
    'GET /api/admin/settings': () => saved,
    'PUT /api/admin/settings': (_, body) => (saved = { ...saved, ...(body as object) }),
    'GET /api/admin/supply-days': () => supplyDays(),
    'GET /api/admin/closed-dates': () => [],
    'GET /api/admin/categories': () => [],
    'GET /api/admin/popup': () => ({ body: popup() }),
  })
  renderAt('/admin/appearance')
  return { api, user: userEvent.setup() }
}

async function pickStreetStyle(user: ReturnType<typeof userEvent.setup>) {
  const region = await openSection('סגנון האתר')
  await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())
  await user.click(within(region).getByRole('radio', { name: /דוכן רחוב/ }))
}

const categoriesLink = () => screen.getByRole('link', { name: 'קטגוריות' })

describe('Leaving an admin page with unsaved changes', () => {
  it('goes straight on when nothing was changed', async () => {
    const { user } = open()
    await screen.findByRole('region', { name: 'סגנון האתר' })
    await user.click(categoriesLink())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'קטגוריות' })).toBeInTheDocument()
  })

  it('asks first, and stays on the page when the admin chooses to stay', async () => {
    const { api, user } = open()
    await pickStreetStyle(user)
    await user.click(categoriesLink())

    const dialog = screen.getByRole('dialog', { name: 'יש שינויים שלא נשמרו' })
    await user.click(within(dialog).getByRole('button', { name: 'להישאר כאן' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /דוכן רחוב/ })).toBeChecked()
    expect(api.sent('PUT', '/api/admin/settings')).toHaveLength(0)
  })

  it('saves everything that was changed and then moves on when the admin says yes', async () => {
    const { api, user } = open()
    await pickStreetStyle(user)
    await user.click(categoriesLink())
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'כן, לשמור ולהמשיך' }))

    expect(await screen.findByRole('heading', { name: 'קטגוריות' })).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ style: 'street' })
  })

  it('moves on without saving when the admin says so', async () => {
    const { api, user } = open()
    await pickStreetStyle(user)
    await user.click(categoriesLink())
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'להמשיך בלי לשמור' }))

    expect(await screen.findByRole('heading', { name: 'קטגוריות' })).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings')).toHaveLength(0)
  })

  it('does not ask again once the changes were saved with the form', async () => {
    const { user } = open()
    await pickStreetStyle(user)
    const region = screen.getByRole('region', { name: 'סגנון האתר' })
    await user.click(within(region).getByRole('button', { name: 'שמירה' }))
    await screen.findByText('נשמר.')
    await user.click(categoriesLink())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
