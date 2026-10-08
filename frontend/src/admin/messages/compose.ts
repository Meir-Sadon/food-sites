import type { AdminOrder } from '../../api/operations'
import type { MessageTemplate } from '../../api/reviews'
import { normalizePhone } from '../../order/phone'
import { formatMoney } from '../../order/format'
import { formatDate } from '../format'

/** The placeholders a template's text may use, filled from the order. */
export const PLACEHOLDERS = ['{order}', '{date}', '{total}'] as const

/** The client's first name, which every message starts with. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''

/** The address of a review page, on this site. */
export const reviewUrl = (token: string, origin = window.location.origin) => `${origin}/r/${token}`

/** The message as sent: the client's first name, the template's text with the order's details, then the review link. */
export function composeMessage(template: MessageTemplate, order: AdminOrder, link: string | null): string {
  const text = template.text
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
