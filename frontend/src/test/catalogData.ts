import type { Category, Dish, Settings, SupplyDay } from '../api/catalog'
import { weekdays } from '../api/catalog'

export const settings = (patch: Partial<Settings> = {}): Settings => ({
  backgroundImageUrl: null,
  deliveryEnabled: true,
  pickupEnabled: true,
  deliveryAreaText: 'חיפה',
  deliveryFeeText: null,
  kashrutText: null,
  paymentPhone: '050-1234567',
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
  isHidden: false,
  options: [{ id: id * 10, label: 'מנה', amount: 1, price: 40, isDefault: true }],
  images: [],
  parentDishIds: [],
  addOnDishIds: [],
  ...patch,
})
