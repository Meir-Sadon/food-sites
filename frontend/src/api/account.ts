import { apiJson, send } from './client'

export interface Profile {
  id: number
  /** Local form, "0501234567" */
  phone: string
  fullName: string
  city: string
  street: string
  houseNumber: string
  apartment: string
  /** The parts above, joined into one line. */
  address: string
  email: string | null
  /** "yyyy-MM-dd" */
  birthday: string | null
  ethnicBackground: string | null
}

export interface ProfileInput {
  phone: string
  fullName: string
  city: string
  street: string
  houseNumber: string
  apartment: string
  email: string
  birthday: string
  ethnicBackground: string
  /** Proves a new phone. Not needed when the phone stays as it is. */
  verificationToken: string
}

export type OrderStatus = 'New' | 'Confirmed' | 'Ready' | 'Delivered' | 'Cancelled'

export interface HistoryItem {
  id: number
  dishId: number
  /** Set for add-on lines: the id of the line they were ordered under. */
  parentItemId: number | null
  dishName: string
  optionLabel: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface HistoryOrder {
  id: number
  supplyDate: string
  status: OrderStatus
  fulfillmentMethod: 'Delivery' | 'Pickup'
  paymentMethod: 'OnDelivery' | 'Transfer'
  isPaid: boolean
  total: number
  createdAt: string
  items: HistoryItem[]
}

export interface Favorite {
  id: number
  name: string
  items: { dishId: number; optionId: number | null; quantity: number; addOns: { dishId: number; optionId: number | null; quantity: number }[] }[]
}

export interface Recommendation {
  id: number
  text: string
  createdAt: string
  isHandled: boolean
}

export const MAX_RECOMMENDATION_LENGTH = 1000
export const MAX_FAVORITE_NAME_LENGTH = 60

const account = '/api/account'

export const accountApi = {
  me: () => apiJson<Profile>(`${account}/me`),
  login: (phone: string, verificationToken: string) =>
    apiJson<Profile>(`${account}/login`, send('POST', { phone, verificationToken })),
  register: (input: ProfileInput) => apiJson<Profile>(`${account}/register`, send('POST', input)),
  logout: () => apiJson<void>(`${account}/logout`, send('POST')),
  update: (input: ProfileInput) => apiJson<Profile>(`${account}/me`, send('PUT', input)),
  orders: () => apiJson<HistoryOrder[]>(`${account}/orders`),
  favorites: () => apiJson<Favorite[]>(`${account}/favorites`),
  addFavorite: (name: string, orderId: number) => apiJson<Favorite>(`${account}/favorites`, send('POST', { name, orderId })),
  removeFavorite: (id: number) => apiJson<void>(`${account}/favorites/${id}`, send('DELETE')),
  recommendations: () => apiJson<Recommendation[]>(`${account}/recommendations`),
  addRecommendation: (text: string) => apiJson<Recommendation>(`${account}/recommendations`, send('POST', { text })),
}
