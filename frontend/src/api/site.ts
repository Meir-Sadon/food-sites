import { apiJson, send } from './client'
import type { ChoiceMode, SellBy } from './catalog'
import type { Popup } from './popup'
import type { SocialLink } from './social'

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
export type SiteStyle = 'classic' | 'street' | 'tiles'

export const SITE_STYLES: readonly SiteStyle[] = ['classic', 'street', 'tiles']

/** Where the order total sits (FoodSite.Api `OrderLayout`): a bar at the bottom, or on a wide screen a panel at the side. */
export type OrderTotalPosition = 'bottom' | 'side'

export const ORDER_TOTAL_POSITIONS: readonly OrderTotalPosition[] = ['bottom', 'side']

/** The whole menu on one page, or one category at a time. */
export type OrderFlow = 'page' | 'steps' | 'continue'

export const ORDER_FLOWS: readonly OrderFlow[] = ['page', 'steps', 'continue']

/** How round the client site's corners are (FoodSite.Api `Corners`); `rounded` is the original look. */
export type Corners = 'square' | 'slight' | 'rounded' | 'round'

export const CORNERS: readonly Corners[] = ['square', 'slight', 'rounded', 'round']

/** The ready-made colour palettes (FoodSite.Api `Palettes`); `site` is the site's own colours from its theme.css. */
export const PALETTES = ['site', 'olive', 'berry', 'ocean', 'sunset', 'graphite', 'rose'] as const
export type Palette = (typeof PALETTES)[number]

/** The elements the admin can set a colour for (FoodSite.Api `Palettes.ColorKeys`). */
export const COLOR_KEYS = [
  'background', 'text', 'accent', 'button', 'buttonText', 'menu', 'menuText',
  'banner', 'bannerText', 'dishBackground', 'dishText', 'categoryBackground', 'line',
] as const
export type ColorKey = (typeof COLOR_KEYS)[number]

/** Colours by element as `#rrggbb`, or `=<element>` to copy another element's colour. */
export type ColorSet = Partial<Record<ColorKey, string>>

export const MAX_LINE_WIDTH = 4

/** Font pair, shadow strength and spacing of the client site (FoodSite.Api `Finish`); `standard` keeps what the style does. */
export const FONTS = ['standard', 'friendly', 'elegant'] as const
export type FontPair = (typeof FONTS)[number]
export const SHADOWS = ['standard', 'none', 'soft', 'strong'] as const
export type Shadows = (typeof SHADOWS)[number]
export const SPACINGS = ['standard', 'compact', 'spacious'] as const
export type Spacing = (typeof SPACINGS)[number]

/** How the tiles style shows a category: in a framed block, or minimal (a plain heading with the tiles under it). */
export const TILE_GROUPS = ['framed', 'minimal'] as const
export type TileGroups = (typeof TILE_GROUPS)[number]

/** The ids of the marketing tools the owner connected; an empty string means that tool is off. */
export interface TrackingIds {
  /** Meta (Facebook / Instagram) Pixel id: digits from Events Manager. */
  metaPixelId: string
  /** Google Analytics 4 measurement id, `G-…`. */
  googleAnalyticsId: string
  /** Google Tag Manager container id, `GTM-…`. */
  googleTagManagerId: string
  /** TikTok pixel code. */
  tikTokPixelId: string
  /** Google Ads conversion id, `AW-…`. */
  googleAdsId: string
  /** The Ads conversion counted when an order is sent. */
  googleAdsPurchaseLabel: string
  /** The server also reports each order to Meta (an access token is saved; it is never returned). */
  metaServerEvents: boolean
}

