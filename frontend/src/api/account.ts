import { apiJson, send } from './client'
import type { Payment } from './site'
import type { ReviewStatus } from './reviews'

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
  /** The saved addresses, the default one first. The address fields above are the default one. */
  addresses: SavedAddress[]
}

/** One of the client's saved addresses (home, work...). */
export interface SavedAddress {
  id: number
  label: string | null
  city: string
  street: string
  houseNumber: string
  apartment: string
  /** The parts joined into one line. */
  address: string
  isDefault: boolean
}

export interface AddressInput {
  label: string
  city: string
  street: string
  houseNumber: string
  apartment: string
  makeDefault: boolean
}

/** Logging in with a phone that has no account makes one: `isNew` says it just happened. */
export interface LoginResult {
  profile: Profile
  isNew: boolean
}

/** What the client chose to keep after the order with this id. */
export interface RememberInput {
  orderId: number
  phone: string
  name: string
  city: string
  street: string
  houseNumber: string
  apartment: string
}

/** `saved` without a profile: a guest, remembered by phone until they log in. Not saved: the phone has an account they are not logged in as. */
export interface Remembered {
  saved: boolean
  profile: Profile | null
}

/** A Google sign-in answers with the profile, or, for a person with no account yet, what Google knows to prefill the form. */
export interface GoogleLogin {
  profile: Profile | null
  registration: { fullName: string | null; email: string | null } | null
}

export interface ProfileInput {
  phone: string
  fullName: string
  city: string
  street: string
  houseNumber: string
  apartment: string
  email: string
  birthday: string | null
  ethnicBackground: string
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
  paymentMethod: Payment
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

/** A review the client sent on one of their orders. */
export interface MyReview {
  id: number
  orderId: number
  supplyDate: string
  rating: number
  comment: string | null
  name: string | null
  images: string[]
  /** Pending until the business approves it for the site; Blocked is not shown. */
  status: ReviewStatus
  submittedAt: string
}

export const MAX_ADDRESSES = 10
export const MAX_RECOMMENDATION_LENGTH = 1000
export const MAX_FAVORITE_NAME_LENGTH = 60

const account = '/api/account'

export const accountApi = {
  me: () => apiJson<Profile>(`${account}/me`),
  login: (phone: string) => apiJson<LoginResult>(`${account}/login`, send('POST', { phone })),
  google: (credential: string) => apiJson<GoogleLogin>(`${account}/google`, send('POST', { credential })),
  googleRegister: (credential: string, profile: ProfileInput) =>
    apiJson<Profile>(`${account}/google/register`, send('POST', { credential, profile })),
  logout: () => apiJson<void>(`${account}/logout`, send('POST')),
  update: (input: ProfileInput) => apiJson<Profile>(`${account}/me`, send('PUT', input)),
  addAddress: (input: AddressInput) => apiJson<Profile>(`${account}/addresses`, send('POST', input)),
  updateAddress: (id: number, input: AddressInput) => apiJson<Profile>(`${account}/addresses/${id}`, send('PUT', input)),
  makeDefaultAddress: (id: number) => apiJson<Profile>(`${account}/addresses/${id}/default`, send('PUT')),
  deleteAddress: (id: number) => apiJson<Profile>(`${account}/addresses/${id}`, send('DELETE')),
  remember: (input: RememberInput) => apiJson<Remembered>(`${account}/remember`, send('POST', input)),
  orders: () => apiJson<HistoryOrder[]>(`${account}/orders`),
  favorites: () => apiJson<Favorite[]>(`${account}/favorites`),
  addFavorite: (name: string, orderId: number) => apiJson<Favorite>(`${account}/favorites`, send('POST', { name, orderId })),
  removeFavorite: (id: number) => apiJson<void>(`${account}/favorites/${id}`, send('DELETE')),
  recommendations: () => apiJson<Recommendation[]>(`${account}/recommendations`),
  addRecommendation: (text: string) => apiJson<Recommendation>(`${account}/recommendations`, send('POST', { text })),
  reviews: () => apiJson<MyReview[]>(`${account}/reviews`),
}
