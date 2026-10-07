import { site } from '../site/config'
import { emptyOrder, type OrderState } from './model'

/** One key per site, so two sites opened from the same origin (e.g. localhost) keep separate drafts. */
export const DRAFT_KEY = `${site.id}.orderDraft`

/** A draft saved in this browser. Storage can be blocked, so every access is guarded. */
export function loadDraft(): OrderState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<OrderState>
    return { ...emptyOrder(), ...saved, selections: saved.selections ?? {} }
  } catch {
    return null
  }
}

export function saveDraft(state: OrderState) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state))
  } catch {
    // Storage is full or blocked: the draft is simply not kept.
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Nothing to clear.
  }
}
