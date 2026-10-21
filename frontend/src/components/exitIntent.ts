import { useEffect } from 'react'

/** A scroll back up this far (px) within `FAST_UP_MS` is taken as a phone visitor heading for the address bar or tabs. */
const FAST_UP_PX = 250
const FAST_UP_MS = 400

/**
 * Calls `onIntent` once when the visitor seems about to leave the page. With a mouse that is the pointer leaving the
 * window through the top edge (towards the tabs or the address bar). A phone has no pointer, so it is a quick scroll
 * back up the page, or coming back to the tab after having switched away from it.
 */
export function useExitIntent(active: boolean, onIntent: () => void) {
  useEffect(() => {
    if (!active) return
    let done = false
    const fire = () => {
      if (done) return
      done = true
      onIntent()
    }

    const onMouseOut = (event: MouseEvent) => {
      if (!event.relatedTarget && event.clientY <= 0) fire()
    }

    let samples: { t: number; y: number }[] = []
    const onScroll = () => {
      const now = Date.now()
      samples = [...samples.filter((s) => now - s.t <= FAST_UP_MS), { t: now, y: window.scrollY }]
      if (Math.max(...samples.map((s) => s.y)) - window.scrollY >= FAST_UP_PX) fire()
    }

    let wasHidden = document.visibilityState === 'hidden'
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') wasHidden = true
      else if (wasHidden) fire()
    }

    document.addEventListener('mouseout', onMouseOut)
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('mouseout', onMouseOut)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, onIntent])
}
