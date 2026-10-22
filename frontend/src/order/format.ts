import type { TFunction } from 'i18next'
import type { HourSlot, MenuDish } from '../api/site'
import { defaultOption } from './model'

const money = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 })

export const formatMoney = (value: number) => `₪${money.format(value)}`

/** The price shown on a dish card: the default option, or the price per unit / kilo / named unit. */
export function priceText(dish: MenuDish, t: TFunction): string {
  if (dish.choiceMode === 'Free') {
    const price = money.format(dish.unitPrice ?? 0)
    if (dish.unitName) return t('order.perNamedUnit', { price, unit: dish.unitName })
    return dish.sellBy === 'Weight' ? t('order.perKilo', { price }) : t('order.perUnit', { price })
  }
  const option = defaultOption(dish)
  return option ? t('order.priceFrom', { price: money.format(option.price), label: option.label }) : ''
}

/** "יום שישי, 09/10/2026" for "2026-10-09". Parsed as a local date so time zones cannot shift it. */
export function formatSupplyDate(iso: string, t: TFunction): string {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay()
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t('order.dayPrefix', { day: t(`weekdays.${names[weekday]}`) })}, ${pad(d)}/${pad(m)}/${y}`
}

/** "08:00" for "08:00:00". */
export const formatTime = (time: string) => time.slice(0, 5)

/** "08:00 עד 09:00": words between the times, so right-to-left text keeps them in order. A slot after midnight adds its day and date. */
export const formatSlot = (slot: HourSlot, t: TFunction) => {
  const range = t('order.hourRange', { from: formatTime(slot.from), to: formatTime(slot.to) })
  return slot.date ? t('order.nextDaySlot', { range, day: formatSupplyDate(slot.date, t) }) : range
}

/** What the hour select holds for a slot: its start, with the date in front when it is on the day after the supply date. */
export const slotId = (slot: HourSlot) => (slot.date ? `${slot.date}T${slot.from}` : slot.from)

/** The hour and (for a slot after midnight) the date a select value stands for. */
export function parseSlotId(id: string): { hour: string; date: string | null } {
  const at = id.indexOf('T')
  return at < 0 ? { hour: id, date: null } : { date: id.slice(0, at), hour: id.slice(at + 1) }
}

/** Slots the lead time of this way of receiving the order still allows. */
export const slotsFor = (slots: HourSlot[] | null | undefined, delivery: boolean) =>
  (slots ?? []).filter((s) => (delivery ? s.deliveryOk : s.pickupOk) !== false)

/**
 * The unit shown next to an amount when the client picks a free amount: the dish's own unit name,
 * else ק״ג for a weight. For dishes with set options the amount just multiplies the chosen option
 * (e.g. 2 × "1 ק״ג"), so it has no unit.
 */
export function unitLabel(dish: MenuDish, t: TFunction): string {
  if (dish.choiceMode !== 'Free') return ''
  return dish.unitName || (dish.sellBy === 'Weight' ? t('order.kilo') : '')
}

const amounts = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 3 })

/** An ordered amount as shown next to a name: the number, with the unit for a weight or a named unit. */
export function amountText(dish: MenuDish, quantity: number, t: TFunction): string {
  const unit = unitLabel(dish, t)
  return `${amounts.format(quantity)}${unit ? ` ${unit}` : ''}`
}

/**
 * The price shown on an option card: the full price, or for a dish that shows differences what the option adds to
 * the default option ("+₪12"; the default option itself shows its full price as the base).
 */
export function optionPriceText(dish: MenuDish, option: MenuDish['options'][number]) {
  const base = defaultOption(dish)
  if (!dish.showOptionDifference || !base || base.id === option.id) return formatMoney(option.price)
  const diff = Math.round((option.price - base.price) * 100) / 100
  return `${diff < 0 ? '−' : '+'}${formatMoney(Math.abs(diff))}`
}
