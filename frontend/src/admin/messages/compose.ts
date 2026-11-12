import type { AdminOrder } from '../../api/operations'
import type { MessageTemplate } from '../../api/reviews'
import { normalizePhone } from '../../order/phone'
import { formatMoney } from '../../order/format'
import { formatDate } from '../format'

/** The placeholders a template's text may use, filled from the order. */
export const PLACEHOLDERS = ['{order}', '{date}', '{total}', '{cancelReason}'] as const

/** The client's first name, which every message starts with. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''

/** The address of a review page, on this site. */
export const reviewUrl = (token: string, origin = window.location.origin) => `${origin}/r/${token}`

/** The message as sent: the client's first name, the template's text with the order's details, then the review link. */
export function composeMessage(template: MessageTemplate, order: AdminOrder, link: string | null): string {
  const reason = order.cancelReason?.trim() ?? ''
  // A line that uses {cancelReason} is left out when the order has no reason, so no empty "reason: " line is sent.
  const lines = template.text.split('\n').filter((line) => reason !== '' || !line.includes('{cancelReason}'))
  const text = lines
    .join('\n')
    .replaceAll('{cancelReason}', reason)
    .replaceAll('{order}', String(order.id))
    .replaceAll('{date}', formatDate(order.supplyDate))
    .replaceAll('{total}', formatMoney(order.total))
  return [`${firstName(order.name)},`, text, template.includeReviewLink ? link : null].filter(Boolean).join('\n')
}

/** A wa.me link that opens a chat with the client with the message typed in; null for a phone WhatsApp can't use. */
export function whatsAppUrl(phone: string, text: string): string | null {
  const local = normalizePhone(phone)
  return local ? `https://wa.me/972${local.slice(1)}?text=${encodeURIComponent(text)}` : null
}

/** A wa.me link that opens WhatsApp with the text typed in and lets the admin pick who gets it. */
export const whatsAppShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`

/** The placeholders the restricted-client message may use. */
export const RESTRICTED_PLACEHOLDERS = ['{name}', '{order}', '{date}', '{total}', '{paymentPhone}'] as const

/** The prepayment request for a restricted client's order, with the order's details and the Bit / PayBox number filled in. */
export function composeRestrictedMessage(text: string, order: AdminOrder, paymentPhone: string | null): string {
  return text
    .replaceAll('{name}', firstName(order.name))
    .replaceAll('{order}', String(order.id))
    .replaceAll('{date}', formatDate(order.supplyDate))
    .replaceAll('{total}', formatMoney(order.total))
    .replaceAll('{paymentPhone}', paymentPhone ?? '')
}
