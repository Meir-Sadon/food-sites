import { screen, within } from '@testing-library/react'
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
