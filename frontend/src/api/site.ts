import { apiJson, send } from './client'
import type { ChoiceMode, SellBy } from './catalog'

export interface Contact {
  name: string | null
  phone: string | null
  address: string | null
  email: string | null
  openingHours: string | null
}

/** Behaviour not every business wants (FoodSite.Api `Features`): on in the site's site.json, or by the console. */
export type Feature = 'recommendations' | 'favorites' | 'reviews'

export interface Site {
  backgroundImageUrl: string | null
  deliveryEnabled: boolean
  pickupEnabled: boolean
  deliveryAreaText: string | null
  deliveryFeeText: string | null
  kashrutText: string | null
  paymentPhone: string | null
  /** The smallest order total in ₪; null when there is none. */
  minimumOrderAmount: number | null
  /** False when the minimum is for deliveries only. */
  minimumOrderAppliesToPickup: boolean
  contact: Contact
  /** The phones that can be chatted with on WhatsApp (the admin's notify list). */
  whatsAppPhones: string[]
  /** The cities deliveries go to; a delivery elsewhere waits for the admin. Empty: every city. */
  serviceCities: string[]
  /** The features that are on for this site. */
  features: Feature[]
}

export interface MenuOption {
  id: number
  label: string
  amount: number
  price: number
  isDefault: boolean
}

export interface MenuDish {
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
  /** Free choice: what one unit of the amount is called; absent or null for יחידה / ק"ג. */
  unitName?: string | null
  isAddOnOnly: boolean
  isSoldOut: boolean
  /** The order page shows the dish's choices right away, without clicking add first. */
  openByDefault?: boolean
  /** Counted by kind in the order's side-dish total, and not at all when added to another dish. */
  isSideDish?: boolean
  options: MenuOption[]
  images: string[]
  addOnDishIds: number[]
  /** For a dish with a per-date limit: how much is left on each open supply date ("yyyy-MM-dd"). */
  remaining?: Record<string, number> | null
}

export interface MenuCategory {
  id: number
  name: string
}

/** One hour a client can ask for, "HH:mm:ss" (the last of a day may be shorter). */
export interface HourSlot {
  from: string
  to: string
}

export interface SupplyDate {
  /** "yyyy-MM-dd" */
  date: string
  /** Local time ordering for this date closes, "yyyy-MM-ddTHH:mm:ss" */
  cutoff: string
  /** The hours to pick from; empty (or absent) when the day has no supply hours. */
  hours?: HourSlot[] | null
}

export interface Menu {
  categories: MenuCategory[]
  dishes: MenuDish[]
  supplyDates: SupplyDate[]
}

export type Fulfillment = 'Delivery' | 'Pickup'
export type Payment = 'OnDelivery' | 'Transfer'

export interface OrderLineInput {
  dishId: number
  optionId: number | null
  quantity: number
  addOns: { dishId: number; optionId: number | null; quantity: number }[]
}

export interface OrderInput {
  phone: string
  name: string
  city: string
  street: string
  houseNumber: string
  apartment: string
  supplyDate: string
  fulfillmentMethod: Fulfillment
  paymentMethod: Payment
  notes: string
  items: OrderLineInput[]
  /** The start of the picked hour ("HH:mm:ss"); required when the date has hours. */
  deliveryHour: string | null
}

export interface Confirmation {
  id: number
  supplyDate: string
  fulfillmentMethod: Fulfillment
  paymentMethod: Payment
  total: number
  paymentPhone: string | null
  /** A delivery outside the service city: it waits for the admin and holds no quantity yet. */
  needsReview: boolean
  items: {
    dishName: string
    optionLabel: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
    isAddOn: boolean
  }[]
  deliveryHour?: string | null
  /** The picked hour was already full: the admin may call to move it. */
  hourFull?: boolean
}

export const siteApi = {
  get: () => apiJson<Site>('/api/site'),
  menu: () => apiJson<Menu>('/api/menu'),
  /** Whether an hour is already full; asked only once the client picks it. */
  hourAvailability: (date: string, hour: string) =>
    apiJson<{ full: boolean }>(`/api/hour-availability?date=${date}&hour=${encodeURIComponent(hour)}`),
}

export const ordersApi = {
  create: (input: OrderInput) => apiJson<Confirmation>('/api/orders', send('POST', input)),
}

export const contactsApi = {
  get: () => apiJson<Contact>('/api/admin/contact'),
  save: (contact: Contact) => apiJson<Contact>('/api/admin/contact', send('PUT', contact)),
  notifyPhones: () => apiJson<NotifyPhone[]>('/api/admin/notify-phones'),
  addNotifyPhone: (phone: string, name: string) =>
    apiJson<NotifyPhone>('/api/admin/notify-phones', send('POST', { phone, name })),
  removeNotifyPhone: (id: number) => apiJson<void>(`/api/admin/notify-phones/${id}`, send('DELETE')),
}

export interface NotifyPhone {
  id: number
  phone: string
  name: string | null
}
