import type { Payment, Site } from '../api/site'

/** A payment the client makes by hand to the business's number (Bit, PayBox, or the older combined choice). */
export const isTransfer = (payment: Payment) => payment === 'Transfer' || payment === 'Bit' || payment === 'PayBox'

/** The i18n key naming a payment method. */
export const paymentKey = (payment: Payment) => `payment.${payment}`

/** The manual payments the admin switched on, in the order they are offered. */
export function transferChoices(site: Pick<Site, 'paymentPhone' | 'bitEnabled' | 'payBoxEnabled'>): Payment[] {
  if (!site.paymentPhone) return []
  return [...(site.bitEnabled ? (['Bit'] as const) : []), ...(site.payBoxEnabled ? (['PayBox'] as const) : [])]
}

/** What the client's remembered choice becomes when the admin no longer offers it. */
export function availablePayment(payment: Payment, site: Pick<Site, 'paymentPhone' | 'bitEnabled' | 'payBoxEnabled'>): Payment {
  if (payment === 'OnDelivery') return payment
  const choices = transferChoices(site)
  if (payment === 'Transfer') return choices[0] ?? 'OnDelivery'
  return choices.includes(payment) ? payment : 'OnDelivery'
}

/** The amount as typed in Bit / PayBox: no thousands separator, no trailing zeros. */
export const transferAmount = (total: number) => String(Math.round(total * 100) / 100)
