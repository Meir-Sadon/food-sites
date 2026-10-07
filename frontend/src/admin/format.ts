import type { TFunction } from 'i18next'
import type { Dish } from '../api/catalog'

const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 })

export const formatNumber = (value: number) => number.format(value)

/** The price line shown in admin lists, e.g. "₪60 · 1 ק״ג" or "₪90 לק״ג". */
export function priceSummary(dish: Dish, t: TFunction): string {
  if (dish.choiceMode === 'Free') {
    const price = formatNumber(dish.unitPrice ?? 0)
    if (dish.unitName) return t('admin.dishes.perNamedUnit', { price, unit: dish.unitName })
    return dish.sellBy === 'Weight' ? t('admin.dishes.perKilo', { price }) : t('admin.dishes.perUnit', { price })
  }
  const option = dish.options.find((o) => o.isDefault) ?? dish.options[0]
  return option ? t('admin.dishes.priceFrom', { price: formatNumber(option.price), label: option.label }) : ''
}

/** "2026-10-14" as "14/10/2026". */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
