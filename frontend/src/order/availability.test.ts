import { describe, expect, it } from 'vitest'
import type { AvailabilityRule } from '../api/catalog'
import type { HourSlot } from '../api/site'
import { menu, menuDish } from '../test/catalogData'
import { availableMenu, pruneUnavailable, rulesAllow, weekdayOf, type When } from './availability'
import { dishMap } from './model'

const slot = (from: string, to: string, date?: string): HourSlot => ({ from: `${from}:00`, to: `${to}:00`, date })
const rule = (weekday: AvailabilityRule['weekday'], from: string | null = null, to: string | null = null): AvailabilityRule => ({
  weekday,
  from: from && `${from}:00`,
  to: to && `${to}:00`,
})
// 2026-10-08 is a Thursday.
const THURSDAY = '2026-10-08'
const picked = (from: string, to: string): When => ({ date: THURSDAY, slot: slot(from, to), daySlots: [slot('07:00', '08:00'), slot(from, to)] })

describe('availability', () => {
  it('knows the weekday of a date', () => {
    expect(weekdayOf(THURSDAY)).toBe('Thursday')
    expect(weekdayOf('2026-10-10')).toBe('Saturday')
  })

  it('sells a dish without rules whenever', () => {
    expect(rulesAllow(undefined, picked('09:00', '10:00'))).toBe(true)
    expect(rulesAllow([], picked('09:00', '10:00'))).toBe(true)
  })

  it('sells a whole-day rule at any hour of that weekday only', () => {
    expect(rulesAllow([rule('Thursday')], picked('09:00', '10:00'))).toBe(true)
    expect(rulesAllow([rule('Friday')], picked('09:00', '10:00'))).toBe(false)
  })

  it('needs the picked hour to lie inside a range', () => {
    const rules = [rule('Thursday', '08:00', '12:00')]
    expect(rulesAllow(rules, picked('08:00', '09:00'))).toBe(true)
    expect(rulesAllow(rules, picked('11:00', '12:00'))).toBe(true)
    expect(rulesAllow(rules, picked('11:30', '12:30'))).toBe(false)
    expect(rulesAllow(rules, picked('13:00', '14:00'))).toBe(false)
  })

  it('shows a dish before an hour is picked when any hour of the day fits', () => {
    const rules = [rule('Thursday', '08:00', '12:00')]
    const none = (slots: HourSlot[]): When => ({ date: THURSDAY, slot: null, daySlots: slots })
    expect(rulesAllow(rules, none([slot('07:00', '08:00'), slot('09:00', '10:00')]))).toBe(true)
    expect(rulesAllow(rules, none([slot('13:00', '14:00')]))).toBe(false)
    // A day without hours matches whole-day rules only.
    expect(rulesAllow(rules, none([]))).toBe(false)
    expect(rulesAllow([rule('Thursday')], none([]))).toBe(true)
  })

  it('counts a range ending at midnight as lasting to the end of the day, and a slot after midnight on its own date', () => {
    expect(rulesAllow([rule('Thursday', '18:00', '00:00')], picked('23:00', '00:00'))).toBe(true)
    const after: When = { date: THURSDAY, slot: slot('00:00', '01:00', '2026-10-09'), daySlots: [] }
    expect(rulesAllow([rule('Friday')], after)).toBe(true)
    expect(rulesAllow([rule('Thursday')], after)).toBe(false)
  })

  describe('on the menu', () => {
    const base = menu()
    const withRules = {
      ...base,
      dishes: base.dishes.map((d) => (d.id === 1 ? { ...d, availability: [rule('Thursday', '08:00', '12:00')] } : d)),
    }

    it('leaves out the dishes not sold then, and the add-ons and group entries pointing at them', () => {
      const shown = availableMenu({ ...withRules, groups: [{ id: 1, name: 'מומלצות', dishIds: [1, 2] }] }, picked('13:00', '14:00'))
      expect(shown.dishes.map((d) => d.id)).toEqual([2, 3])
      expect(shown.groups?.[0].dishIds).toEqual([2])
      expect(availableMenu(withRules, picked('09:00', '10:00'))).toBe(withRules)
    })

    it('hides a variant whose main dish is not sold, and an add-on from the dishes that offered it', () => {
      const m = {
        ...base,
        dishes: [
          menuDish(10, 'ראשית', 1, { availability: [rule('Friday')] }),
          menuDish(11, 'וריאנט', 1, { mainDishId: 10 }),
          menuDish(12, 'אב', 1, { addOnDishIds: [13] }),
          menuDish(13, 'תוספת', 1, { isAddOnOnly: true, availability: [rule('Friday')] }),
        ],
      }
      const shown = availableMenu(m, picked('09:00', '10:00'))
      expect(shown.dishes.map((d) => d.id)).toEqual([12])
      expect(shown.dishes[0].addOnDishIds).toEqual([])
    })

    it('takes the dishes the menu lost out of the order, and the add-ons off the others', () => {
      const all = dishMap(base)
      const shown = dishMap(availableMenu(withRules, picked('13:00', '14:00')))
      const selections = {
        1: { optionId: 11, quantity: 1, addOns: { 3: { optionId: null, quantity: 1 } } },
        2: { optionId: null, quantity: 1, addOns: {}, extraUnits: [{ 3: { optionId: null, quantity: 1 } }] },
      }
      const withoutThigh = new Map(shown)
      withoutThigh.delete(3)
      const pruned = pruneUnavailable(selections, withoutThigh, all)
      expect(pruned.removed).toEqual(['עוף בתנור'])
      expect(pruned.removedAddOns).toEqual(['ירך'])
      expect(Object.keys(pruned.selections)).toEqual(['2'])
      expect(pruned.selections[2].extraUnits).toEqual([{}])
    })
  })
})
