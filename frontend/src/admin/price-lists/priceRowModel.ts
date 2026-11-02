import type { PriceListDiscount, PriceListDish, PriceListDishInput } from '../../api/priceLists'

export interface SubRow {
  key: string
  basePrice: string
  price: string
}

/** A dish's prices in a list as the form holds them. */
export interface Row {
  dishId: number
  basePrice: string
  price: string
  from: string
  to: string
  subs: SubRow[]
}

export const rowOf = (d: PriceListDish): Row => ({
  dishId: d.dishId,
  basePrice: String(d.basePrice),
  price: String(d.price),
  from: d.from ?? '',
  to: d.to ?? '',
  subs: d.subPrices.map((s) => ({ key: s.key, basePrice: String(s.basePrice), price: String(s.price) })),
})

/** What is sent for a row. In the default list a price is the regular one, so its base and dates mean nothing. */
export const inputOf = (row: Row, isDefault: boolean): PriceListDishInput => ({
  dishId: row.dishId,
  basePrice: Number(isDefault ? row.price : row.basePrice),
  price: Number(row.price),
  from: isDefault ? null : row.from || null,
  to: isDefault ? null : row.to || null,
  subPrices: row.subs.map((s) => ({ key: s.key, basePrice: Number(isDefault ? s.price : s.basePrice), price: Number(s.price) })),
})

/** Whether any price of the row differs from the saved one (the ones lists based on it were copied from). */
export const pricesChanged = (row: Row, saved: Row) =>
  Number(row.price) !== Number(saved.price) ||
  row.subs.some((s) => Number(s.price) !== Number(saved.subs.find((x) => x.key === s.key)?.price))

/** Changing a base price moves a price that followed it (equal to it), so it stays no discount. */
function follow<T extends { basePrice: string; price: string }>(current: T, patch: Partial<T>): T {
  const follows = patch.basePrice !== undefined && current.price === current.basePrice
  return { ...current, ...patch, ...(follows && { price: patch.basePrice }) }
}

export function patchRow(row: Row, patch: Partial<Omit<Row, 'subs'>>): Row {
  return follow<Row>(row, patch)
}

export function patchSub(row: Row, key: string, patch: Partial<SubRow>): Row {
  return { ...row, subs: row.subs.map((s) => (s.key === key ? follow(s, patch) : s)) }
}

const inDates = (day: string, from: string | null, to: string | null) => (!from || from <= day) && (!to || to >= day)

/** A price less the general discount, rounded up to a whole shekel and never above the price (as the server does). */
export const discounted = (price: number, percent: number) =>
  Math.min(price, Math.max(0, Math.ceil((price * (100 - percent)) / 100 - 1e-9)))

/**
 * What a client on the list pays on `day` ("yyyy-MM-dd") for a price with this base and list price: the row's price in
 * its dates, the general discount in its own, and the list's rule where the dish has a discount of its own. Null when
 * the list leaves the regular price.
 */
export function clientPrice(basePrice: number, price: number, row: { from: string; to: string }, discount: PriceListDiscount, day: string) {
  const own = inDates(day, row.from || null, row.to || null) ? price : null
  if (discount.percent === null || !inDates(day, discount.from, discount.to)) return own
  const general = discounted(basePrice, discount.percent)
  if (own === null || own === basePrice) return general
  switch (discount.rule) {
    case 'general':
      return general
    case 'higher':
      return Math.min(general, own)
    case 'lower':
      return Math.max(general, own)
    default:
      return own
  }
}
