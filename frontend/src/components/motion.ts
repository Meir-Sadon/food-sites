import { useSyncExternalStore } from 'react'
import { PREFS_EVENT } from '../accessibility/prefs'

/** The visitor asked their system, or the accessibility menu, for less motion: animations and smooth scrolling are skipped. */
export const prefersReducedMotion = () =>
  document.documentElement.dataset.a11yMotion === 'off' ||
  (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

/** Scroll behaviour that respects the visitor's motion preference. */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth')

function subscribe(onChange: () => void) {
  window.addEventListener(PREFS_EVENT, onChange)
  return () => window.removeEventListener(PREFS_EVENT, onChange)
}

/** `prefersReducedMotion()` as a hook that also updates when the accessibility menu is used. */
export const useReducedMotion = () => useSyncExternalStore(subscribe, prefersReducedMotion)
