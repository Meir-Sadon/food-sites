import { apiJson, send } from './client'
import type { BadgeNewUnit } from './site'

const base = '/api/admin/price-lists'

/** A price list (feature `priceLists`). The default list has no name (the site's text names it) and is the regular prices. */
export interface PriceList {
  id: number
  name: string | null
  isDefault: boolean
  /** The list its prices were copied from; null is the default list. */
  baseListId: number | null
  /** The clients' phones the list is for, in their local form. */
  phones: string[]
  /** The clients the list is for by what they are doing, besides its phones. */
  statuses: PriceListStatuses
  discount: PriceListDiscount
}

/** Which wins where a dish has a discount of its own: the general one, the dish's, the bigger or the smaller discount. */
export type DiscountRule = 'general' | 'dish' | 'higher' | 'lower'

export const DISCOUNT_RULES: readonly DiscountRule[] = ['general', 'dish', 'higher', 'lower']

/** A discount on the whole menu: `percent` off each base price (null is none), rounded up to a whole shekel, in its dates. */
export interface PriceListDiscount {
  percent: number | null
  /** "yyyy-MM-dd", both included; null leaves that side open. */
  from: string | null
  to: string | null
  rule: DiscountRule
}

export const noDiscount: PriceListDiscount = { percent: null, from: null, to: null, rule: 'dish' }

/** Any one is enough: registered within the period, no order that was not cancelled, dishes in the saved cart, an open order above the amount. */
export interface PriceListStatuses {
  newClientsAmount: number | null
  newClientsUnit: BadgeNewUnit | null
  noOrders: boolean
  midOrder: boolean
  openOrderAbove: number | null
}

export const hasStatuses = (s: PriceListStatuses) => s.newClientsAmount !== null || s.noOrders || s.midOrder || s.openOrderAbove !== null

export const noStatuses: PriceListStatuses = { newClientsAmount: null, newClientsUnit: null, noOrders: false, midOrder: false, openOrderAbove: null }

/** A dish in a list. `inList` is false for a dish added after the list was made, shown at its base list's price until saved. */
export interface PriceListDish {
  dishId: number
  name: string
  categoryId: number
  imageUrl: string | null
  /** The dish's regular main price: its default option's, or per unit or kilo. */
  regularPrice: number
  basePrice: number
  price: number
  /** "yyyy-MM-dd", both included; null leaves that side open. */
  from: string | null
  to: string | null
  inList: boolean
  /** The dish's other prices: its other options, add-on prices and prices above a limit. */
  subPrices: SubPrice[]
}

export type SubPriceKind = 'option' | 'addOn' | 'addOnOverLimit' | 'groupOverLimit'

/** One of a dish's other prices in a list; `inList` is false when the list has no price of its own for it yet. */
export interface SubPrice {
  key: string
  kind: SubPriceKind
  /** The option's label, the add-on's name, or the group's name. */
  name: string
  regularPrice: number
  basePrice: number
  price: number
  inList: boolean
}

export interface SubPriceInput {
  key: string
  basePrice: number
  price: number
}

export interface PriceListDishInput {
  dishId: number
  basePrice: number
  price: number
  from: string | null
  to: string | null
  /** Left out keeps the saved ones. */
  subPrices?: SubPriceInput[]
}

/** A dish in one list, for the dish's own price lists window. */
export interface ListDish {
  list: PriceList
  dish: PriceListDish
}

/** The lists whose prices were copied from `list`: the ones it is the base of. */
export const linkedLists = (list: PriceList, lists: PriceList[]) =>
  lists.filter((l) => !l.isDefault && (list.isDefault ? l.baseListId === null : l.baseListId === list.id))

export const priceListsApi = {
  getAll: () => apiJson<PriceList[]>(base),
  create: (name: string, baseListId: number | null) => apiJson<PriceList>(base, send('POST', { name, baseListId })),
  /** Leaving `discount` out keeps the list's general discount. */
  update: (id: number, name: string, baseListId: number | null, discount?: PriceListDiscount) =>
    apiJson<PriceList>(`${base}/${id}`, send('PUT', { name, baseListId, discount })),
  remove: (id: number) => apiJson<void>(`${base}/${id}`, send('DELETE')),
  dishes: (id: number) => apiJson<PriceListDish[]>(`${base}/${id}/dishes`),
  /** With `updateLinked`, a changed price also becomes the base price in the lists based on this one. */
  saveDishes: (id: number, dishes: PriceListDishInput[], updateLinked = false) =>
    apiJson<PriceListDish[]>(`${base}/${id}/dishes${updateLinked ? '?updateLinked=true' : ''}`, send('PUT', { dishes })),
  dish: (dishId: number) => apiJson<ListDish[]>(`${base}/dishes/${dishId}`),
  savePhones: (id: number, phones: string[]) => apiJson<PriceList>(`${base}/${id}/phones`, send('PUT', { phones })),
  saveStatuses: (id: number, statuses: PriceListStatuses) => apiJson<PriceList>(`${base}/${id}/statuses`, send('PUT', statuses)),
}
