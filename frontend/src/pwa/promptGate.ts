import { useSyncExternalStore } from 'react'

/**
 * Lets the install window wait for the business's entry pop-up: `EntryPopup` reports whether a pop-up is on screen or
 * still due, and the install window opens only after it has been idle (a while after a pop-up closed).
 */
type Gate = { busy: boolean; idleSince: number | null; hadPopup: boolean }
let gate: Gate = { busy: true, idleSince: null, hadPopup: false }
const listeners = new Set<() => void>()

export function setPopupBusy(busy: boolean) {
  if (gate.busy === busy) return
  gate = { ...gate, busy, idleSince: busy ? null : Date.now() }
  listeners.forEach((listener) => listener())
}

/** Marks that a pop-up was shown, so the install window waits longer after it. */
export function notePopupShown() {
  gate = { ...gate, hadPopup: true }
}

export function usePopupGate(): Gate {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    () => gate,
  )
}
