/** The visitor asked their system for less motion: animations and smooth scrolling are skipped. */
export const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Scroll behaviour that respects the visitor's motion preference. */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth')
