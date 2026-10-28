import { apiJson, send } from './client'

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
}

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
}

export interface PriceListDishInput {
  dishId: number
  basePrice: number
  price: number
  from: string | null
  to: string | null
}

export const priceListsApi = {
  getAll: () => apiJson<PriceList[]>(base),
  create: (name: string, baseListId: number | null) => apiJson<PriceList>(base, send('POST', { name, baseListId })),
  update: (id: number, name: string, baseListId: number | null) =>
    apiJson<PriceList>(`${base}/${id}`, send('PUT', { name, baseListId })),
  remove: (id: number) => apiJson<void>(`${base}/${id}`, send('DELETE')),
  dishes: (id: number) => apiJson<PriceListDish[]>(`${base}/${id}/dishes`),
  saveDishes: (id: number, dishes: PriceListDishInput[]) =>
    apiJson<PriceListDish[]>(`${base}/${id}/dishes`, send('PUT', { dishes })),
  savePhones: (id: number, phones: string[]) => apiJson<PriceList>(`${base}/${id}/phones`, send('PUT', { phones })),
}
