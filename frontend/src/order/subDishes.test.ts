import { describe, expect, it } from 'vitest'
import type { MenuAddOn, MenuDish } from '../api/site'
import { menu, menuDish } from '../test/catalogData'
import { addOnKey, addOnsOf, dishMap, fitAddOns, orderTotal, startSelection, summaryLines, toLines, unitAddOnTotals, unitsOf } from './model'

const link = (dishId: number, patch: Partial<MenuAddOn> = {}): MenuAddOn => ({
  dishId,
  groupId: null,
  price: null,
  maxQuantity: null,
  isCheckbox: false,
  slot: 0,
  label: null,
  showImage: false,
  isDefault: false,
  overLimitPrice: null,
  ...patch,
})

function withAddOns(parent: Partial<MenuDish>, ...extra: MenuDish[]) {
  const data = menu({
    dishes: [menuDish(1, 'המבורגר', 1, parent), ...extra],
  })
  return dishMap(data)
}

const sauce = menuDish(2, 'רוטב', 1, { isAddOnOnly: true, options: [{ id: 20, label: 'כף', amount: 1, price: 2, isDefault: true }] })
const pita = menuDish(3, 'פיתה', 1, { isAddOnOnly: true, options: [{ id: 30, label: 'יח׳', amount: 1, price: 3, isDefault: true }] })
const fries = menuDish(4, 'צ׳יפס', 1, { isAddOnOnly: true, options: [{ id: 40, label: 'מנה', amount: 1, price: 0, isDefault: true }] })

describe('the same sub dish offered twice', () => {
  const burger = {
    addOnDishIds: [2],
    addOns: [link(2, { label: 'בפנים' }), link(2, { slot: 1, label: 'בחוץ' })],
  }
  const dishes = withAddOns(burger, sauce)
  const parent = dishes.get(1)!

  it('shows one offer per time, with its own key', () => {
    expect(addOnsOf(parent, dishes).map((o) => [o.key, o.link.label])).toEqual([
      [2, 'בפנים'],
      [addOnKey(2, 1), 'בחוץ'],
    ])
  })

  it('keeps each offer apart in the lines, the summary and the total', () => {
    const selection = {
      ...startSelection(parent, dishes),
      addOns: { 2: { optionId: 20, quantity: 1 }, [addOnKey(2, 1)]: { optionId: 20, quantity: 2 } },
    }
    const lines = toLines({ 1: selection }, dishes)
    expect(lines[0].addOnUnits![0].addOns).toEqual([
      { dishId: 2, optionId: 20, quantity: 1 },
      { dishId: 2, optionId: 20, quantity: 2, slot: 1 },
    ])
    expect(summaryLines({ 1: selection }, dishes)[0].details[0].add).toEqual(['רוטב (בפנים)', 'רוטב (בחוץ) ×2'])
    expect(orderTotal({ 1: selection }, dishes)).toBe(40 + 2 + 4)
  })
})

describe('units above a limit cost extra', () => {
  it('prices the units above an add-on limit at the over-limit price', () => {
    const dishes = withAddOns({ addOnDishIds: [3], addOns: [link(3, { maxQuantity: 5, overLimitPrice: 4 })] }, pita)
    const parent = dishes.get(1)!
    expect(unitAddOnTotals(parent, { 3: { optionId: 30, quantity: 5 } }, dishes)).toEqual({ 3: 15 })
    expect(unitAddOnTotals(parent, { 3: { optionId: 30, quantity: 7 } }, dishes)).toEqual({ 3: 15 + 8 })
  })

  it('does not cut the amount down to the limit when units above it are priced', () => {
    const dishes = withAddOns({ addOnDishIds: [3], addOns: [link(3, { maxQuantity: 2, overLimitPrice: 4 })] }, pita)
    const parent = dishes.get(1)!
    const selection = fitAddOns(parent, { ...startSelection(parent, dishes), addOns: { 3: { optionId: 30, quantity: 6 } } }, dishes)
    expect(selection.addOns[3].quantity).toBe(6)
  })

  it('still cuts the amount down to a firm limit', () => {
    const dishes = withAddOns({ addOnDishIds: [3], addOns: [link(3, { maxQuantity: 2 })] }, pita)
    const parent = dishes.get(1)!
    const selection = fitAddOns(parent, { ...startSelection(parent, dishes), addOns: { 3: { optionId: 30, quantity: 6 } } }, dishes)
    expect(selection.addOns[3].quantity).toBe(2)
  })

  it('prices the units above a group limit at the group price', () => {
    const dishes = withAddOns(
      {
        addOnDishIds: [3, 4],
        addOns: [link(3, { groupId: 7 }), link(4, { groupId: 7 })],
        addOnGroups: [{ id: 7, name: 'תוספות', maxUnits: 2, overLimitPrice: 6 }],
      },
      pita,
      fries,
    )
    const parent = dishes.get(1)!
    const totals = unitAddOnTotals(parent, { 3: { optionId: 30, quantity: 1 }, 4: { optionId: 40, quantity: 3 } }, dishes)
    // The pita and one fries are within the group's two; the other two fries cost 6 each.
    expect(totals).toEqual({ 3: 3, 4: 0 + 12 })
  })
})

describe('default sub dishes', () => {
  const dishes = withAddOns({ addOnDishIds: [4, 3], addOns: [link(4, { isDefault: true, groupId: 7 }), link(3, { groupId: 7 })], addOnGroups: [{ id: 7, name: 'צד', maxUnits: 1, overLimitPrice: null }] }, fries, pita)
  const parent = dishes.get(1)!

  it('starts every unit with the default and gives new units theirs too', () => {
    const one = startSelection(parent, dishes)
    expect(Object.keys(one.addOns)).toEqual(['4'])
    const three = fitAddOns(parent, { ...one, quantity: 3 }, dishes)
    expect(unitsOf(parent, three).map((u) => Object.keys(u))).toEqual([['4'], ['4'], ['4']])
  })

  it('lets the client take the default off and pick another, and does not bring it back', () => {
    const two = fitAddOns(parent, { ...startSelection(parent, dishes), quantity: 2 }, dishes)
    const changed = { ...two, addOns: { 3: { optionId: 30, quantity: 1 } } }
    const fitted = fitAddOns(parent, changed, dishes)
    expect(Object.keys(fitted.addOns)).toEqual(['3'])
    expect(fitAddOns(parent, { ...fitted, quantity: 3 }, dishes).extraUnits).toHaveLength(2)
    expect(Object.keys(unitsOf(parent, fitAddOns(parent, { ...fitted, quantity: 3 }, dishes))[0])).toEqual(['3'])
  })
})
