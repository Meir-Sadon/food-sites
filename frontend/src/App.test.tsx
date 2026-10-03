import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAt } from './test/render'

describe('client site', () => {
  it('shows the top bar with the four buttons in order', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'תפריט ראשי' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['הזמנה', 'התחברות / הרשמה', 'המלצות', 'פרופיל'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/login', '/recommendations', '/profile'])
  })

  it.each([
    ['/', 'הזמנה'],
    ['/login', 'התחברות / הרשמה'],
    ['/recommendations', 'המלצות'],
    ['/profile', 'פרופיל'],
  ])('renders %s with its title and marks its button active', (path, title) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    const active = within(screen.getByRole('navigation')).getByRole('link', { current: 'page' })
    expect(active).toHaveTextContent(title)
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
