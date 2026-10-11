import { emptyAddress, type AddressParts } from '../account/addressParts'
import type { Favorite, HistoryOrder } from '../api/account'
import type { Fulfillment, Menu, MenuAddOn, MenuDish, OrderLineInput, Payment } from '../api/site'

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

export interface OrderState extends AddressParts {
  selections: Record<number, Selection>
  supplyDate: string | null
  /** The start of the picked hour ("HH:mm:ss") on the supply date, when it has hours. */
  deliveryHour: string | null
  fulfillment: Fulfillment
  payment: Payment
  notes: string
  name: string
  phone: string
}

export const emptyOrder = (): OrderState => ({
  selections: {},
  supplyDate: null,
  deliveryHour: null,
  fulfillment: 'Delivery',
  payment: 'OnDelivery',
  notes: '',
  name: '',
  phone: '',
  ...emptyAddress(),
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

/** How an add-on is offered under a dish; one the dish does not set up is offered at its own prices. */
export function addOnLink(parent: MenuDish, addOnId: number): MenuAddOn {
  return (
    parent.addOns?.find((a) => a.dishId === addOnId) ?? { dishId: addOnId, groupId: null, price: null, maxQuantity: null, isCheckbox: false }
  )
}

/** Added or not, never in an amount: a check box under this dish, or a yes or no dish. */
export const isCheckbox = (link: MenuAddOn, addOn: MenuDish) => link.isCheckbox || !!addOn.isYesNo

/** An add-on with a price of its own under the dish is offered in its default option only. */
export const fixedOption = (link: MenuAddOn, addOn: MenuDish) => isCheckbox(link, addOn) || link.price !== null

/** A ticked check box: the add-on's default option and least amount. */
export function checkedAddOn(addOn: MenuDish): AddOnSelection {
  const { optionId, quantity } = newSelection(addOn)
  return { optionId, quantity }
}

export const addOnUnitPrice = (link: MenuAddOn, addOn: MenuDish, optionId: number | null) =>
  link.price ?? unitPrice(addOn, optionId)

export const addOnLineTotal = (parent: MenuDish, addOn: MenuDish, selection: AddOnSelection) =>
  round2(addOnUnitPrice(addOnLink(parent, addOn.id), addOn, selection.optionId) * selection.quantity)

/** The add-on's amount range under the dish: what is left on the date, and the dish's own cap on it. */
export function addOnRange(link: MenuAddOn, addOn: MenuDish, remaining: number | null, factor = 1) {
  const range = limitedRange(addOn, remaining)
  return link.maxQuantity === null ? range : { ...range, max: Math.min(range.max, link.maxQuantity * factor) }
}

/** Add-on limits are per ordered unit of the dish (2 couscous with a limit of 2 allow 4); a weight counts once. */
export const limitFactor = (parent: MenuDish, quantity: number) => (parent.sellBy === 'Units' ? quantity : 1)

/** What an add-on line takes from its group's limit: an amount of units counts as many, a check box or a weight one. */
export const groupUnits = (link: MenuAddOn, addOn: MenuDish, quantity: number) =>
  isCheckbox(link, addOn) || addOn.sellBy === 'Weight' ? 1 : quantity

/** The units picked from one of the dish's add-on groups, leaving one add-on out (the one being changed). */
export function groupUsed(
  parent: MenuDish, addOns: Record<number, AddOnSelection>, groupId: number, dishes: Map<number, MenuDish>, except?: number,
) {
  let used = 0
  for (const [id, selection] of Object.entries(addOns)) {
    const addOn = dishes.get(Number(id))
    const link = addOnLink(parent, Number(id))
    if (addOn && link.groupId === groupId && Number(id) !== except) used += groupUnits(link, addOn, selection.quantity)
  }
  return used
}

/** After the parent's amount drops, brings its add-ons down to the per-unit limits: over-limit amounts are cut, then later add-ons of a full group dropped. */
export function fitAddOns(parent: MenuDish, selection: Selection, dishes: Map<number, MenuDish>): Selection {
  const factor = limitFactor(parent, selection.quantity)
  const addOns: Record<number, AddOnSelection> = {}
  for (const [id, addOn] of Object.entries(selection.addOns)) {
    const dish = dishes.get(Number(id))
    const link = addOnLink(parent, Number(id))
    if (!dish) continue
    const quantity = link.maxQuantity === null ? addOn.quantity : Math.min(addOn.quantity, link.maxQuantity * factor)
    const group = link.groupId === null ? undefined : parent.addOnGroups?.find((g) => g.id === link.groupId)
    if (group?.maxUnits != null && groupUsed(parent, addOns, group.id, dishes) + groupUnits(link, dish, quantity) > group.maxUnits * factor) continue
    addOns[Number(id)] = { ...addOn, quantity }
  }
  return { ...selection, addOns }
}

export function orderTotal(selections: Record<number, Selection>, dishes: Map<number, MenuDish>): number {
  let total = 0
  for (const [id, selection] of Object.entries(selections)) {
    const dish = dishes.get(Number(id))
    if (!dish) continue
    total += lineTotal(dish, selection.optionId, selection.quantity)
    for (const [addOnId, addOn] of Object.entries(selection.addOns)) {
      const addOnDish = dishes.get(Number(addOnId))
      if (addOnDish) total += addOnLineTotal(dish, addOnDish, addOn)
    }
  }
  return round2(total)
}

/**
 * The order's totals. Dishes: how many dishes were ordered on their own (a free-weight line counts one).
 * Side dishes: how many kinds of side dish were ordered on their own, however many of each.
 * Drinks: units ordered from the drinks category, counted on their own and not as dishes.
 * Add-ons belong to the dish they were added to and are in no total.
 */
export function dishTotals(
  selections: Record<number, Selection>,
  dishes: Map<number, MenuDish>,
  drinksCategoryIds: ReadonlySet<number> = new Set(),
) {
  let main = 0
  let side = 0
  let drinks = 0
  for (const [id, selection] of Object.entries(selections)) {
    const dish = dishes.get(Number(id))
    if (!dish) continue
    if (drinksCategoryIds.has(dish.categoryId)) drinks += selection.quantity
    else if (dish.isSideDish) side += 1
    else main += dish.choiceMode === 'Free' ? 1 : selection.quantity
  }
  return { main, side, drinks }
}

/** The category whose ordered units get their own total (as named in a site's drinks seed, sites/<id>/seed). */
export const DRINKS_CATEGORY_NAME = 'שתיה'

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

/** The dishes a client can order on their own, grouped by category in the admin's order; variants are in their main dish's card. */
export function standaloneDishes(menu: Menu, categoryId: number) {
  return menu.dishes.filter((d) => d.categoryId === categoryId && !d.isAddOnOnly && d.mainDishId == null)
}

/** The variants shown in a main dish's card, in the admin's order; a main dish with any is not ordered itself. */
export function variantsOf(main: MenuDish, menu: Menu) {
  return menu.dishes.filter((d) => d.mainDishId === main.id && !d.isAddOnOnly)
}

export interface AddOnOffer {
  dish: MenuDish
  link: MenuAddOn
}

/** The add-ons offered under a dish, with how each is offered there. Sold-out add-ons are not offered. */
export function addOnsOf(dish: MenuDish, dishes: Map<number, MenuDish>): AddOnOffer[] {
  return dish.addOnDishIds
    .map((id) => dishes.get(id))
    .filter((d): d is MenuDish => !!d && !d.isSoldOut)
    .map((addOn) => ({ dish: addOn, link: addOnLink(dish, addOn.id) }))
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

  function fit(dish: MenuDish, optionId: number | null, quantity: number, link?: MenuAddOn, factor = 1) {
    if (dish.isYesNo || (link && isCheckbox(link, dish))) return checkedAddOn(dish)
    const { min, max: ownMax, step } = amountRange(dish)
    const max = link?.maxQuantity != null ? Math.max(min, Math.min(ownMax, link.maxQuantity * factor)) : ownMax
    let q = Math.min(Math.max(quantity, min), max)
    q = round2(min + Math.round((q - min) / step) * step)
    const keep = !link || link.price === null
    const option =
      dish.choiceMode === 'Fixed' ? ((keep && dish.options.find((o) => o.id === optionId)) || defaultOption(dish)) : null
    return { optionId: option?.id ?? null, quantity: Math.min(q, max) }
  }

  let skipped = 0
  const selections: Record<number, Selection> = {}
  for (const [id, selection] of Object.entries(saved)) {
    const dish = dishes.get(Number(id))
    if (!dish || dish.isAddOnOnly || !orderable(dish) || menu.dishes.some((v) => v.mainDishId === dish.id)) {
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
      const link = addOnLink(dish, addOnDish.id)
      const factor = limitFactor(dish, selection.quantity)
      const fitted = fit(addOnDish, addOn.optionId, addOn.quantity, link, factor)
      // An add-on that no longer fits in its group's limit is left out.
      const group = link.groupId === null ? undefined : dish.addOnGroups?.find((g) => g.id === link.groupId)
      if (group?.maxUnits != null && groupUsed(dish, addOns, group.id, dishes) + groupUnits(link, addOnDish, fitted.quantity) > group.maxUnits * factor) {
        skipped++
        continue
      }
      addOns[addOnDish.id] = fitted
    }
    selections[dish.id] = { ...fit(dish, selection.optionId, selection.quantity), addOns }
  }
  return { selections, skipped }
}

/** A past order as a saved selection. Options are found again by their label; a vanished one falls back to the default. */
export function selectionsFromHistory(order: HistoryOrder, menu: Menu): Restored {
  const dishes = dishMap(menu)
  const optionOf = (dishId: number, label: string | null) =>
    dishes.get(dishId)?.options.find((o) => o.label === label)?.id ?? null

  const saved: Record<number, Selection> = {}
  for (const item of order.items.filter((i) => i.parentItemId === null)) {
    const addOns: Record<number, AddOnSelection> = {}
    for (const addOn of order.items.filter((i) => i.parentItemId === item.id))
      addOns[addOn.dishId] = { optionId: optionOf(addOn.dishId, addOn.optionLabel), quantity: addOn.quantity }
    saved[item.dishId] = { optionId: optionOf(item.dishId, item.optionLabel), quantity: item.quantity, addOns }
  }
  return restoreSelections(saved, menu)
}

/** A favorite as a saved selection, with whatever has vanished from the menu skipped. */
export function selectionsFromFavorite(favorite: Favorite, menu: Menu): Restored {
  const saved: Record<number, Selection> = {}
  for (const item of favorite.items) {
    const addOns: Record<number, AddOnSelection> = {}
    for (const addOn of item.addOns) addOns[addOn.dishId] = { optionId: addOn.optionId, quantity: addOn.quantity }
    saved[item.dishId] = { optionId: item.optionId, quantity: item.quantity, addOns }
  }
  return restoreSelections(saved, menu)
}
