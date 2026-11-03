import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settings, shabbatRules, site, supplyDays } from '../../test/catalogData'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'
import { openSection } from '../../test/sections'
import { browser } from './browser'

const callback = 'https://claude.ai/api/mcp/auth_callback'
const request = new URLSearchParams({
  response_type: 'code',
  client_id: 'client-1',
  redirect_uri: callback,
  state: 'state-1',
  code_challenge: 'challenge-of-at-least-forty-three-characters-x',
  code_challenge_method: 'S256',
  resource: 'http://localhost/mcp',
}).toString()

const on = {
  ...adminSession,
  'GET /api/site': () => site({ features: ['mcp'] }),
}

afterEach(() => vi.restoreAllMocks())

describe('Approving a Claude connection', () => {
  it('approves with the OAuth request and goes back to Claude with the code', async () => {
    const go = vi.spyOn(browser, 'go').mockImplementation(() => {})
    const api = fakeApi({
      ...on,
      'GET /api/admin/mcp/approval\\?.*': () => ({ clientName: 'Claude', redirectHost: 'claude.ai' }),
      'POST /api/admin/mcp/approve': () => ({ redirectUrl: `${callback}?code=fsmc_1&state=state-1` }),
    })
    renderAt(`/admin/claude-connect?${request}`)
    const user = userEvent.setup()

    expect(await screen.findByText('Claude (claude.ai) מבקש גישה לניהול האתר בשמכם, עם ההרשאות של בעל העסק.')).toBeInTheDocument()
    expect(screen.getByText(/לא לראות הזמנות, לקוחות/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'אישור החיבור' }))

    await waitFor(() => expect(go).toHaveBeenCalledWith(`${callback}?code=fsmc_1&state=state-1`))
    expect(api.sent('POST', '/api/admin/mcp/approve')[0].body).toEqual({
      clientId: 'client-1',
      redirectUri: callback,
      codeChallenge: 'challenge-of-at-least-forty-three-characters-x',
      codeChallengeMethod: 'S256',
      state: 'state-1',
      resource: 'http://localhost/mcp',
    })
  })

  it('tells Claude the admin said no', async () => {
    const go = vi.spyOn(browser, 'go').mockImplementation(() => {})
    const api = fakeApi({
      ...on,
      'GET /api/admin/mcp/approval\\?.*': () => ({ clientName: 'Claude', redirectHost: 'claude.ai' }),
    })
    renderAt(`/admin/claude-connect?${request}`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'ביטול' }))

    expect(go).toHaveBeenCalledWith(`${callback}?error=access_denied&state=state-1`)
    expect(api.sent('POST', '/api/admin/mcp/approve')).toHaveLength(0)
  })

  it('says so when the request is not valid, and offers nothing to approve', async () => {
    fakeApi({
      ...on,
      'GET /api/admin/mcp/approval\\?.*': () => invalid({ request: ['mcpInvalidRequest'] }),
    })
    renderAt(`/admin/claude-connect?${request}`)

    expect(await screen.findByText(/בקשת החיבור לא תקינה או שפג תוקפה/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'אישור החיבור' })).not.toBeInTheDocument()
  })
})

describe('Claude in the settings', () => {
  const base = {
    ...on,
    'GET /api/admin/settings': () => settings(),
    'GET /api/admin/supply-days': () => supplyDays(),
    'GET /api/admin/shabbat-rules': () => shabbatRules(),
    'GET /api/admin/closed-dates': () => [],
  }

  it('shows the address to add in Claude and disconnects an account', async () => {
    const api = fakeApi({
      ...base,
      'GET /api/admin/mcp/connections': () => [
        { id: 7, clientName: 'Claude', actor: 'owner', createdAt: '2026-11-01T09:00:00Z', lastUsedAt: null },
      ],
      'DELETE /api/admin/mcp/connections/7': () => undefined,
    })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const region = await openSection('חיבור ל-Claude')

    expect(within(region).getByLabelText('כתובת החיבור')).toHaveValue(`${window.location.origin}/mcp`)
    expect(await within(region).findByText(/Claude, אושר על ידי בעל העסק/)).toBeInTheDocument()

    await user.click(within(region).getByRole('button', { name: 'ניתוק' }))
    await user.click(await within(region).findByRole('button', { name: 'כן, לנתק' }))

    expect(await within(region).findByText('אין עדיין חשבון Claude מחובר.')).toBeInTheDocument()
    expect(api.sent('DELETE', '/api/admin/mcp/connections/7')).toHaveLength(1)
  })

  it('is not shown while the feature is off', async () => {
    fakeApi({ ...base, 'GET /api/site': () => site({ features: [] }) })
    renderAt('/admin/settings')
    await openSection('סיסמת בעל העסק')
    expect(screen.queryByRole('region', { name: 'חיבור ל-Claude' })).not.toBeInTheDocument()
  })
})
