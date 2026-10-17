import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

describe('About page social links', () => {
  it('shows a button with an icon for each link, in a new tab', async () => {
    fakeApi({
      ...publicApi,
      'GET /api/site': () =>
        site({
          socialLinks: [
            { kind: 'facebook', label: null, url: 'https://facebook.com/shop' },
            { kind: 'tiktok', label: null, url: 'https://tiktok.com/@shop' },
            { kind: 'youtube', label: null, url: 'https://youtube.com/@shop' },
            { kind: 'custom', label: 'האתר שלנו', url: 'https://example.com/shop' },
          ],
        }),
    })
    renderAt('/about')

    const list = await screen.findByRole('list', { name: 'קישורים לרשתות חברתיות' })
    const links = within(list).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['פייסבוק', 'טיקטוק', 'יוטיוב', 'האתר שלנו'])
    expect(links[0]).toHaveAttribute('href', 'https://facebook.com/shop')
    expect(links[0]).toHaveAttribute('target', '_blank')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
    expect(links.map((a) => a.className)).toEqual([
      'social-link social-link--facebook',
      'social-link social-link--tiktok',
      'social-link social-link--youtube',
      'social-link social-link--custom',
    ])
    expect(links[0].querySelector('svg')).not.toBeNull()
    expect(screen.queryByText('אינסטגרם')).toBeNull()
  })

  it('shows nothing when no link is set', async () => {
    fakeApi({ ...publicApi })
    renderAt('/about')
    await screen.findByRole('heading', { name: 'אודות' })
    expect(screen.queryByRole('list', { name: 'קישורים לרשתות חברתיות' })).toBeNull()
  })
})
