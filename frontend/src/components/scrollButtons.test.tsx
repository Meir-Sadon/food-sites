import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicApi } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

const top = 'לראש העמוד'
const bottom = 'לתחתית העמוד'

/** jsdom lays nothing out, so the page's height and scroll position are set by hand. */
function page({ height, scrollY }: { height: number; scrollY: number }) {
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(height)
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(scrollY)
  act(() => {
    fireEvent.scroll(window)
  })
}

describe('scroll buttons', () => {
  afterEach(() => vi.restoreAllMocks())

  async function about() {
    fakeApi({ ...publicApi })
    renderAt('/about')
    await screen.findByText('אודות', { selector: 'a' })
  }

  it('are hidden on a page that fits the screen', async () => {
    await about()
    page({ height: 800, scrollY: 0 })
    expect(screen.queryByRole('button', { name: top })).toBeNull()
    expect(screen.queryByRole('button', { name: bottom })).toBeNull()
  })

  it('offer only the way that is left to go', async () => {
    await about()
    page({ height: 3000, scrollY: 0 })
    expect(screen.queryByRole('button', { name: top })).toBeNull()
    expect(screen.getByRole('button', { name: bottom })).toBeInTheDocument()

    page({ height: 3000, scrollY: 2200 })
    expect(screen.getByRole('button', { name: top })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: bottom })).toBeNull()
  })

  it('scroll to the top and to the bottom', async () => {
    await about()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    page({ height: 3000, scrollY: 1000 })

    await userEvent.click(screen.getByRole('button', { name: top }))
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }))
    await userEvent.click(screen.getByRole('button', { name: bottom }))
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 3000 }))
  })
})
