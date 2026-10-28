import type { Popup } from '../api/popup'
import type { InactiveAfter } from '../api/site'
import type { OrderSignals } from '../order/orderSignals'

/** What is known about the visitor when a pop-up's conditions are checked. */
export interface Visitor {
  /** True or false once the session check has finished; null until then, when no condition on it can match yet. */
  loggedIn: boolean | null
  /** Whether a logged-in client ordered within the inactivity period; null for a guest, or until the orders are loaded. */
  active: boolean | null
  order: OrderSignals
}

/** Whether a client whose last order (not cancelled) was at `lastOrderAt` ordered within `period` of `now`. No order is inactive. */
export function isActive(lastOrderAt: Date | null, period: InactiveAfter, now: Date): boolean {
  if (!lastOrderAt) return false
  const since = new Date(now)
  if (period.unit === 'month') since.setMonth(since.getMonth() - period.amount)
  else since.setDate(since.getDate() - 7 * period.amount)
  return lastOrderAt >= since
}

/** Whether a pop-up's conditions that are on all match; the exit trigger is not one of them (the page watches for it). */
export function conditionsMatch(popup: Popup, visitor: Visitor): boolean {
  if (popup.login && popup.login !== 'both') {
    if (visitor.loggedIn === null || (popup.login === 'loggedIn') !== visitor.loggedIn) return false
  }
  if (popup.activity && popup.activity !== 'both') {
    // Only a logged-in client has orders to judge by: a guest matches neither choice.
    if (visitor.active === null || (popup.activity === 'active') !== visitor.active) return false
  }
  if (popup.orderSource) {
    const { sources } = visitor.order
    if (popup.orderSource === 'any' ? sources.length === 0 : !sources.includes(popup.orderSource)) return false
  }
  if (popup.orderTotal) {
    const { hasOrder, total } = visitor.order
    if (!hasOrder) return false
    if (popup.minTotal !== null && !(total > popup.minTotal)) return false
    if (popup.maxTotal !== null && !(total < popup.maxTotal)) return false
  }
  return true
}

/** Whether the pop-up has a condition that needs the client's orders. */
export const needsActivity = (popup: Popup) => popup.activity === 'active' || popup.activity === 'inactive'
