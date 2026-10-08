import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { scrollBehavior } from './motion'

/** How far (px) from the top or bottom of the page before the matching button shows. */
const THRESHOLD = 200

function edges() {
  const { scrollY, innerHeight } = window
  const height = document.documentElement.scrollHeight
  return { awayFromTop: scrollY > THRESHOLD, awayFromBottom: height - innerHeight - scrollY > THRESHOLD }
}

/** Floating buttons that jump to the top or the bottom of a long page; each shows only when there is somewhere to go. */
export function ScrollButtons() {
  const { t } = useTranslation()
  const [{ awayFromTop, awayFromBottom }, setEdges] = useState(edges)

  useEffect(() => {
    const update = () => setEdges(edges())
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    // The page grows after it renders (the menu loads, dishes open), without a scroll or resize.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    observer?.observe(document.body)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [])

  const to = (top: number) => window.scrollTo({ top, behavior: scrollBehavior() })

  return (
    <>
      {awayFromTop && (
        <button type="button" className="fab scroll-fab" onClick={() => to(0)} aria-label={t('scroll.top')} title={t('scroll.top')}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 15 6-6 6 6" />
          </svg>
        </button>
      )}
      {awayFromBottom && (
        <button
          type="button"
          className="fab scroll-fab"
          onClick={() => to(document.documentElement.scrollHeight)}
          aria-label={t('scroll.bottom')}
          title={t('scroll.bottom')}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
    </>
  )
}
