import { describe, expect, it } from 'vitest'
import { menu } from '../test/catalogData'
import { addOnsOf, dishMap, lineTotal, newSelection, orderTotal, restoreSelections, standaloneDishes, toLines } from './model'
import { normalizePhone } from './phone'

const data = menu()
const dishes = dishMap(data)
const chicken = dishes.get(1)!
const meat = dishes.get(2)!

describe('order model', () => {
  it('preselects the default option and the smallest amount', () => {
    expect(newSelection(chicken)).toEqual({ optionId: 11, quantity: 1, addOns: {} })
    expect(newSelection(meat)).toEqual({ optionId: null, quantity: 0.5, addOns: {} })
  })

  it('prices fixed options and free amounts', () => {
    expect(lineTotal(chicken, 10, 3)).toBe(120)
    expect(lineTotal(meat, null, 1.75)).toBe(157.5)
  })

  it('adds add-ons at their own price to the total', () => {
    const selections = { 1: { optionId: 11, quantity: 2, addOns: { 3: { optionId: 30, quantity: 3 } } }, 2: newSelection(meat) }
    expect(orderTotal(selections, dishes)).toBe(2 * 70 + 3 * 12 + 45)
    expect(toLines(selections)[0]).toEqual({
      dishId: 1,
      optionId: 11,
      quantity: 2,
      addOns: [{ dishId: 3, optionId: 30, quantity: 3 }],
    })
  })

  it('never lists add-on-only dishes as standalone dishes', () => {
    expect(standaloneDishes(data, 1).map((d) => d.name)).toEqual(['עוף בתנור'])
    expect(addOnsOf(chicken, dishes).map((d) => d.name)).toEqual(['ירך'])
  })

  it('skips dishes and options that no longer exist when restoring a saved order', () => {
    const saved = {
      1: { optionId: 999, quantity: 2, addOns: { 3: { optionId: 30, quantity: 1 }, 77: { optionId: null, quantity: 1 } } },
      2: { optionId: null, quantity: 10, addOns: {} },
      55: { optionId: 1, quantity: 1, addOns: {} },
    }
    const { selections, skipped } = restoreSelections(saved, data)

    expect(skipped).toBe(2)
    expect(selections[1].optionId).toBe(11)
    expect(selections[1].addOns).toEqual({ 3: { optionId: 30, quantity: 1 } })
    expect(selections[2].quantity).toBe(3)
    expect(selections[55]).toBeUndefined()
  })

  it('skips sold-out dishes when restoring', () => {
    const soldOut = menu({ dishes: data.dishes.map((d) => (d.id === 1 ? { ...d, isSoldOut: true } : d)) })
    expect(restoreSelections({ 1: newSelection(chicken) }, soldOut)).toEqual({ selections: {}, skipped: 1 })
  })
})

describe('normalizePhone', () => {
  it.each([
    ['050-123 4567', '0501234567'],
    ['+972501234567', '0501234567'],
    ['(04) 8123456', '048123456'],
  ])('reads %s as %s', (input, expected) => expect(normalizePhone(input)).toBe(expected))

  it.each(['', '12345', '050-12a4567', '1501234567'])('rejects %j', (input) => expect(normalizePhone(input)).toBeNull())
})
