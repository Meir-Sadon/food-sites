import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import '../i18n'
import { Footer } from '../components/Footer'
import { InstallPrompt } from './InstallPrompt'

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

describe('install window on the first visit', () => {
  it('pops up once when the browser offers to install, and not again after it is closed', async () => {
    localStorage.clear()
    const prompt = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(<InstallPrompt />)
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }))
    })
    await userEvent.click(await screen.findByRole('button', { name: 'התקנה' }, { timeout: 4000 }))
    expect(prompt).toHaveBeenCalled()
    unmount()

    render(<InstallPrompt />)
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }))
    })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(screen.queryByRole('dialog')).toBeNull()
  }, 15000)
})
