import type { TFunction } from 'i18next'
import type { MenuDish } from '../api/site'
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

/**
 * The unit shown next to an amount when the client picks a free amount: the dish's own unit name,
 * else ק״ג for a weight. For dishes with set options the amount just multiplies the chosen option
 * (e.g. 2 × "1 ק״ג"), so it has no unit.
 */
export function unitLabel(dish: MenuDish, t: TFunction): string {
  if (dish.choiceMode !== 'Free') return ''
  return dish.unitName || (dish.sellBy === 'Weight' ? t('order.kilo') : '')
}