export interface Site {
  backgroundImageUrl: string | null
  deliveryEnabled: boolean
  pickupEnabled: boolean
  deliveryAreaText: string | null
  deliveryFeeText: string | null
  /** The regular setting's fixed delivery fee in ₪ (added to deliveries to a service city); null when there is none. */
  deliveryFeeAmount: number | null
  /** The advanced setting's base fee: what a large order's delivery is discounted by; null means no discount there. */
  deliveryBaseFee: number | null
  /** From this dishes total (₪) the delivery fee is discounted; null means never. */
  deliveryDiscountMinOrder: number | null
  kashrutText: string | null
  paymentPhone: string | null
  /** Whether the client may choose to pay with Bit / PayBox (needs the payment phone). */
  bitEnabled: boolean
  payBoxEnabled: boolean
  /** The smallest order total in ₪; null when there is none. */
  minimumOrderAmount: number | null
  /** False when the minimum is for deliveries only. */
  minimumOrderAppliesToPickup: boolean
  /** The order page first asks delivery or pickup and the address, then shows the dishes. */
  addressFirst: boolean
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
  /** The admin's choice, else the site's default from site.json. */
  corners: Corners
  /** The admin's choice, else the site's default from site.json. */
  palette: Palette
  /** The admin's own colours; they win over the palette. */
  customColors: ColorSet
  /** Thickness in pixels of the lines; null keeps the original. */
  lineWidth: number | null
  font: FontPair
  shadows: Shadows
  spacing: Spacing
  /** Only the tiles style uses it. */
  tileGroups: TileGroups
  /** `zones`: the delivery fee comes from the zones the admin drew, worked out from the address. */
  deliveryPricing: DeliveryPricing
  /** The buttons on the About page: Facebook, Instagram, TikTok, then the custom links. Empty: none. */
  socialLinks: SocialLink[]
  /** The site's Google OAuth client id; missing while "Sign in with Google" is not set up, and the button stays hidden. */
  googleClientId?: string | null
  /** Which marketing tools to load. */
  tracking?: TrackingIds
  /** Which item badges ("new", "almost out") are on, and when they apply. */
  badges?: ItemBadges
  /** The window shown when the site opens; missing while it is off. */
  popup?: Popup | null
}

/** How delivery is priced (FoodSite.Api `DeliveryPricing`): the text only, or by the zones drawn on a map. */
export type DeliveryPricing = 'simple' | 'zones'

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
  /**
   * The client may order without adjusting each unit (picking an add-on or confirming it as it is) or answering its
   * questions, required ones included.
   */
  adjustmentOptional?: boolean
  /** The heading over the fixed options ("בחרו גודל"); null for the default one. */
  optionsTitle?: string | null
  /** Show each option as what it adds to the default option's price. */
  showOptionDifference?: boolean
  /** Special-diet marks (ids from DIETARY_TAGS in api/catalog.ts). */
  dietaryTags?: string[]
  /** The admin marked the dish as on sale. */
  onSale?: boolean
  /** Created within the period the admin set for the "new" badge (always false while that badge is off). */
  isNew?: boolean
  /** The most that can be ordered per date (its own limit or the site's portion limit), the base of the "almost out" percentage. */
  limit?: number | null
}

/** The "new" and "almost out" badges (FoodSite.Api `ItemBadges`): the admin's settings. */
export type BadgeNewUnit = 'day' | 'week' | 'month'
export type LowStockMode = 'percent' | 'units'
export const BADGE_NEW_UNITS: readonly BadgeNewUnit[] = ['day', 'week', 'month']
export const LOW_STOCK_MODES: readonly LowStockMode[] = ['percent', 'units']
export interface ItemBadges {
  newEnabled: boolean
  newAmount: number
  newUnit: BadgeNewUnit
  lowStockEnabled: boolean
  lowStockMode: LowStockMode
  lowStockAmount: number
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
  /** The answer already picked for the client: one of the choices, or 'yes' / 'no'. */
  defaultAnswer?: string | null
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
  /** Which offer of the add-on under the dish: 0, or 1, 2... when the dish offers the same add-on again. */
  slot?: number
  /** Tells the offers of the same add-on apart ("בפנים", "בחוץ"). */
  label?: string | null
  /** Its picture is shown while the client adjusts the dish. */
  showImage?: boolean
  /** Picked for every unit until the client takes it off. */
  isDefault?: boolean
  /** Price per unit above maxQuantity (per ordered unit); null means maxQuantity is firm. */
  overLimitPrice?: number | null
}

export interface MenuAddOnGroup {
  id: number
  name: string
  /** Price per unit above maxUnits; null means the limit is firm. */
  overLimitPrice?: number | null
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
  /** Only on a slot of the next day that continues the day's hours past midnight ("yyyy-MM-dd"). */
  date?: string | null
  /** Whether the lead time still allows a delivery / a pickup in this slot; absent means yes. */
  deliveryOk?: boolean
  pickupOk?: boolean
}

export interface SupplyDate {
  /** "yyyy-MM-dd" */
  date: string
  /** Local time ordering for this date closes, "yyyy-MM-ddTHH:mm:ss" */
  cutoff: string
  /** The hours to pick from; empty (or absent) when the day has no supply hours. */
  hours?: HourSlot[] | null
}

/** A custom group of dishes (such as "מומלצות"), shown as its own section above the categories; dishes in menu order. */
export interface MenuGroup {
  id: number
  name: string
  dishIds: number[]
}

