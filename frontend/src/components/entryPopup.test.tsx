import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { popup, publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const shown = popup({
  enabled: true,
  title: 'מבצע חג',
  body: 'עשר אחוז הנחה',
  imageUrl: 'https://img.test/popup.jpg',
  buttonText: 'להזמנה',
  buttonUrl: 'https://example.com/sale',
})

afterEach(() => sessionStorage.clear())

describe('Entry pop-up', () => {
  it('opens with its picture, text and button when the site opens, and closes on the X', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popup: shown }) })
    renderAt('/')

    const dialog = await screen.findByRole('dialog', { name: 'מבצע חג' })
    expect(dialog).toHaveTextContent('עשר אחוז הנחה')
    expect(dialog.querySelector('img')).toHaveAttribute('src', 'https://img.test/popup.jpg')
    const button = screen.getByRole('link', { name: 'להזמנה' })
    expect(button).toHaveAttribute('href', 'https://example.com/sale')
    expect(button).toHaveAttribute('target', '_blank')
    expect(button).toHaveAttribute('rel', 'noopener noreferrer')

    await userEvent.setup().click(screen.getAllByRole('button', { name: 'סגירה' })[0])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('has no button unless it has both its text and its address', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popup: popup({ enabled: true, title: 'שלום', buttonText: 'להזמנה' }) }) })
    renderAt('/')
    await screen.findByRole('dialog', { name: 'שלום' })
    expect(screen.queryByRole('link', { name: 'להזמנה' })).not.toBeInTheDocument()
  })

  it('opens a page of the site in place and closes', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popup: popup({ enabled: true, title: 'שלום', buttonText: 'אודות', buttonUrl: '/about' }) }) })
    renderAt('/')
    const dialog = await screen.findByRole('dialog', { name: 'שלום' })
    await userEvent.setup().click(within(dialog).getByRole('link', { name: 'אודות' }))
    expect(screen.queryByRole('dialog', { name: 'שלום' })).not.toBeInTheDocument()
  })

  it('is not shown when the site names none', async () => {
    fakeApi({ ...publicApi })
    renderAt('/about')
    await screen.findByRole('heading', { name: 'אודות' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens once per visit when the admin chose that', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popup: { ...shown, frequency: 'session' } }) })
    const first = renderAt('/')
    await userEvent.setup().click((await screen.findAllByRole('button', { name: 'סגירה' }))[0])
    first.unmount()

    renderAt('/')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens on every load by default', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popup: shown }) })
    const first = renderAt('/')
    await screen.findByRole('dialog', { name: 'מבצע חג' })
    first.unmount()

    renderAt('/')
    expect(await screen.findByRole('dialog', { name: 'מבצע חג' })).toBeInTheDocument()
  })

  it('opens on the home page only', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popup: shown }) })
    renderAt('/about')
    await screen.findByRole('heading', { name: 'אודות' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('waits the delay the admin set', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popup: { ...shown, delaySeconds: 1 } }) })
    renderAt('/')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('dialog', { name: 'מבצע חג' }, { timeout: 2500 })).toBeInTheDocument()
  })

  it('opens only when the pointer leaves through the top when the admin chose exit', async () => {
    fakeApi({ ...publicApi, 'GET /api/site': () => site({ popup: { ...shown, trigger: 'exit' } }) })
    renderAt('/')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.mouseOut(document.body, { clientY: 300 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The listener arms after the site settings load, which can take longer than the wait above on a busy runner.
    await waitFor(() => {
      fireEvent.mouseOut(document.body, { clientY: 0 })
      expect(screen.getByRole('dialog', { name: 'מבצע חג' })).toBeInTheDocument()
    })
  })
})
