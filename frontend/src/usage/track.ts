import { apiFetch, send } from '../api/client'
import { site } from '../site/config'

/** What the client site reports for the admin's usage report; the server counts each once per device and day. */
export type UsageKind = 'Visit' | 'OrderStarted' | 'OrderSubmitted'

/** A random id this browser keeps for itself, so a returning device is not counted again. */
export const DEVICE_KEY = `${site.id}.deviceId`
/** Set on a device the admin logged in on: the owner's own visits are not counted. */
export const EXCLUDED_KEY = `${site.id}.usageExcluded`

/** Off in tests unless a test turns it on, since the fake API refuses unexpected requests. */
export const usageTracking = { enabled: import.meta.env.MODE !== 'test' }

// Each kind is sent once per page load; the server keeps one per day anyway.
const sent = new Set<UsageKind>()

function newId(): string {
  // randomUUID needs a secure context (HTTPS or localhost); getRandomValues works everywhere.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The device id, or null when storage is blocked (nothing is counted then) or this is the admin's device. */
function deviceId(): string | null {
  try {
    if (localStorage.getItem(EXCLUDED_KEY)) return null
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = newId()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return null
  }
}

/** Tells the server this device did `kind`. Never fails and never waits: a lost report only lowers a count. */
export function trackUsage(kind: UsageKind) {
  if (!usageTracking.enabled || sent.has(kind)) return
  // Automated browsers (test robots) say so.
  if (typeof navigator !== 'undefined' && navigator.webdriver) return
  const id = deviceId()
  if (!id) return
  sent.add(kind)
  apiFetch('/api/usage', { ...send('POST', { deviceId: id, kind }), keepalive: true }).catch(() => undefined)
}

/** Stops counting this device (the admin's): its id is dropped and nothing is sent from it again. */
export function excludeThisDevice() {
  try {
    localStorage.setItem(EXCLUDED_KEY, '1')
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    // Storage is blocked: nothing is counted from this browser anyway.
  }
}

/** For tests: forget what this page load already sent. */
export function resetUsageForTests() {
  sent.clear()
}
