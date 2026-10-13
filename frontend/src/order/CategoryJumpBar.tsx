import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { scrollBehavior } from '../components/motion'

export interface JumpItem {
  /** The id of the section the chip scrolls to. */
  sectionId: string
  name: string
}

/** The bottom edge of the pinned search and category bar (`.order-sticky`) the chips sit in. */
const stickyBottom = (nav: HTMLElement | null) => (nav?.closest('.order-sticky') ?? nav)?.getBoundingClientRect().bottom ?? 0

/**
 * A row of category chips pinned (with the search box above it) under the top bar on the one-page order flows: a tap scrolls to that category, and
 * the chip of the category being read is marked as current (and kept in view when the row scrolls sideways).
 */
export function CategoryJumpBar({ categories }: { categories: JumpItem[] }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const [current, setCurrent] = useState<string | null>(null)

  // The current category is the last one whose title has passed the line under the bars.
  useEffect(() => {
    const sections = categories.map((c) => document.getElementById(c.sectionId))
    const update = () => {
      const line = (stickyBottom(ref.current)) + 8
      let found: string | null = null
      sections.forEach((section, i) => {
        if (section && section.getBoundingClientRect().top <= line) found = categories[i].sectionId
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

  function jump(sectionId: string) {
    const section = document.getElementById(sectionId)
    const nav = ref.current
    if (!section || !nav) return
    // Land with the category's title just under the pinned bars.
    const top = section.getBoundingClientRect().top + window.scrollY - stickyBottom(nav) - 8
    window.scrollTo?.({ top, behavior: scrollBehavior() })
  }

  return (
    <nav ref={ref} className="category-jump" aria-label={t('order.categoryJump.label')}>
      {categories.map((c) => (
        <button
          key={c.sectionId}
          type="button"
          className="category-jump__chip"
          aria-current={c.sectionId === current ? 'true' : undefined}
          onClick={() => jump(c.sectionId)}
        >
          {c.name}
        </button>
      ))}
    </nav>
  )
}
