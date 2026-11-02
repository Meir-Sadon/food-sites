import { useEffect, useState } from 'react'

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

/**
 * What the footer's install button does: `native` when the browser offered to install (call `install()`),
 * `ios` when only the manual steps exist, `none` when already installed (opened as an app) or unsupported.
 */
export function useInstallApp() {
  const [offer, setOffer] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onOffer = (event: Event) => {
      event.preventDefault()
      setOffer(event as InstallPrompt)
    }
    const onInstalled = () => {
      setOffer(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onOffer)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onOffer)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const mode: 'native' | 'ios' | 'none' = installed || isStandalone() ? 'none' : offer ? 'native' : isIos() ? 'ios' : 'none'
  const install = async () => {
    if (!offer) return
    await offer.prompt()
    setOffer(null)
  }
  return { mode, install }
}
