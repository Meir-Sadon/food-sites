import { useSyncExternalStore } from 'react'
import { site } from '../site/config'

/**
 * The visitor's answer about marketing cookies; null until they answer. 'granted' is "I agree", 'denied' is "necessary
 * only" (not asked again). Kept in this browser only. "Not now" is no answer: it only hides the question for this visit.
 */
export type Consent = 'granted' | 'denied' | null

export const CONSENT_KEY = `${site.id}.marketingConsent`
const CHANGED = 'marketing-consent-changed'
const POSTPONED_KEY = `${site.id}.marketingConsentPostponed`

export function getConsent(): Consent {
  try {
    const value = localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

/** "Not now": nothing is loaded and the question stays closed until the next visit. */
export function postponeConsent() {
  try {
    sessionStorage.setItem(POSTPONED_KEY, '1')
  } catch {
    // Without storage the question comes back on the next page, which is acceptable.
  }
  window.dispatchEvent(new Event(CHANGED))
}

export const isPostponed = () => {
  try {
    return sessionStorage.getItem(POSTPONED_KEY) === '1'
  } catch {
    return false
  }
}

/** Whether the question is hidden for now (postponed this visit). */
export const usePostponed = (): boolean => useSyncExternalStore(subscribe, isPostponed, () => false)

/**
 * Remembers the answer. Taking back a "yes" reloads the page: a script that already ran cannot be unloaded, and
 * a reload is the one way to be sure no tool stays active.
 */
export function setConsent(value: Consent) {
  const was = getConsent()
  try {
    if (value) localStorage.setItem(CONSENT_KEY, value)
    else localStorage.removeItem(CONSENT_KEY)
    sessionStorage.removeItem(POSTPONED_KEY)
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
