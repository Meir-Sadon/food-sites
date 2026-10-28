import { describe, expect, it } from 'vitest'
import { menu, menuDish } from '../test/catalogData'
import type { HistoryItem, HistoryOrder } from '../api/account'
import { selectionsFromFavorite, selectionsFromHistory, unitsOf, addOnsOf, dishMap, lineTotal, newSelection, orderTotal, restoreSelections, standaloneDishes, toLines } from './model'
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
    expect(toLines(selections, dishMap(data))[0]).toEqual({
      dishId: 1,
      optionId: 11,
      quantity: 2,
      addOns: [],
      addOnUnits: [{ addOns: [{ dishId: 3, optionId: 30, quantity: 3 }] }, { addOns: [] }],
    })
  })

  it('shares a saved line\'s add-ons between its units and puts lines of one dish side by side', () => {
    const favorite = {
      id: 1,
      name: 'x',
      items: [
        { dishId: 1, optionId: 11, quantity: 2, addOns: [{ dishId: 3, optionId: 30, quantity: 2 }] },
        { dishId: 1, optionId: 11, quantity: 1, addOns: [] },
      ],
    }
    const { selections } = selectionsFromFavorite(favorite as never, data)
    expect(selections[1].quantity).toBe(3)
    expect(unitsOf(chicken, selections[1]).map((u) => u[3]?.quantity ?? 0)).toEqual([1, 1, 0])
  })

  it('never lists add-on-only dishes as standalone dishes', () => {
    expect(standaloneDishes(data, 1).map((d) => d.name)).toEqual(['עוף בתנור'])
    expect(addOnsOf(chicken, dishes).map((o) => o.dish.name)).toEqual(['ירך'])
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

describe('selectionsFromHistory repriced', () => {
  const item = (patch: Partial<HistoryItem> & Pick<HistoryItem, 'id' | 'dishId' | 'dishName' | 'unitPrice'>): HistoryItem => ({
    parentItemId: null, optionLabel: null, quantity: 1, lineTotal: patch.unitPrice, ...patch,
  })
  const order = (items: HistoryItem[]): HistoryOrder => ({
    id: 1, supplyDate: '2026-10-02', status: 'Delivered', fulfillmentMethod: 'Pickup', paymentMethod: 'OnDelivery',
    isPaid: true, total: 0, createdAt: '2026-09-30T10:00:00Z', items,
  })

  it('lists nothing while every line costs what it did', () => {
    const past = order([
      item({ id: 1, dishId: 1, dishName: 'עוף בתנור', optionLabel: 'חצי', quantity: 2, unitPrice: 40 }),
      item({ id: 2, dishId: 3, parentItemId: 1, dishName: 'ירך', optionLabel: 'יחידה', unitPrice: 12 }),
      item({ id: 3, dishId: 2, dishName: 'בשר טחון', optionLabel: 'ק״ג', quantity: 1.5, unitPrice: 90 }),
    ])
    expect(selectionsFromHistory(past, data).repriced).toEqual([])
  })

  it('names the dishes and add-ons whose price changed, and leaves gone ones to the skipped count', () => {
    const past = order([
      item({ id: 1, dishId: 1, dishName: 'עוף בתנור', optionLabel: 'חצי', unitPrice: 38 }),
      item({ id: 2, dishId: 3, parentItemId: 1, dishName: 'ירך', optionLabel: 'יחידה', unitPrice: 10 }),
      item({ id: 3, dishId: 2, dishName: 'בשר טחון', optionLabel: 'ק״ג', unitPrice: 95 }),
      item({ id: 4, dishId: 99, dishName: 'נעלם', unitPrice: 5 }),
      item({ id: 5, dishId: 1, dishName: 'עוף בתנור', optionLabel: 'רבע', unitPrice: 20 }),
    ])
    const restored = selectionsFromHistory(past, data)
    expect(restored.repriced).toEqual(['עוף בתנור', 'ירך', 'בשר טחון'])
    expect(restored.skipped).toBe(1)
  })

  it('compares an add-on at its price under the dish, and units above a limit at the over-limit price', () => {
    const priced = menu({
      dishes: [
        menuDish(1, 'קוסקוס', 1, {
          options: [{ id: 10, label: 'מנה', amount: 1, price: 50, isDefault: true }],
          addOnDishIds: [3],
          addOns: [{ dishId: 3, groupId: null, price: 8, maxQuantity: 2, isCheckbox: false, overLimitPrice: 15 }],
        }),
        menuDish(3, 'עוף', 1, { isAddOnOnly: true, options: [{ id: 30, label: 'יחידה', amount: 1, price: 12, isDefault: true }] }),
      ],
    })
    const past = order([
      item({ id: 1, dishId: 1, dishName: 'קוסקוס', optionLabel: 'מנה', unitPrice: 50 }),
      item({ id: 2, dishId: 3, parentItemId: 1, dishName: 'עוף', optionLabel: 'יחידה', quantity: 2, unitPrice: 8 }),
      item({ id: 3, dishId: 3, parentItemId: 1, dishName: 'עוף (מעבר למכסה)', optionLabel: 'יחידה', unitPrice: 15 }),
    ])
    expect(selectionsFromHistory(past, priced).repriced).toEqual([])
    const raised = { ...past, items: past.items.map((i) => (i.id === 3 ? { ...i, unitPrice: 14 } : i)) }
    expect(selectionsFromHistory(raised, priced).repriced).toEqual(['עוף'])
  })
})
