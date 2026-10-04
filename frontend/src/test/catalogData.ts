import type { Category, Dish, Settings, SupplyDay } from '../api/catalog'
import type { Menu, MenuDish, Site } from '../api/site'
import { weekdays } from '../api/catalog'

export const settings = (patch: Partial<Settings> = {}): Settings => ({
  backgroundImageUrl: null,
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryAreaText: 'חיפה',
  deliveryFeeText: null,
  kashrutText: null,
  paymentPhone: '050-1234567',
  minimumOrderAmount: null,
  ...patch,
})

export const supplyDays = (): SupplyDay[] =>
  weekdays.map((weekday, i) => ({
    weekday,
    enabled: weekday === 'Friday',
    cutoffDay: weekdays[(i + 6) % 7],
    cutoffTime: '20:00:00',
  }))

export const category = (id: number, name: string, dishCount = 0): Category => ({ id, name, displayOrder: id, dishCount })

export const dish = (id: number, name: string, categoryId: number, patch: Partial<Dish> = {}): Dish => ({
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
  openByDefault: false,
  maxPerSupplyDate: null,
  isHidden: false,
  options: [{ id: id * 10, label: 'מנה', amount: 1, price: 40, isDefault: true }],
  images: [],
  parentDishIds: [],
  addOnDishIds: [],
  ...patch,
})

export const site = (patch: Partial<Site> = {}): Site => ({
  backgroundImageUrl: null,
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryAreaText: 'חיפה והקריות',
  deliveryFeeText: null,
  kashrutText: 'בהשגחת הרבנות',
  paymentPhone: '052-9999999',
  minimumOrderAmount: null,
  contact: { name: 'אמא', phone: '050-1234567', address: 'חיפה', email: null, openingHours: null },
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
