import { emptyOrder, type OrderState } from './model'

const KEY = 'kuskus.orderDraft'

/** A draft saved in this browser. Storage can be blocked, so every access is guarded. */
export function loadDraft(): OrderState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<OrderState>
    return { ...emptyOrder(), ...saved, selections: saved.selections ?? {} }
  } catch {
    return null
  }
}

export function saveDraft(state: OrderState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage is full or blocked: the draft is simply not kept.
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