export interface Menu {
  categories: MenuCategory[]
  dishes: MenuDish[]
  supplyDates: SupplyDate[]
  /** Only groups with at least one dish on the menu. */
  groups?: MenuGroup[]
}

export type Fulfillment = 'Delivery' | 'Pickup'
/** `Transfer` is the older combined Bit / PayBox choice; new orders use `Bit` or `PayBox`. */
export type Payment = 'OnDelivery' | 'Transfer' | 'Bit' | 'PayBox'

/** An add-on of an ordered unit; slot says which offer of it under the dish (left out for the first). */
export interface AddOnLineInput {
  dishId: number
  optionId: number | null
  quantity: number
  slot?: number
}

export interface OrderLineInput {
  dishId: number
  optionId: number | null
  quantity: number
  addOns: AddOnLineInput[]
  /** One entry per ordered unit, each with its own add-ons; sent instead of addOns for a dish ordered in several units. */
  addOnUnits?: { addOns: AddOnLineInput[]; note?: string; answers?: AnswerInput[] }[]
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
  /** The date of the picked slot when it is on the day after the supply date ("yyyy-MM-dd"). */
  deliveryHourDate?: string | null
  /** Only when the server reports orders to Meta. */
  marketing?: { fbp?: string; fbc?: string; sourceUrl?: string }
  /** The client agreed to be charged the site's minimum for an order under it. */
  acceptMinimumTopUp?: boolean
}

export interface Confirmation {
  id: number
  supplyDate: string
  fulfillmentMethod: Fulfillment
  paymentMethod: Payment
  total: number
  paymentPhone: string | null
  /** The owner's Bit / PayBox payment-request link for the chosen service, if they set one. */
  paymentLink?: string | null
  /** A delivery outside the service city: it waits for the admin and holds no quantity yet. */
  needsReview: boolean
  items: {
    dishName: string
    optionLabel: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
    isAddOn: boolean
    /** The dish's allergens as the business wrote them; null when it has none. */
    allergenInfo?: string | null
  }[]
  deliveryHour?: string | null
  /** The picked hour was already full: the admin may call to move it. */
  hourFull?: boolean
  /** The delivery fee in ₪ (already inside `total`). */
  deliveryFee?: number
  /** What the large-order discount took off the delivery fee (0 for none; the fee is then already reduced). */
  deliveryDiscount?: number
  /** What was added so the order reached the minimum (already inside `total`; 0 for none). */
  minimumTopUp?: number
}

/** What the zones say about an address: a fee, no delivery there, or the address could not be placed on the map. */
export interface DeliveryQuote {
  status: 'ok' | 'blocked' | 'unknown' | 'outside'
  fee: number
  zoneName: string | null
  /** Only the street or the city could be placed on the map, so the order goes to the admin to check. */
  approximate?: boolean
}

/** The address at the device's position (`found` is false outside Israel or off any road) and what delivery there costs. */
export interface LocatedAddress {
  found: boolean
  city: string
  street: string
  houseNumber: string
  quote: DeliveryQuote | null
}

export const siteApi = {
  get: () => apiJson<Site>('/api/site'),
  menu: () => apiJson<Menu>('/api/menu'),
  /** Whether an hour is already full; asked only once the client picks it. */
  hourAvailability: (date: string, hour: string) =>
    apiJson<{ full: boolean }>(`/api/hour-availability?date=${date}&hour=${encodeURIComponent(hour)}`),
}

export const deliveryApi = {
  quote: (address: { city: string; street: string; houseNumber: string }) =>
    apiJson<DeliveryQuote>('/api/delivery-quote', send('POST', address)),
  /** The address at a position ("find my location"), with its fee. */
  locate: (position: { lat: number; lng: number }) =>
    apiJson<LocatedAddress>('/api/delivery-quote/locate', send('POST', position)),
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

/** Who answers accessibility requests, and the limits the business knows of (the accessibility statement). */
export interface AccessibilityInfo {
  name: string | null
  phone: string | null
  email: string | null
  notes: string | null
  /** When the admin last saved these; the statement's update date. */
  updatedAt: string | null
}

export const accessibilityApi = {
  get: () => apiJson<AccessibilityInfo>('/api/accessibility'),
  getAdmin: () => apiJson<AccessibilityInfo>('/api/admin/accessibility'),
  save: (info: AccessibilityInfo) => apiJson<AccessibilityInfo>('/api/admin/accessibility', send('PUT', info)),
}
