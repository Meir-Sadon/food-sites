import type { Category, Dish, Settings, SupplyDay } from '../api/catalog'
import type { Menu, MenuDish, Site } from '../api/site'
import { weekdays } from '../api/catalog'

export const settings = (patch: Partial<Settings> = {}): Settings => ({
  backgroundImageUrl: null,
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryAreaText: 'חיפה',
  deliveryFeeText: null,
  deliveryFeeAmount: null,
  kashrutText: null,
  paymentPhone: '050-1234567',
  bitEnabled: true,
  payBoxEnabled: true,
  bitLink: null,
  payBoxLink: null,
  minimumOrderAmount: null,
  minimumOrderAppliesToPickup: true,
  addressFirst: false,
  serviceCities: 'אשקלון',
  ordersPerHour: null,
  portionsPerSupplyDate: null,
  style: 'classic',
  orderTotalPosition: 'bottom',
  orderFlow: 'page',
  corners: 'rounded',
  ownerEmail: '',
  ownerChangeMails: false,
  palette: 'site',
  customColors: {},
  lineWidth: null,
  font: 'standard',
  shadows: 'standard',
  spacing: 'standard',
  tileGroups: 'framed',
  deliveryPricing: 'simple',
  ...patch,
})

export const supplyDays = (): SupplyDay[] =>
  weekdays.map((weekday, i) => ({
    weekday,
    enabled: weekday === 'Friday',
    cutoffDay: weekdays[(i + 6) % 7],
    cutoffTime: '20:00:00',
    deliveryFrom: null,
    deliveryTo: null,
  }))

export const category = (id: number, name: string, dishCount = 0): Category => ({ id, name, displayOrder: id, dishCount })

export const dish = (id: number, name: string, categoryId: number, patch: Partial<Dish> = {}): Dish => ({
  id,
  name,
  categoryId,
  displayOrder: id,
  description: null,
  allergenInfo: null,
  sellBy: 'Units',
  choiceMode: 'Fixed',
  minAmount: null,
  maxAmount: null,
  amountStep: null,
  unitPrice: null,
  unitName: null,
  isAddOnOnly: false,
  isSoldOut: false,
  openByDefault: false,
  isSideDish: false,
  maxPerSupplyDate: null,
  isHidden: false,
  options: [{ id: id * 10, label: 'מנה', amount: 1, price: 40, isDefault: true }],
  images: [],
  parentDishIds: [],
  addOnDishIds: [],
  mainDishId: null,
  useMainDishPrice: false,
  isYesNo: false,
  addOnGroups: [],
  addOns: [],
  questions: [],
  adjustmentOptional: false,
  optionsTitle: null,
  showOptionDifference: false,
  dietaryTags: [],
  dietaryTagsSingle: false,
  ...patch,
})

export const site = (patch: Partial<Site> = {}): Site => ({
  backgroundImageUrl: null,
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryAreaText: 'חיפה והקריות',
  deliveryFeeText: null,
  deliveryFeeAmount: null,
  kashrutText: 'בהשגחת הרבנות',
  paymentPhone: '052-9999999',
  bitEnabled: true,
  payBoxEnabled: true,
  minimumOrderAmount: null,
  minimumOrderAppliesToPickup: true,
  addressFirst: false,
  contact: { name: 'אמא', phone: '050-1234567', address: 'חיפה', email: null, openingHours: null },
  whatsAppPhones: [],
  serviceCities: ['אשקלון'],
  features: ['recommendations', 'favorites'],
  style: 'classic',
  orderTotalPosition: 'bottom',
  orderFlow: 'page',
  corners: 'rounded',
  palette: 'site',
  customColors: {},
  lineWidth: null,
  font: 'standard',
  shadows: 'standard',
  spacing: 'standard',
  tileGroups: 'framed',
  deliveryPricing: 'simple',
  ...patch,
})

export const menuDish = (id: number, name: string, categoryId: number, patch: Partial<MenuDish> = {}): MenuDish => ({
  id,
  name,
  categoryId,
  description: null,
  allergenInfo: null,
  sellBy: 'Units',
  choiceMode: 'Fixed',
  minAmount: null,
  maxAmount: null,
  amountStep: null,
  unitPrice: null,
  isAddOnOnly: false,
  isSoldOut: false,
  options: [{ id: id * 10, label: 'מנה', amount: 1, price: 40, isDefault: true }],
  images: [],
  addOnDishIds: [],
  ...patch,
})

/** Two categories: chicken (with a thigh add-on) and a free-choice weight dish. */
export const menu = (patch: Partial<Menu> = {}): Menu => ({
  categories: [
    { id: 1, name: 'עופות' },
    { id: 2, name: 'בשרים' },
  ],
  dishes: [
    menuDish(1, 'עוף בתנור', 1, {
      options: [
        { id: 10, label: 'חצי', amount: 1, price: 40, isDefault: false },
        { id: 11, label: 'שלם', amount: 1, price: 70, isDefault: true },
      ],
      addOnDishIds: [3],
    }),
    menuDish(2, 'בשר טחון', 2, {
      sellBy: 'Weight',
      choiceMode: 'Free',
      minAmount: 0.5,
      maxAmount: 3,
      amountStep: 0.25,
      unitPrice: 90,
      options: [],
    }),
    menuDish(3, 'ירך', 1, { isAddOnOnly: true, options: [{ id: 30, label: 'יחידה', amount: 1, price: 12, isDefault: true }] }),
  ],
  supplyDates: [
    { date: '2026-10-09', cutoff: '2026-10-07T20:00:00' },
    { date: '2026-10-16', cutoff: '2026-10-14T20:00:00' },
  ],
  ...patch,
})

export const publicApi = {
  'GET /api/site': () => site(),
  'GET /api/menu': () => menu(),
}

/** A main dish with two variants priced like it, and a sandwich with a salads group and a cheaper priced add-on. */
export const groupedMenu = (): Menu => ({
  categories: [{ id: 1, name: 'סיגרים' }],
  dishes: [
    menuDish(1, 'סיגרים עבודת יד', 1, { description: 'תיאור משותף', images: ['https://img/cigar.jpg'] }),
    menuDish(2, 'סיגר כבד', 1, { mainDishId: 1, options: [{ id: 21, label: 'מארז', amount: 1, price: 60, isDefault: true }] }),
    menuDish(3, 'סיגר עוף', 1, { mainDishId: 1, images: ['https://img/chicken.jpg'], options: [{ id: 31, label: 'מארז', amount: 1, price: 70, isDefault: true }] }),
    menuDish(4, 'כריך', 1, {
      addOnDishIds: [5, 6, 7],
      addOnGroups: [{ id: 1, name: 'סלטים', maxUnits: 1 }],
      addOns: [
        { dishId: 5, groupId: 1, price: 0, maxQuantity: null, isCheckbox: true },
        { dishId: 6, groupId: 1, price: null, maxQuantity: null, isCheckbox: true },
        { dishId: 7, groupId: null, price: 8, maxQuantity: 2, isCheckbox: false },
      ],
    }),
    menuDish(5, 'חומוס', 1, { isAddOnOnly: true }),
    menuDish(6, 'טחינה', 1, { isAddOnOnly: true, options: [{ id: 60, label: 'כף', amount: 1, price: 3, isDefault: true }] }),
    menuDish(7, 'עוף', 1, { isAddOnOnly: true, options: [{ id: 70, label: 'יחידה', amount: 1, price: 12, isDefault: true }] }),
  ],
  supplyDates: [{ date: '2026-10-16', cutoff: '2026-10-14T20:00:00' }],
})
