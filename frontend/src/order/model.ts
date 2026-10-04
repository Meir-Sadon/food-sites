import type { Fulfillment, Menu, MenuDish, OrderLineInput, Payment } from '../api/site'

export const MAX_UNITS = 99

export interface AddOnSelection {
  optionId: number | null
  quantity: number
}

/** What the client chose for one dish. A dish is in the order exactly when it has a selection. */
export interface Selection {
  optionId: number | null
  quantity: number
  /** Only add-ons with a quantity above zero, by dish id. */
  addOns: Record<number, AddOnSelection>
}

export interface OrderState {
  selections: Record<number, Selection>
  supplyDate: string | null
  fulfillment: Fulfillment
  payment: Payment
  notes: string
  name: string
  phone: string
  address: string
}

export const emptyOrder = (): OrderState => ({
  selections: {},
  supplyDate: null,
  fulfillment: 'Delivery',
  payment: 'OnDelivery',
  notes: '',
  name: '',
  phone: '',
  address: '',
})

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function defaultOption(dish: MenuDish) {
  return dish.options.find((o) => o.isDefault) ?? dish.options[0] ?? null
}

/** The bounds of the amount control for a dish: whole units, or the admin's range and step. */
export function amountRange(dish: MenuDish) {
  if (dish.choiceMode === 'Free')
    return { min: dish.minAmount ?? 1, max: dish.maxAmount ?? MAX_UNITS, step: dish.amountStep ?? 1 }
  return { min: 1, max: MAX_UNITS, step: 1 }
}

/** How much of the dish is left on a supply date, or null when it has no limit. */
export function remainingOn(dish: MenuDish, date: string | undefined): number | null {
  if (!dish.remaining || !date) return null
  return dish.remaining[date] ?? null
}

/** The amount range cut down to what is left; max < min means none can be ordered. */
export function limitedRange(dish: MenuDish, remaining: number | null) {
  const range = amountRange(dish)
  if (remaining === null) return range
  const steps = Math.floor((remaining - range.min) / range.step + 1e-9)
  return { ...range, max: Math.min(range.max, remaining < range.min ? 0 : round2(range.min + steps * range.step)) }
}

/** Brings chosen amounts down to what is left on a supply date; dishes with none left keep their line. */
export function clampToDate(
  selections: Record<number, Selection>, dishes: Map<number, MenuDish>, date: string,
): Record<number, Selection> {
  const clamp = (dish: MenuDish | undefined, quantity: number) => {
    if (!dish) return quantity
    const { min, max } = limitedRange(dish, remainingOn(dish, date))
    return max < min ? quantity : Math.min(quantity, max)
  }
  const result: Record<number, Selection> = {}
  for (const [id, selection] of Object.entries(selections)) {
    const addOns: Record<number, AddOnSelection> = {}
    for (const [addOnId, addOn] of Object.entries(selection.addOns))
      addOns[Number(addOnId)] = { ...addOn, quantity: clamp(dishes.get(Number(addOnId)), addOn.quantity) }
    result[Number(id)] = { ...selection, quantity: clamp(dishes.get(Number(id)), selection.quantity), addOns }
  }
  return result
}

export function newSelection(dish: MenuDish): Selection {
  return {
    optionId: dish.choiceMode === 'Fixed' ? (defaultOption(dish)?.id ?? null) : null,
    quantity: amountRange(dish).min,
    addOns: {},
  }
}

export function unitPrice(dish: MenuDish, optionId: number | null): number {
  if (dish.choiceMode === 'Free') return dish.unitPrice ?? 0
  const option = dish.options.find((o) => o.id === optionId) ?? defaultOption(dish)
  return option?.price ?? 0
}

export const lineTotal = (dish: MenuDish, optionId: number | null, quantity: number) =>
  round2(unitPrice(dish, optionId) * quantity)

export function orderTotal(selections: Record<number, Selection>, dishes: Map<number, MenuDish>): number {
  let total = 0
  for (const [id, selection] of Object.entries(selections)) {
    const dish = dishes.get(Number(id))
    if (!dish) continue
    total += lineTotal(dish, selection.optionId, selection.quantity)
    for (const [addOnId, addOn] of Object.entries(selection.addOns)) {
      const addOnDish = dishes.get(Number(addOnId))
      if (addOnDish) total += lineTotal(addOnDish, addOn.optionId, addOn.quantity)
    }
  }
  return round2(total)
}

export const itemCount = (selections: Record<number, Selection>) => Object.keys(selections).length

export function toLines(selections: Record<number, Selection>): OrderLineInput[] {
  return Object.entries(selections).map(([id, selection]) => ({
    dishId: Number(id),
    optionId: selection.optionId,
    quantity: selection.quantity,
    addOns: Object.entries(selection.addOns).map(([addOnId, addOn]) => ({
      dishId: Number(addOnId),
      optionId: addOn.optionId,
      quantity: addOn.quantity,
    })),
  }))
}

/** Dishes by id, for lookups. */
export const dishMap = (menu: Menu) => new Map(menu.dishes.map((d) => [d.id, d]))

/** The dishes a client can order on their own, grouped by category in the admin's order. */
export function standaloneDishes(menu: Menu, categoryId: number) {
  return menu.dishes.filter((d) => d.categoryId === categoryId && !d.isAddOnOnly)
}

/** The add-ons offered under a dish. Sold-out add-ons are not offered. */
export function addOnsOf(dish: MenuDish, dishes: Map<number, MenuDish>) {
  return dish.addOnDishIds.map((id) => dishes.get(id)).filter((d): d is MenuDish => !!d && !d.isSoldOut)
}

export interface Restored {
  selections: Record<number, Selection>
  /** Dishes or options from the saved order that no longer exist or are sold out. */
  skipped: number
}

/**
 * Keeps what still exists in the menu from a saved order (a draft, or a past order later on).
 * Dishes and add-ons that are gone are dropped and counted; a vanished option falls back to the default.
 */
export function restoreSelections(saved: Record<number, Selection>, menu: Menu): Restored {
  const dishes = dishMap(menu)
  const orderable = (dish?: MenuDish) => !!dish && !dish.isSoldOut

  function fit(dish: MenuDish, optionId: number | null, quantity: number) {
    const { min, max, step } = amountRange(dish)
    let q = Math.min(Math.max(quantity, min), max)
    q = round2(min + Math.round((q - min) / step) * step)
    const option = dish.choiceMode === 'Fixed' ? (dish.options.find((o) => o.id === optionId) ?? defaultOption(dish)) : null
    return { optionId: option?.id ?? null, quantity: Math.min(q, max) }
  }

  let skipped = 0
  const selections: Record<number, Selection> = {}
  for (const [id, selection] of Object.entries(saved)) {
    const dish = dishes.get(Number(id))
    if (!dish || dish.isAddOnOnly || !orderable(dish)) {
      skipped++
      continue
    }
    const addOns: Record<number, AddOnSelection> = {}
    for (const [addOnId, addOn] of Object.entries(selection.addOns ?? {})) {
      const addOnDish = dishes.get(Number(addOnId))
      if (!addOnDish || !orderable(addOnDish) || !dish.addOnDishIds.includes(addOnDish.id)) {
        skipped++
        continue
      }
      addOns[addOnDish.id] = fit(addOnDish, addOn.optionId, addOn.quantity)
    }
    selections[dish.id] = { ...fit(dish, selection.optionId, selection.quantity), addOns }
  }
  return { selections, skipped }
}
