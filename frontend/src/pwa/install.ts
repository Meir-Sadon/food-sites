import { useSyncExternalStore } from 'react'

/** The browser's install offer (Chrome, Edge, Android); not in the DOM typings. */
type InstallPrompt = Event & { prompt: () => Promise<void> }

/** Registers the service worker that makes the site installable. It caches nothing (see vite-pwa.ts). */
export function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator)
    window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true

/** iPhone and iPad (including iPadOS, which reports as a Mac): no install offer there, only Share → Add to Home Screen. */
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Safari proper; other iPhone browsers cannot add to the home screen from their menu the same way. */
export const isIosSafari = () => isIos() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios|gsa/i.test(navigator.userAgent)

// The browser's install offer arrives once, early: a store kept outside React lets every button and window share it.
let offer: InstallPrompt | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    offer = event as InstallPrompt
    emit()
  })
  window.addEventListener('appinstalled', () => {
    offer = null
    installed = true
    emit()
  })
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Opens the browser's install question; false when the browser has not offered one. */
async function installNow() {
  const current = offer
  if (!current) return
  offer = null
  emit()
  await current.prompt()
}

/**
 * What the install buttons do: `native` when the browser offered to install (call `install()`),
 * `ios` when only the manual steps exist, `none` when already installed (opened as an app) or unsupported.
 */
export function useInstallApp() {
  const current = useSyncExternalStore(subscribe, () => offer)
  const done = useSyncExternalStore(subscribe, () => installed)
  const mode: 'native' | 'ios' | 'none' = done || isStandalone() ? 'none' : current ? 'native' : isIos() ? 'ios' : 'none'
  return { mode, install: installNow }
}
