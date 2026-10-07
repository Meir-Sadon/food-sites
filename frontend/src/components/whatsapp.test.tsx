import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

describe('WhatsApp button', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens a chat with one of the configured phones and the starter message', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ whatsAppPhones: ['050-1234567'] }) })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderAt('/about')
    await userEvent.click(await screen.findByRole('button', { name: 'שלחו הודעה בוואטסאפ' }))
    const url = open.mock.calls[0][0] as string
    expect(url.startsWith('https://wa.me/972501234567?text=')).toBe(true)
    expect(decodeURIComponent(url)).toContain('היי, בקשר להזמנות של "הקוסקוס של אמא", רציתי לשאול')
  })

  it('is hidden without phones', async () => {
    fakeApi({ ...publicApi })
    renderAt('/about')
    await screen.findByText('אודות', { selector: 'a' })
    expect(screen.queryByRole('button', { name: 'שלחו הודעה בוואטסאפ' })).toBeNull()
  })
})
