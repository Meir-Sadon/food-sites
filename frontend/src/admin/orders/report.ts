import type { TFunction } from 'i18next'
import { paymentKey } from '../../order/payment'
import type { AdminOrder, AdminOrderItem } from '../../api/operations'
import { formatMoney, formatTime } from '../../order/format'
import { formatDate, formatNumber } from '../format'

/** A dish line of the order with the add-ons ordered under it. */
export interface OrderLine {
  item: AdminOrderItem
  addOns: AdminOrderItem[]
}

export function orderLines(order: AdminOrder): OrderLine[] {
  return order.items
    .filter((item) => item.parentItemId === null)
    .map((item) => ({ item, addOns: order.items.filter((other) => other.parentItemId === item.id) }))
}

const name = (item: AdminOrderItem) => `${formatNumber(item.quantity)} × ${item.dishName}${item.optionLabel ? ` (${item.optionLabel})` : ''}`

/**
 * The text the admin shares on WhatsApp: first what to prepare for the order (dishes, options, remarks, answers and
 * add-ons), then everything else about it (client, when and where, payment, notes, prices and the total).
 */
export function prepReport(order: AdminOrder, t: TFunction): string {
  const prepare = orderLines(order).flatMap(({ item, addOns }) => [
    `• ${name(item)}`,
    ...(item.note ? [`   ${t('admin.orders.report.note')}: ${item.note}`] : []),
    ...(item.answers ?? []).map((a) => `   ${a.question}: ${a.answer}`),
    ...addOns.map((addOn) => `   + ${name(addOn)}`),
  ])

  const delivery = order.fulfillmentMethod === 'Delivery'
  const alerts = [
    ...(order.needsReview ? [t('admin.orders.report.needsReview')] : []),
    ...(order.hourFull ? [t('admin.orders.report.hourFull')] : []),
  ]
  const paid = order.isPaid
    ? t('admin.orders.report.paidWith', { method: t(`admin.orders.paidMethods.${order.paidWith ?? 'Unknown'}`) })
    : t('admin.orders.report.unpaid')
  const prices = order.items.map(
    (item) => `${item.parentItemId !== null ? '+ ' : ''}${name(item)} – ${formatMoney(item.lineTotal)}`,
  )

  const details = [
    `${t('admin.orders.report.customer')}: ${order.name}, ${order.phone}`,
    `${t('admin.orders.report.when')}: ${formatDate(order.supplyDate)}${order.deliveryHour ? ` · ${formatTime(order.deliveryHour)}` : ''} · ${t(delivery ? 'admin.orders.delivery' : 'admin.orders.pickup')}`,
    ...(delivery && order.address ? [`${t('admin.orders.report.address')}: ${order.address}`] : []),
    `${t('admin.orders.report.payment')}: ${t(paymentKey(order.paymentMethod))} · ${paid}`,
    `${t('admin.orders.report.status')}: ${t(`admin.orders.statuses.${order.status}`)}`,
    ...(order.notes ? [`${t('admin.orders.report.notes')}: ${order.notes}`] : []),
  ]

  return [
    t('admin.orders.report.title', { id: order.id }),
    ...(alerts.length ? ['', ...alerts.map((a) => `⚠ ${a}`)] : []),
    '',
    `*${t('admin.orders.report.prepare')}*`,
    ...prepare,
    '',
    `*${t('admin.orders.report.details')}*`,
    ...details,
    '',
    `*${t('admin.orders.report.prices')}*`,
    ...prices,
    `${t('admin.orders.report.total')}: ${formatMoney(order.total)}`,
  ].join('\n')
}
