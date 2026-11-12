import type { Menu } from '../api/site'

const ASKED_KEY = 'guestOfferAsked'

/** Whether this visit's guest already chose to go on as a guest: they are offered to sign up once, not at every send. */
export function guestOfferAsked(): boolean {
  try {
    return sessionStorage.getItem(ASKED_KEY) === '1'
  } catch {
    return false
  }
}

export function markGuestOfferAsked() {
  try {
    sessionStorage.setItem(ASKED_KEY, '1')
  } catch {
    // Without storage the guest is simply asked again.
  }
}

/** Every price of the menu as one string, to tell whether a client's prices differ from the guest's. */
export function pricesOf(menu: Menu): string {
  return JSON.stringify(
    menu.dishes.map((d) => [d.id, d.unitPrice, d.options.map((o) => o.price), d.addOns?.map((a) => [a.price, a.overLimitPrice]), d.priceBeforeDiscount ?? null]),
  )
}
