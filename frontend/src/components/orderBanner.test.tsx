import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { orderBanner, publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const frames = [
  { id: 1, url: 'https://img.test/1.jpg' },
  { id: 2, url: 'https://img.test/2.jpg' },
]

const withBanner = (banner: ReturnType<typeof orderBanner> | null, features: string[] = ['bannerAnimation']) =>
  fakeApi({ ...publicApi, 'GET /api/site': () => site({ features: features as never, banner }) })

describe('Order page banner', () => {
  it('keeps the standard banner when the admin has none', async () => {
    withBanner(null)
    renderAt('/')
    expect(await screen.findByText('טרי בכל יום')).toBeInTheDocument()
    expect(screen.queryByTestId('scroll-animation')).not.toBeInTheDocument()
  })

  it('shows the admin banner: texts, ovals, colours and logo', async () => {
    withBanner(
      orderBanner({ enabled: true, title: 'ברוכים הבאים', tagline: 'קובה כמו בבית', chips: ['חם', 'טרי'], background: '#112233', textColor: '#ffffff', logoUrl: 'https://img.test/logo.png' }),
    )
    const { container } = renderAt('/')

    expect(await screen.findByRole('heading', { name: 'ברוכים הבאים' })).toBeInTheDocument()
    expect(screen.getByText('קובה כמו בבית')).toBeInTheDocument()
    expect(screen.getByText('חם')).toBeInTheDocument()
    expect(screen.queryByText('טרי בכל יום')).not.toBeInTheDocument()
    const hero = container.querySelector<HTMLElement>('.order-hero')!
    expect(hero.style.background).toBe('rgb(17, 34, 51)')
    expect(hero.style.color).toBe('rgb(255, 255, 255)')
    expect(hero.querySelector('img')).toHaveAttribute('src', 'https://img.test/logo.png')
  })

  it('falls back to the standard text for what the admin left empty', async () => {
    withBanner(orderBanner({ enabled: true, title: 'ברוכים הבאים' }))
    const { container } = renderAt('/')
    expect(await screen.findByRole('heading', { name: 'ברוכים הבאים' })).toBeInTheDocument()
    expect(screen.getByText('טרי בכל יום')).toBeInTheDocument()
    expect(container.querySelector('.order-hero__tagline')).not.toBeEmptyDOMElement()
  })

  it('shows the scroll animation under the banner', async () => {
    withBanner(orderBanner({ animationEnabled: true, frames, animationScreens: 5 }))
    renderAt('/')
    const animation = await screen.findByTestId('scroll-animation')
    expect(animation.querySelectorAll('img')).toHaveLength(2)
    expect(animation.style.blockSize).toBe('500svh')
  })

  it('ignores the banner while the feature is off for the site', async () => {
    withBanner(orderBanner({ enabled: true, title: 'ברוכים הבאים', animationEnabled: true, frames }), [])
    renderAt('/')
    expect(await screen.findByText('טרי בכל יום')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ברוכים הבאים' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('scroll-animation')).not.toBeInTheDocument()
  })
})
