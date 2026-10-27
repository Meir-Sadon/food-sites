import type { TFunction } from 'i18next'
import { weekdays, type AvailabilityRule, type Weekday } from '../api/catalog'
import type { HourSlot, Menu, MenuDish } from '../api/site'
import { keyDishId, type AddOnSelection, type Selection } from './model'

/** Minutes since midnight of a "HH:mm:ss" time; an end of 00:00 is the end of the day. */
const minutes = (time: string, isEnd = false) => {
  const [h, m] = time.split(':').map(Number)
  const value = h * 60 + m
  return isEnd && value === 0 ? 24 * 60 : value
}

/** The weekday of a "yyyy-MM-dd" date. */
export const weekdayOf = (date: string): Weekday => {
  const [y, m, d] = date.split('-').map(Number)
  return weekdays[new Date(y, m - 1, d).getDay()]
}

/**
 * The day and hour an order is for. `slot` is the picked hour (with its own `date` after midnight), or null while none is
 * picked; `daySlots` are all the hours the day offers (empty for a day without hours).
 */
export interface When {
  date: string
  slot: HourSlot | null
  daySlots: HourSlot[]
}

/** Whether a rule covers the slot, which lies on `date` (the whole slot must be inside the rule's hours). */
function covers(rule: AvailabilityRule, date: string, slot: HourSlot | null): boolean {
  if (rule.weekday !== weekdayOf(date)) return false
  if (rule.from === null || rule.to === null) return true
  return !!slot && minutes(rule.from) <= minutes(slot.from) && minutes(slot.to, true) <= minutes(rule.to, true)
}

/** A dish with no rules is sold whenever; with rules, only when one covers the picked hour (or any hour of the day while none is picked). */
export function rulesAllow(rules: AvailabilityRule[] | null | undefined, when: When): boolean {
  if (!rules?.length) return true
  if (when.slot) return rules.some((r) => covers(r, when.slot!.date ?? when.date, when.slot))
  if (when.daySlots.length === 0) return rules.some((r) => covers(r, when.date, null))
  return when.daySlots.some((s) => rules.some((r) => covers(r, s.date ?? when.date, s)))
}

/** The dish's own rules and, for a variant, its main dish's: both must allow it. */
export function dishAvailable(dish: MenuDish, dishes: Map<number, MenuDish>, when: When): boolean {
  const main = dish.mainDishId === null || dish.mainDishId === undefined ? undefined : dishes.get(dish.mainDishId)
  return rulesAllow(dish.availability, when) && rulesAllow(main?.availability, when)
}

/** The menu with only the dishes sold at that time: add-ons, variants and groups lose the others too. */
export function availableMenu(menu: Menu, when: When): Menu {
  const all = new Map(menu.dishes.map((d) => [d.id, d]))
  const shown = new Set(menu.dishes.filter((d) => dishAvailable(d, all, when)).map((d) => d.id))
  if (shown.size === menu.dishes.length) return menu
  return {
    ...menu,
    dishes: menu.dishes
      .filter((d) => shown.has(d.id))
      .map((d) => ({
        ...d,
        addOnDishIds: d.addOnDishIds.filter((id) => shown.has(id)),
        ...(d.addOns && { addOns: d.addOns.filter((a) => shown.has(a.dishId)) }),
      })),
    ...(menu.groups && { groups: menu.groups.map((g) => ({ ...g, dishIds: g.dishIds.filter((id) => shown.has(id)) })) }),
  }
}

/** The dish's times as text, one entry per weekday in week order: "חמישי: 08:00–12:00" or "חמישי: כל היום". */
export function availabilityLines(rules: AvailabilityRule[], t: TFunction): string[] {
  return weekdays
    .filter((day) => rules.some((r) => r.weekday === day))
    .map((day) => {
      const own = rules.filter((r) => r.weekday === day)
      const ranges = own.some((r) => r.from === null || r.to === null)
        ? t('order.availability.wholeDay')
        : own
            .map((r) => ({ from: r.from!.slice(0, 5), to: r.to!.slice(0, 5) }))
            .sort((a, b) => a.from.localeCompare(b.from))
            .map((r) => t('order.availability.range', r))
            .join(', ')
      return t('order.availability.line', { day: t(`weekdays.${day}`), hours: ranges })
    })
}

export interface Pruned {
  selections: Record<number, Selection>
  /** Names of the dishes taken out of the order. */
  removed: string[]
  /** Names of the add-ons taken off the dishes that stay. */
  removedAddOns: string[]
}

/**
 * Takes out of the order the dishes (and the add-ons under the others) that the menu shown for the chosen day and hour no
 * longer has. `all` is the whole menu, for the names.
 */
export function pruneUnavailable(
  selections: Record<number, Selection>, shown: Map<number, MenuDish>, all: Map<number, MenuDish>,
): Pruned {
  const removed: string[] = []
  const removedAddOns = new Set<string>()
  const keep = (units: Record<number, AddOnSelection>) => {
    const next: Record<number, AddOnSelection> = {}
    for (const [key, value] of Object.entries(units)) {
      const id = keyDishId(Number(key))
      if (shown.has(id) || !all.has(id)) next[Number(key)] = value
      else removedAddOns.add(all.get(id)!.name)
    }
    return next
  }
  const result: Record<number, Selection> = {}
  for (const [id, selection] of Object.entries(selections)) {
    const dishId = Number(id)
    if (!shown.has(dishId) && all.has(dishId)) {
      removed.push(all.get(dishId)!.name)
      continue
    }
    result[dishId] = {
      ...selection,
      addOns: keep(selection.addOns),
      ...(selection.extraUnits && { extraUnits: selection.extraUnits.map(keep) }),
    }
  }
  return { selections: result, removed, removedAddOns: [...removedAddOns] }
}
