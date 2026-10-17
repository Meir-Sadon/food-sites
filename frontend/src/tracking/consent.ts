import { useSyncExternalStore } from 'react'
import { site } from '../site/config'

/** The visitor's answer about marketing cookies; null until they answer. Kept in this browser only. */
export type Consent = 'granted' | 'denied' | null

export const CONSENT_KEY = `${site.id}.marketingConsent`
const CHANGED = 'marketing-consent-changed'

export function getConsent(): Consent {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

/**
 * Remembers the answer. Taking back a "yes" reloads the page: a script that already ran cannot be unloaded, and
 * a reload is the one way to be sure no tool stays active.
 */
export function setConsent(value: Consent) {
  const was = getConsent()
  try {
    if (value) localStorage.setItem(CONSENT_KEY, value)
    else localStorage.removeItem(CONSENT_KEY)
  } catch {
    // Storage is blocked: the answer holds until the page closes (nothing is loaded without a stored "yes").
  }
  window.dispatchEvent(new Event(CHANGED))
  if (was === 'granted' && value !== 'granted') {
    try {
      window.location.reload()
    } catch {
      // Not every environment can reload.
    }
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export const useConsent = (): Consent => useSyncExternalStore(subscribe, getConsent, () => null)
