import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../api/account'
import { publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

// Google's own button needs its script and a browser; stand in for it with one that hands over a credential.
vi.mock('../account/GoogleSignInButton', () => ({
  GoogleSignInButton: ({ onCredential }: { onCredential: (credential: string) => void }) => (
    <button type="button" onClick={() => onCredential('google-token')}>
      Google
    </button>
  ),
}))

const profile: Profile = {
  id: 1, phone: '0501234567', fullName: 'דנה כהן', city: 'חיפה', street: 'הרצל', houseNumber: '1',
  apartment: '', address: 'הרצל 1, חיפה', email: 'dana@gmail.com', birthday: null, ethnicBackground: null,
}

const guest = { 'GET /api/account/me': () => ({ status: 401, body: {} }) }

type Routes = Parameters<typeof fakeApi>[0]
const open = (routes: Record<string, unknown>, googleClientId: string | null = 'client-id') => {
  const api = fakeApi({
    ...publicApi,
    'GET /api/site': () => site({ googleClientId }),
    ...guest,
    ...routes,
  } as Routes)
  renderAt('/login')
  return { api, user: userEvent.setup() }
}

beforeEach(() => localStorage.clear())

describe('Sign in with Google', () => {
  it('is hidden while the site has no Google client id', async () => {
    open({}, null)
    await screen.findByRole('heading', { name: 'התחברות' })
    expect(screen.queryByRole('button', { name: 'Google' })).not.toBeInTheDocument()
  })

  it('logs in a client Google already knows', async () => {
    const { api, user } = open({ 'POST /api/account/google': () => ({ profile, registration: null }) })
    await user.click(await screen.findByRole('button', { name: 'Google' }))

    await screen.findByRole('heading', { level: 1, name: 'הזמנה' })
    expect(api.sent('POST', '/api/account/google')[0].body).toEqual({ credential: 'google-token' })
  })

  it('asks a new person for phone and address, prefilled from Google, then registers with the token', async () => {
    const { api, user } = open({
      'POST /api/account/google': () => ({ profile: null, registration: { fullName: 'Dana Cohen', email: 'dana@gmail.com' } }),
      'POST /api/account/google/register': () => profile,
    })
    await user.click(await screen.findByRole('button', { name: 'Google' }))

    await screen.findByRole('heading', { name: 'הרשמה' })
    expect(screen.getByLabelText('שם מלא')).toHaveValue('Dana Cohen')
    expect(screen.getByLabelText(/אימייל/)).toHaveValue('dana@gmail.com')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    await screen.findByRole('heading', { level: 1, name: 'הזמנה' })
    expect(api.sent('POST', '/api/account/google/register')[0].body).toMatchObject({
      credential: 'google-token',
      profile: { phone: '0501234567', fullName: 'Dana Cohen', email: 'dana@gmail.com', street: 'הרצל' },
    })
  })
})
