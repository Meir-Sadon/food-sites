import { apiJson, send } from './client'
import type { ColorSet, TrackingIds, DeliveryPricing, Corners, FontPair, OrderFlow, Palette, Shadows, Spacing, TileGroups, OrderTotalPosition, QuestionKind, SiteStyle } from './site'

export type Weekday = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
export const weekdays: Weekday[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export type Direction = 'Up' | 'Down'

export interface Settings {
  backgroundImageUrl: string | null
  deliveryEnabled: boolean
  pickupEnabled: boolean
  deliveryAreaText: string | null
  deliveryFeeText: string | null
  /** The regular setting's fixed delivery fee in ₪ (added for a service city); null means none. */
  deliveryFeeAmount: number | null
  kashrutText: string | null
  paymentPhone: string | null
  bitEnabled: boolean
  payBoxEnabled: boolean
  bitLink: string | null
  payBoxLink: string | null
  /** ₪; null means no minimum. */
  minimumOrderAmount: number | null
  /** False when the minimum is for deliveries only. */
  minimumOrderAppliesToPickup: boolean
  /** The order page first asks delivery or pickup and the address, then shows the dishes. */
  addressFirst: boolean
  /** Comma-separated, e.g. "אשקלון, אשדוד"; empty means every city is served. */
  serviceCities: string
  /** How many orders can be supplied in one hour; null means no limit. */
  ordersPerHour: number | null
  /** How many portions (dishes sold by units, not sides or add-ons) can be ordered per supply date, across all dishes; null means no limit. */
  portionsPerSupplyDate: number | null
  /** The look the client site shows. */
  style: SiteStyle
  /** Where the order total sits on wide screens. */
  orderTotalPosition: OrderTotalPosition
  /** One long page, or one category at a time. */
  orderFlow: OrderFlow
  /** How round the client site's corners are. */
  corners: Corners
  /** Where the owner is mailed about new orders and changes; empty means no mail. */
  ownerEmail: string
  /** Whether the same addresses also get the summary of admin changes to dishes and settings. */
  ownerChangeMails: boolean
  /** The ready-made colour palette the client site shows. */
  palette: Palette
  /** Colours the admin set per element; they win over the palette. */
  customColors: ColorSet
  /** Thickness in pixels of the lines (1 to 4); null keeps the original. Send 0 to clear. */
  lineWidth: number | null
  /** The font pair of the client site. */
  font: FontPair
  /** How strong the shadows of the client site are. */
  shadows: Shadows
  /** How much air there is between things on the client site. */
  spacing: Spacing
  /** How the tiles style shows a category. */
  tileGroups: TileGroups
  /** `simple` until the admin picks `zones`. */
  deliveryPricing: DeliveryPricing
  /** The marketing tools' ids; saved by `settingsApi.saveTracking`, never by `save`. */
  tracking: TrackingIds
}
/** Leaving out the style, the order layout, the corners or the colours keeps them: each has its own section, and saving one never pins the others' defaults. */
export type SettingsInput = Omit<Settings, 'backgroundImageUrl' | 'style' | 'orderTotalPosition' | 'orderFlow' | 'corners' | 'palette' | 'customColors' | 'lineWidth' | 'font' | 'shadows' | 'spacing' | 'tileGroups' | 'deliveryPricing' | 'tracking'> &
  Partial<Pick<Settings, 'style' | 'orderTotalPosition' | 'orderFlow' | 'corners' | 'palette' | 'customColors' | 'lineWidth' | 'font' | 'shadows' | 'spacing' | 'tileGroups' | 'deliveryPricing'>>

/** Saved on its own (`settingsApi.saveTracking`); a missing id keeps that tool, an empty one turns it off. */
export type TrackingInput = Partial<Omit<TrackingIds, 'metaServerEvents'>> & {
  /** Write-only: the Meta Conversions API access token; an empty text removes it. */
  metaAccessToken?: string
}

export interface SupplyDay {
  weekday: Weekday
  enabled: boolean
  cutoffDay: Weekday
  /** "HH:mm:ss" */
  cutoffTime: string
  /** The day's supply hours, "HH:mm:ss"; both null when the client picks no hour. */
  deliveryFrom: string | null
  deliveryTo: string | null
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

/** The special-diet marks a dish can carry (FoodSite.Api `DietaryTags`); the texts are `dietaryTags.<id>` in he.json. */
export const DIETARY_TAGS = [
  'glutenFree', 'vegetarian', 'vegan', 'parve', 'lactoseFree', 'sugarFree', 'nutFree', 'eggFree', 'saltFree', 'kosherForPassover',
] as const
/** The id of the question a dish with dietary tags asks (FoodSite.Api `DietaryTags.QuestionId`); its choices are the tags in order. */
export const DIETARY_QUESTION_ID = -1
export type DietaryTag = (typeof DIETARY_TAGS)[number]

export interface DishImage {
  id: number
  url: string
  displayOrder: number
}

export interface Dish {
  id: number
  name: string
  categoryId: number
  /** Position within its category; the menu shows dishes in this order. */
  displayOrder: number
  description: string | null
  allergenInfo: string | null
  sellBy: SellBy
  choiceMode: ChoiceMode
  minAmount: number | null
  maxAmount: number | null
  amountStep: number | null
  unitPrice: number | null
  /** Free choice: what one unit of the amount is called (e.g. "מגש של 50"); null for יחידה / ק"ג. */
  unitName: string | null
  /** Fixed options: the heading over the choices ("בחרו גודל"), or null for the default one. */
  optionsTitle: string | null
  /** Fixed options: shown on the order page as what each adds to the default option's price. */
  showOptionDifference: boolean
  isAddOnOnly: boolean
  isSoldOut: boolean
  openByDefault: boolean
  isSideDish: boolean
  /** Most that can be ordered per supply date (units, or kilos), or null for no limit. */
  maxPerSupplyDate: number | null
  isHidden: boolean
  /** Special-diet marks (ids from DIETARY_TAGS) shown on the order page. */
  dietaryTags: DietaryTag[]
  /** The client may pick only one of the tags (radio buttons) instead of several together. */
  dietaryTagsSingle: boolean
  options: DishOption[]
  images: DishImage[]
  /** Dishes this dish is offered under as an add-on. */
  parentDishIds: number[]
  /** Add-ons offered under this dish. */
  addOnDishIds: number[]
  /** A variant: the main dish whose card it is shown in. */
  mainDishId: number | null
  /** A variant priced like its main dish. */
  useMainDishPrice: boolean
  /** Ordered or not, never in an amount. */
  isYesNo: boolean
  addOnGroups: AddOnGroup[]
  /** This dish's add-ons in the admin's order, with how each is offered here. */
  addOns: AddOnLink[]
  /** Questions the client answers when ordering the dish, in order. */
  questions: DishQuestion[]
  /** The client may order without adjusting each unit or answering its questions (a variant follows its main dish). */
  adjustmentOptional: boolean
}

export interface DishQuestion {
  id: number
  text: string
  kind: QuestionKind
  choices: string[]
  showAsDropdown: boolean
  isRequired: boolean
  /** The answer already picked for the client: one of the choices, or 'yes' / 'no'; null for none. */
  defaultAnswer: string | null
}

export interface AddOnGroup {
  id: number
  name: string
  maxUnits: number | null
}

export interface AddOnLink {
  dishId: number
  groupId: number | null
  /** Price per unit under this dish; null keeps the add-on's own prices. */
  price: number | null
  maxQuantity: number | null
  isCheckbox: boolean
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
  unitName: string | null
  isAddOnOnly: boolean
  isSoldOut: boolean
  openByDefault: boolean
  isSideDish: boolean
  maxPerSupplyDate: number | null
  options: { id: number | null; label: string; amount: number; price: number; isDefault: boolean }[]
  parentDishIds: number[]
  mainDishId?: number | null
  useMainDishPrice?: boolean
  isYesNo?: boolean
  /** Sent together with addOns; `group` in an add-on is an index into this list. */
  addOnGroups?: { id: number | null; name: string; maxUnits: number | null }[]
  /** The whole list of this dish's add-ons; left out, they stay as they are. */
  addOns?: { dishId: number; group: number | null; price: number | null; maxQuantity: number | null; isCheckbox: boolean }[]
  /** The whole list of the dish's questions; left out, they stay as they are. */
  questions?: {
    id: number | null
    text: string
    kind: QuestionKind
    choices: string[]
    showAsDropdown: boolean
    isRequired: boolean
    defaultAnswer: string | null
  }[]
  /** On a new dish: give it the images of this dish (it is a copy of it). */
  copyImagesFrom?: number
  adjustmentOptional?: boolean
  optionsTitle?: string | null
  showOptionDifference?: boolean
  /** The whole list of the dish's special-diet marks; left out, they stay as they are. */
  dietaryTags?: DietaryTag[]
  dietaryTagsSingle?: boolean
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_DISH_IMAGES = 6
export const DESCRIPTION_MAX_LENGTH = 254
export const UNIT_NAME_MAX_LENGTH = 30
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
  saveTracking: (input: TrackingInput) => apiJson<Settings>(`${admin}/settings/tracking`, send('PUT', input)),
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

export interface DishGroup {
  id: number
  name: string
  displayOrder: number
  /** Dishes ordered on their own (not variants or add-ons), from any category. */
  dishIds: number[]
}

/** A delivery area drawn on the map; `polygon` holds its corners as [lat, lng]. */
export interface DeliveryZone {
  id: number | null
  name: string
  fee: number
  /** No deliveries into this area. */
  isBlocked: boolean
  polygon: [number, number][]
}

export const deliveryZonesApi = {
  get: () => apiJson<DeliveryZone[]>(`${admin}/delivery-zones`),
  /** The list sent replaces the stored one; its order is the priority where zones overlap. */
  save: (zones: DeliveryZone[]) => apiJson<DeliveryZone[]>(`${admin}/delivery-zones`, send('PUT', { zones })),
}

export const dishGroupsApi = {
  get: () => apiJson<DishGroup[]>(`${admin}/dish-groups`),
  add: (name: string, dishIds: number[]) => apiJson<DishGroup>(`${admin}/dish-groups`, send('POST', { name, dishIds })),
  update: (id: number, name: string, dishIds: number[]) =>
    apiJson<DishGroup>(`${admin}/dish-groups/${id}`, send('PUT', { name, dishIds })),
  move: (id: number, direction: Direction) =>
    apiJson<DishGroup[]>(`${admin}/dish-groups/${id}/move`, send('POST', { direction })),
  remove: (id: number) => apiJson<void>(`${admin}/dish-groups/${id}`, send('DELETE')),
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
  /** Sets the order of a category's dishes (all that are not removed); answers every dish. */
  reorder: (categoryId: number, dishIds: number[]) =>
    apiJson<Dish[]>(`${admin}/dishes/order`, send('PUT', { categoryId, dishIds })),
  /** Sets the order of all the dish's images; the first is its main image. */
  reorderImages: (id: number, imageIds: number[]) =>
    apiJson<Dish>(`${admin}/dishes/${id}/images/order`, send('PUT', { imageIds })),
}
