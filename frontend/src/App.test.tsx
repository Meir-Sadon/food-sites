import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { publicApi } from './test/catalogData'
import { fakeApi } from './test/fakeApi'
import { renderAt } from './test/render'

describe('client site', () => {
  beforeEach(() => {
    fakeApi(publicApi)
  })

  it('shows the top bar with its buttons in order', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'תפריט ראשי' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['הזמנה', 'התחברות / הרשמה', 'המלצות', 'פרופיל', 'אודות'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/login', '/recommendations', '/profile', '/about'])
  })

  it.each([
    ['/', 'הזמנה'],
    ['/login', 'התחברות / הרשמה'],
    ['/recommendations', 'המלצות'],
    ['/profile', 'פרופיל'],
    ['/about', 'אודות'],
  ])('renders %s with its title and marks its button active', (path, title) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    const active = within(screen.getByRole('navigation')).getByRole('link', { current: 'page' })
    expect(active).toHaveTextContent(title)
  })

  it('shows the kashrut details on the About page', async () => {
    renderAt('/about')
    const section = await screen.findByRole('region', { name: 'כשרות' })
    expect(section).toHaveTextContent('בהשגחת הרבנות')
  })

  it('shows the main contact on the About page, not in the footer', async () => {
    renderAt('/about')
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '050-1234567' })).toHaveAttribute('href', 'tel:0501234567'),
    )
    expect(within(screen.getByRole('contentinfo')).queryByRole('link', { name: '050-1234567' })).not.toBeInTheDocument()
  })

  it('links to About from the footer and shows the terms and policy', async () => {
    const user = userEvent.setup()
    renderAt('/')
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'אודות' })).toHaveAttribute('href', '/about')
    await user.click(within(footer).getByRole('button', { name: 'תנאי שימוש ומדיניות' }))
    expect(screen.getByRole('dialog', { name: 'תנאי שימוש ומדיניות האתר' })).toBeInTheDocument()
  })

  it('keeps the kashrut details off the Order page', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    expect(screen.queryByText('בהשגחת הרבנות')).not.toBeInTheDocument()
  })

  it('opens on the Order page for unknown addresses', () => {
    renderAt('/no-such-page')
    expect(screen.getByRole('heading', { level: 1, name: 'הזמנה' })).toBeInTheDocument()
  })

  it('does not link to the admin area', () => {
    renderAt('/')
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs.some((h) => h?.startsWith('/admin'))).toBe(false)
  })
})
