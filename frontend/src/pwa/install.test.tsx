import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import '../i18n'
import { Footer } from '../components/Footer'
import { InstallButton } from './InstallButton'
import { InstallPrompt } from './InstallPrompt'
import { setPopupBusy } from './promptGate'

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
  it('pops up once the page has settled when there is no pop-up, and not again after it is closed', async () => {
    localStorage.clear()
    const prompt = vi.fn().mockResolvedValue(undefined)
    const { unmount } = render(<InstallPrompt />)
    act(() => {
      setPopupBusy(false)
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }))
    })
    await userEvent.click(await screen.findByRole('button', { name: 'התקנה' }, { timeout: 5000 }))
    expect(prompt).toHaveBeenCalled()
    unmount()

    render(<InstallPrompt />)
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }))
    })
    await new Promise((resolve) => setTimeout(resolve, 3500))
    expect(screen.queryByRole('dialog')).toBeNull()
  }, 20000)

  it('closes with the X', async () => {
    localStorage.clear()
    render(<InstallPrompt />)
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn() }))
    })
    await userEvent.click(await screen.findByRole('button', { name: 'סגירה' }, { timeout: 5000 }))
    expect(screen.queryByRole('dialog')).toBeNull()
  }, 20000)

  it('waits while a pop-up is on screen or coming', async () => {
    localStorage.clear()
    render(<InstallPrompt />)
    act(() => {
      setPopupBusy(true)
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn() }))
    })
    await new Promise((resolve) => setTimeout(resolve, 3500))
    expect(screen.queryByRole('dialog')).toBeNull()
  }, 20000)
})

describe('the top bar download button', () => {
  it('installs at once and explains itself in a tooltip', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    render(<InstallButton />)
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }))
    })
    await userEvent.click(await screen.findByRole('button', { name: 'מה זה כפתור ההורדה?' }))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'הורדת האתר כאפליקציה' }))
    expect(prompt).toHaveBeenCalled()
  })
})
