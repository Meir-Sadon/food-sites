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
export type Feature = 'recommendations' | 'favorites' | 'reviews' | 'advancedDishes'

/** The site's look (FoodSite.Api `SiteStyles`): fonts, shapes and layout. Colours stay in the site's theme.css. */
export type SiteStyle = 'classic' | 'street'

export const SITE_STYLES: readonly SiteStyle[] = ['classic', 'street']

/** Where the order total sits (FoodSite.Api `OrderLayout`): a bar at the bottom, or on a wide screen a panel at the side. */
export type OrderTotalPosition = 'bottom' | 'side'

export const ORDER_TOTAL_POSITIONS: readonly OrderTotalPosition[] = ['bottom', 'side']

/** The whole menu on one page, or one category at a time. */
export type OrderFlow = 'page' | 'steps'

export const ORDER_FLOWS: readonly OrderFlow[] = ['page', 'steps']

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
  /** The admin's choice, else the site's default from site.json. */
  style: SiteStyle
  /** The admin's choice, else the site's default from site.json. */
  orderTotalPosition: OrderTotalPosition
  /** The admin's choice, else the site's default from site.json. */
  orderFlow: OrderFlow
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
  /** A variant: shown in this main dish's card (with its images and description), ordered as a dish of its own. */
  mainDishId?: number | null
  /** Ordered or not, never in an amount. */
  isYesNo?: boolean
  /** How each add-on is offered under this dish, in the order of addOnDishIds; absent means its own prices. */
  addOns?: MenuAddOn[]
  /** Headings over some of the add-ons, each with a limit on the units picked from it. */
  addOnGroups?: MenuAddOnGroup[]
  /** Questions the client answers when ordering the dish (a variant's main dish's first). */
  questions?: MenuQuestion[]
}

/** How a dish question is answered (FoodSite.Api `QuestionKind`). */
export type QuestionKind = 'Text' | 'Number' | 'Date' | 'YesNo' | 'SingleChoice' | 'MultiChoice'

export const QUESTION_KINDS: readonly QuestionKind[] = ['Text', 'Number', 'Date', 'YesNo', 'SingleChoice', 'MultiChoice']

export interface MenuQuestion {
  id: number
  text: string
  kind: QuestionKind
  /** The choices of a single or multiple choice. */
  choices: string[]
  /** A single choice shown as a drop-down list instead of radio buttons. */
  showAsDropdown: boolean
  isRequired: boolean
}

/** Value for text, a number, a date (yyyy-MM-dd), yes/no ('yes' | 'no') and a single choice; choices for a multiple choice. */
export interface AnswerInput {
  questionId: number
  value?: string
  choices?: string[]
}

export interface MenuAddOn {
  dishId: number
  groupId: number | null
  /** Its price per unit under this dish, in its default option only; null keeps its own prices. */
  price: number | null
  /** The most of it under one ordered line; null for its own range. */
  maxQuantity: number | null
  /** Added or not, never in an amount. */
  isCheckbox: boolean
}

export interface MenuAddOnGroup {
  id: number
  name: string
  /** Units picked from the group together (a check box or a weight counts one); null for no limit. */
  maxUnits: number | null
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
  /** One entry per ordered unit, each with its own add-ons; sent instead of addOns for a dish ordered in several units. */
  addOnUnits?: { addOns: { dishId: number; optionId: number | null; quantity: number }[]; note?: string; answers?: AnswerInput[] }[]
  /** A name or remark for the line (for a dish not sold by units; units carry their own). */
  note?: string
  /** Answers to the dish's questions (for a dish not sold by units; units carry their own). */
  answers?: AnswerInput[]
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
