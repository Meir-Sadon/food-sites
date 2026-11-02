import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import '../i18n'
import { Footer } from '../components/Footer'

const renderFooter = () =>
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  )

describe('install as an app', () => {
  it('shows no install button until the browser offers to install', async () => {
    renderFooter()
    expect(screen.queryByRole('button', { name: 'התקנת האתר כאפליקציה' })).toBeNull()
    const prompt = vi.fn().mockResolvedValue(undefined)
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }))
    })
    await userEvent.click(await screen.findByRole('button', { name: 'התקנת האתר כאפליקציה' }))
    expect(prompt).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'התקנת האתר כאפליקציה' })).toBeNull()
  })
})
