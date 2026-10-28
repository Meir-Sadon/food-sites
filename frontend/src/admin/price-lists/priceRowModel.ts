import type { PriceListDish, PriceListDishInput } from '../../api/priceLists'

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
