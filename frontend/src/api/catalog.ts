import { apiJson, send } from './client'

export type Weekday = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
export const weekdays: Weekday[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export type Direction = 'Up' | 'Down'

export interface Settings {
  backgroundImageUrl: string | null
  deliveryEnabled: boolean
  pickupEnabled: boolean
  deliveryAreaText: string | null
  deliveryFeeText: string | null
  kashrutText: string | null
  paymentPhone: string | null
  /** ₪; null means no minimum. */
  minimumOrderAmount: number | null
}
export type SettingsInput = Omit<Settings, 'backgroundImageUrl'>

export interface SupplyDay {
  weekday: Weekday
  enabled: boolean
  cutoffDay: Weekday
  /** "HH:mm:ss" */
  cutoffTime: string
}

export interface ClosedDate {
  id: number
  /** "yyyy-MM-dd" */
  date: string
  reason: string | null
}

export interface Category {
  id: number
  name: string
  displayOrder: number
  dishCount: number
}

export type SellBy = 'Units' | 'Weight'
export type ChoiceMode = 'Fixed' | 'Free'

export interface DishOption {
  id: number
  label: string
  amount: number
  price: number
  isDefault: boolean
}

export interface DishImage {
  id: number
  url: string
  displayOrder: number
}

export interface Dish {
  id: number
  name: string
  categoryId: number
  description: string | null
  allergenInfo: string | null
  sellBy: SellBy
  choiceMode: ChoiceMode
  minAmount: number | null
  maxAmount: number | null
  amountStep: number | null
  unitPrice: number | null
  isAddOnOnly: boolean
  isSoldOut: boolean
  openByDefault: boolean
  isSideDish: boolean
  /** Most that can be ordered per supply date (units, or kilos), or null for no limit. */
  maxPerSupplyDate: number | null
  isHidden: boolean
  options: DishOption[]
  images: DishImage[]
  /** Dishes this dish is offered under as an add-on. */
  parentDishIds: number[]
  /** Add-ons offered under this dish. */
  addOnDishIds: number[]
}

export interface DishInput {
  name: string
  categoryId: number
  description: string | null
  allergenInfo: string | null
  sellBy: SellBy
  choiceMode: ChoiceMode
  minAmount: number | null
  maxAmount: number | null
  amountStep: number | null
  unitPrice: number | null
  isAddOnOnly: boolean
  isSoldOut: boolean
  openByDefault: boolean
  isSideDish: boolean
  maxPerSupplyDate: number | null
  options: { id: number | null; label: string; amount: number; price: number; isDefault: boolean }[]
  parentDishIds: number[]
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_DISH_IMAGES = 6
export const DESCRIPTION_MAX_LENGTH = 254
export const IMAGE_TYPES = 'image/jpeg,image/png,image/webp'

function upload(file: File): RequestInit {
  const form = new FormData()
  form.append('file', file)
  return { method: 'POST', body: form }
}

const admin = '/api/admin'

export const settingsApi = {
  get: () => apiJson<Settings>(`${admin}/settings`),
  save: (input: SettingsInput) => apiJson<Settings>(`${admin}/settings`, send('PUT', input)),
  uploadBackground: (file: File) => apiJson<Settings>(`${admin}/settings/background`, { ...upload(file), method: 'PUT' }),
  removeBackground: () => apiJson<Settings>(`${admin}/settings/background`, send('DELETE')),
}

export const supplyDaysApi = {
  get: () => apiJson<SupplyDay[]>(`${admin}/supply-days`),
  save: (days: SupplyDay[]) => apiJson<SupplyDay[]>(`${admin}/supply-days`, send('PUT', days)),
}

export const closedDatesApi = {
  get: () => apiJson<ClosedDate[]>(`${admin}/closed-dates`),
  add: (date: string, reason: string) => apiJson<ClosedDate>(`${admin}/closed-dates`, send('POST', { date, reason })),
  remove: (id: number) => apiJson<void>(`${admin}/closed-dates/${id}`, send('DELETE')),
}

export const categoriesApi = {
  get: () => apiJson<Category[]>(`${admin}/categories`),
  add: (name: string) => apiJson<Category>(`${admin}/categories`, send('POST', { name })),
  rename: (id: number, name: string) => apiJson<void>(`${admin}/categories/${id}`, send('PUT', { name })),
  move: (id: number, direction: Direction) =>
    apiJson<Category[]>(`${admin}/categories/${id}/move`, send('POST', { direction })),
  remove: (id: number) => apiJson<void>(`${admin}/categories/${id}`, send('DELETE')),
}

export const dishesApi = {
  getAll: () => apiJson<Dish[]>(`${admin}/dishes`),
  get: (id: number) => apiJson<Dish>(`${admin}/dishes/${id}`),
  create: (input: DishInput) => apiJson<Dish>(`${admin}/dishes`, send('POST', input)),
  update: (id: number, input: DishInput) => apiJson<Dish>(`${admin}/dishes/${id}`, send('PUT', input)),
  setSoldOut: (id: number, isSoldOut: boolean) =>
    apiJson<void>(`${admin}/dishes/${id}/sold-out`, send('PUT', { isSoldOut })),
  remove: (id: number) => apiJson<void>(`${admin}/dishes/${id}`, send('DELETE')),
  /** Orders not yet supplied that contain this dish. */
  affectedOrders: (id: number) => apiJson<{ count: number }>(`${admin}/dishes/${id}/affected-orders`),
  restore: (id: number) => apiJson<Dish>(`${admin}/dishes/${id}/restore`, send('POST')),
  addImage: (id: number, file: File) => apiJson<Dish>(`${admin}/dishes/${id}/images`, upload(file)),
  removeImage: (id: number, imageId: number) => apiJson<Dish>(`${admin}/dishes/${id}/images/${imageId}`, send('DELETE')),
  moveImage: (id: number, imageId: number, direction: Direction) =>
    apiJson<Dish>(`${admin}/dishes/${id}/images/${imageId}/move`, send('POST', { direction })),
}
