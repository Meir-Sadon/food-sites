import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { scrollBehavior } from '../components/motion'
import { categorySectionId } from './categorySection'

export interface JumpItem {
  id: number
  name: string
}

/**
 * A row of category chips pinned under the top bar on the one-page order flows: a tap scrolls to that category, and
 * the chip of the category being read is marked as current (and kept in view when the row scrolls sideways).
 */
export function CategoryJumpBar({ categories }: { categories: JumpItem[] }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const [current, setCurrent] = useState<number | null>(null)

  // Sit right under the top bar, whatever its height (it wraps on a narrow screen).
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.top-bar')
    const nav = ref.current
    if (!bar || !nav) return
    const place = () => nav.style.insetBlockStart = `${bar.offsetHeight}px`
    place()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(place)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  // The current category is the last one whose title has passed the line under the bars.
  useEffect(() => {
    const sections = categories.map((c) => document.getElementById(categorySectionId(c.id)))
    const update = () => {
      const line = (ref.current?.getBoundingClientRect().bottom ?? 0) + 8
      let found: number | null = null
      sections.forEach((section, i) => {
        if (section && section.getBoundingClientRect().top <= line) found = categories[i].id
      })
      setCurrent(found)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [categories])

  // Keep the current chip visible inside the row, scrolling only the row, never the page.
  useEffect(() => {
    const nav = ref.current
    const chip = nav?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!nav || !chip || !nav.scrollBy) return
    const row = nav.getBoundingClientRect()
    const box = chip.getBoundingClientRect()
    nav.scrollBy({ left: box.left + box.width / 2 - (row.left + row.width / 2), behavior: scrollBehavior() })
  }, [current])

  function jump(id: number) {
    const section = document.getElementById(categorySectionId(id))
    const nav = ref.current
    if (!section || !nav) return
    // Land with the category's title just under the pinned bars.
    const top = section.getBoundingClientRect().top + window.scrollY - nav.getBoundingClientRect().bottom - 8
    window.scrollTo?.({ top, behavior: scrollBehavior() })
  }

  return (
    <nav ref={ref} className="category-jump" aria-label={t('order.categoryJump.label')}>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          className="category-jump__chip"
          aria-current={c.id === current ? 'true' : undefined}
          onClick={() => jump(c.id)}
        >
          {c.name}
        </button>
      ))}
    </nav>
  )
}
