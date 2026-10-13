import { emptyAddress, type AddressParts } from '../account/addressParts'
import type { Favorite, HistoryOrder } from '../api/account'
import type { AnswerInput, Fulfillment, Menu, MenuAddOn, MenuDish, MenuQuestion, OrderLineInput, Payment } from '../api/site'

export const MAX_UNITS = 99

export interface AddOnSelection {
  optionId: number | null
  quantity: number
}

/** What the client chose for one dish. A dish is in the order exactly when it has a selection. */
export interface Selection {
  optionId: number | null
  quantity: number
  /** The first ordered unit's add-ons: only those with a quantity above zero, by dish id. */
  addOns: Record<number, AddOnSelection>
  /** The add-ons of the 2nd, 3rd... ordered unit; a unit missing here has none. */
  extraUnits?: Record<number, AddOnSelection>[]
  /** A name or remark for each ordered unit (the whole line for a dish not sold by units), the first unit's first. */
  notes?: string[]
  /** Each ordered unit's answers to the dish's questions, by question id, the first unit's first. */
  answers?: Answers[]
  /** Which units the client confirmed without add-ons ("no changes"), the first unit's first. */
  confirmed?: boolean[]
}

export const NOTE_MAX_LENGTH = 100
export const ANSWER_MAX_LENGTH = 200

/** A text, number, date, 'yes' / 'no' or single choice answer, or the picked choices of a multiple choice. */
export type Answer = string | string[]
export type Answers = Record<number, Answer>

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
    const clampUnit = (unit: Record<number, AddOnSelection>) => {
      const next: Record<number, AddOnSelection> = {}
      for (const [addOnId, addOn] of Object.entries(unit))
        next[Number(addOnId)] = { ...addOn, quantity: clamp(dishes.get(Number(addOnId)), addOn.quantity) }
      return next
    }
    result[Number(id)] = {
      ...selection,
      quantity: clamp(dishes.get(Number(id)), selection.quantity),
      addOns,
      ...(selection.extraUnits && { extraUnits: selection.extraUnits.map(clampUnit) }),
    }
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
export function addOnRange(link: MenuAddOn, addOn: MenuDish, remaining: number | null) {
  const range = limitedRange(addOn, remaining)
  return link.maxQuantity === null ? range : { ...range, max: Math.min(range.max, link.maxQuantity) }
}

/** How many ordered units get add-ons of their own: each unit of a dish sold by units, else the whole line is one. */
export const unitCount = (parent: MenuDish, quantity: number) =>
  parent.sellBy === 'Units' && Number.isInteger(quantity) && quantity > 0 ? quantity : 1

/** The add-ons chosen for each ordered unit of the dish, the first unit's first. */
export function unitsOf(parent: MenuDish, selection: Selection): Record<number, AddOnSelection>[] {
  return Array.from({ length: unitCount(parent, selection.quantity) }, (_, i) =>
    i === 0 ? selection.addOns : (selection.extraUnits?.[i - 1] ?? {}),
  )
}

export const unitNote = (selection: Selection, unit: number) => selection.notes?.[unit] ?? ''

/** The selection with one ordered unit's name or remark replaced. */
export function withNote(selection: Selection, unit: number, note: string): Selection {
  const notes = Array.from({ length: Math.max(unit + 1, selection.notes?.length ?? 0) }, (_, i) => (i === unit ? note : unitNote(selection, i)))
  return { ...selection, notes }
}

export const unitConfirmed = (selection: Selection, unit: number) => selection.confirmed?.[unit] ?? false

/** The selection with one ordered unit confirmed (or not) as it is, without add-ons. */
export function withConfirmed(selection: Selection, unit: number, confirmed: boolean): Selection {
  const flags = Array.from({ length: Math.max(unit + 1, selection.confirmed?.length ?? 0) }, (_, i) => (i === unit ? confirmed : unitConfirmed(selection, i)))
  return { ...selection, confirmed: flags }
}

/** A unit is adjusted once the client picked an add-on for it or confirmed it as it is. */
export const isAdjusted = (selection: Selection, unit: number, add: Record<number, AddOnSelection>) =>
  Object.keys(add).length > 0 || unitConfirmed(selection, unit)

/** Gives every unit that is not adjusted yet the same add-ons as the given unit. */
export function applyToUnadjusted(parent: MenuDish, selection: Selection, from: number): Selection {
  const units = unitsOf(parent, selection)
  let next = selection
  units.forEach((unit, i) => {
    if (i === from || isAdjusted(selection, i, unit)) return
    next = withConfirmed(withUnit(next, i, { ...units[from] }), i, true)
  })
  return next
}

/**
 * The dishes in the order that offer add-ons and have a unit the client has not adjusted or confirmed,
 * except those whose adjustment the admin made optional.
 */
export function unadjustedDishes(selections: Record<number, Selection>, dishes: Map<number, MenuDish>): MenuDish[] {
  return Object.entries(selections).flatMap(([id, selection]) => {
    const dish = dishes.get(Number(id))
    if (!dish || dish.isYesNo || dish.adjustmentOptional || addOnsOf(dish, dishes).length === 0) return []
    return unitsOf(dish, selection).some((unit, i) => !isAdjusted(selection, i, unit)) ? [dish] : []
  })
}

export const unitAnswers = (selection: Selection, unit: number): Answers => selection.answers?.[unit] ?? {}

/** The selection with one ordered unit's answer to one question replaced. */
export function withAnswer(selection: Selection, unit: number, questionId: number, answer: Answer): Selection {
  const answers = Array.from({ length: Math.max(unit + 1, selection.answers?.length ?? 0) }, (_, i) =>
    i === unit ? { ...unitAnswers(selection, i), [questionId]: answer } : unitAnswers(selection, i),
  )
  return { ...selection, answers }
}

const answered = (answer: Answer | undefined) => (Array.isArray(answer) ? answer.length > 0 : !!answer?.trim())

/**
 * A unit's answer to a question: the client's, else the admin's default answer, picked for them until they change it
 * (a cleared answer stays cleared).
 */
export function answerOf(question: MenuQuestion, answers: Answers): Answer | undefined {
  const answer = answers[question.id]
  if (answer !== undefined || !question.defaultAnswer) return answer
  return question.kind === 'MultiChoice' ? [question.defaultAnswer] : question.defaultAnswer
}

/** The answers worth sending: only the dish's current questions, and not empty ones. */
function answerInputs(questions: MenuQuestion[], answers: Answers): AnswerInput[] {
  return questions.flatMap((q): AnswerInput[] => {
    const answer = answerOf(q, answers)
    if (!answered(answer)) return []
    return Array.isArray(answer) ? [{ questionId: q.id, choices: answer }] : [{ questionId: q.id, value: answer!.trim() }]
  })
}

/** The questions the client must answer for each unit: the required ones, unless adjusting the dish is optional. */
const requiredQuestions = (dish: MenuDish) => (dish.adjustmentOptional ? [] : (dish.questions?.filter((q) => q.isRequired) ?? []))

/** The dishes in the order that still have a required question with no answer, for any of their units. */
export function unansweredDishes(selections: Record<number, Selection>, dishes: Map<number, MenuDish>): MenuDish[] {
  return Object.entries(selections).flatMap(([id, selection]) => {
    const dish = dishes.get(Number(id))
    const required = dish ? requiredQuestions(dish) : []
    if (!dish || required.length === 0) return []
    const units = unitCount(dish, selection.quantity)
    const missing = Array.from({ length: units }, (_, i) => unitAnswers(selection, i)).some((a) => required.some((q) => !answered(answerOf(q, a))))
    return missing ? [dish] : []
  })
}

/** The first ordered unit of the dish the client still has to fill: not adjusted, or a required question unanswered. */
export function firstIncompleteUnit(dish: MenuDish, selection: Selection, dishes: Map<number, MenuDish>): number {
  const adjustable = !dish.isYesNo && !dish.adjustmentOptional && addOnsOf(dish, dishes).length > 0
  const required = requiredQuestions(dish)
  return unitsOf(dish, selection).findIndex(
    (unit, i) => (adjustable && !isAdjusted(selection, i, unit)) || required.some((q) => !answered(answerOf(q, unitAnswers(selection, i)))),
  )
}

/** The selection with one ordered unit's add-ons replaced. */
export function withUnit(selection: Selection, unit: number, addOns: Record<number, AddOnSelection>): Selection {
  if (unit === 0) return { ...selection, addOns }
  const extraUnits = Array.from({ length: Math.max(unit, selection.extraUnits?.length ?? 0) }, (_, i) =>
    i === unit - 1 ? addOns : (selection.extraUnits?.[i] ?? {}),
  )
  return { ...selection, extraUnits }
}

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

/** Brings one unit's add-ons down to the limits: over-limit amounts are cut, then later add-ons of a full group dropped. */
function fitUnit(parent: MenuDish, unit: Record<number, AddOnSelection>, dishes: Map<number, MenuDish>) {
  const addOns: Record<number, AddOnSelection> = {}
  for (const [id, addOn] of Object.entries(unit)) {
    const dish = dishes.get(Number(id))
    const link = addOnLink(parent, Number(id))
    if (!dish) continue
    const quantity = link.maxQuantity === null ? addOn.quantity : Math.min(addOn.quantity, link.maxQuantity)
    const group = link.groupId === null ? undefined : parent.addOnGroups?.find((g) => g.id === link.groupId)
    if (group?.maxUnits != null && groupUsed(parent, addOns, group.id, dishes) + groupUnits(link, dish, quantity) > group.maxUnits) continue
    addOns[Number(id)] = { ...addOn, quantity }
  }
  return addOns
}

/** After the parent's amount changes, keeps add-ons only for the units that remain and within the per-unit limits. */
export function fitAddOns(parent: MenuDish, selection: Selection, dishes: Map<number, MenuDish>): Selection {
  const units = unitsOf(parent, selection).map((unit) => fitUnit(parent, unit, dishes))
  const extraUnits = units.slice(1)
  const { extraUnits: _dropped, notes: _notes, answers: _answers, confirmed: _confirmed, ...rest } = selection
  void _dropped
  const notes = units.map((_, i) => unitNote(selection, i))
  const answers = units.map((_, i) => unitAnswers(selection, i))
  const confirmed = units.map((_, i) => unitConfirmed(selection, i))
  return {
    ...rest,
    addOns: units[0],
    ...(extraUnits.some((u) => Object.keys(u).length > 0) && { extraUnits }),
    ...(notes.some((n) => n !== '') && { notes }),
    ...(answers.some((a) => Object.keys(a).length > 0) && { answers }),
    ...(confirmed.some(Boolean) && { confirmed }),
  }
}

export function orderTotal(selections: Record<number, Selection>, dishes: Map<number, MenuDish>): number {
  let total = 0
  for (const [id, selection] of Object.entries(selections)) {
    const dish = dishes.get(Number(id))
    if (!dish) continue
    total += lineTotal(dish, selection.optionId, selection.quantity)
    for (const unit of unitsOf(dish, selection))
      for (const [addOnId, addOn] of Object.entries(unit)) {
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

/**
 * The order's lines. A dish with several ordered units sends each unit's own add-ons; the server merges units that chose
 * the same into one line.
 */
export function toLines(selections: Record<number, Selection>, dishes: Map<number, MenuDish>): OrderLineInput[] {
  const toInputs = (unit: Record<number, AddOnSelection>) =>
    Object.entries(unit).map(([addOnId, addOn]) => ({ dishId: Number(addOnId), optionId: addOn.optionId, quantity: addOn.quantity }))
  return Object.entries(selections).map(([id, selection]) => {
    const dish = dishes.get(Number(id))
    const line = { dishId: Number(id), optionId: selection.optionId, quantity: selection.quantity }
    const questions = dish?.questions ?? []
    const answers = (unit: number) => {
      const inputs = answerInputs(questions, unitAnswers(selection, unit))
      return inputs.length > 0 ? inputs : undefined
    }
    // Units get lines of their own only when there is something to choose for each (add-ons or questions); otherwise the
    // dish has one remark for the whole line.
    const perUnit = !!dish && (addOnsOf(dish, dishes).length > 0 || questions.length > 0)
    if (!dish || !perUnit || dish.sellBy !== 'Units' || !Number.isInteger(selection.quantity))
      return { ...line, addOns: toInputs(selection.addOns), note: unitNote(selection, 0).trim() || undefined, answers: answers(0) }
    return {
      ...line,
      addOns: [],
      addOnUnits: unitsOf(dish, selection).map((unit, i) => ({
        addOns: toInputs(unit),
        note: unitNote(selection, i).trim() || undefined,
        answers: answers(i),
      })),
    }
  })
}

/** Dishes by id, for lookups. */
export const dishMap = (menu: Menu) => new Map(menu.dishes.map((d) => [d.id, d]))

/** How many dishes of a category are in the order. */
export function pickedInCategory(selections: Record<number, Selection>, dishes: Map<number, MenuDish>, categoryId: number) {
  return Object.keys(selections).filter((id) => dishes.get(Number(id))?.categoryId === categoryId).length
}

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

  function fit(dish: MenuDish, optionId: number | null, quantity: number, link?: MenuAddOn) {
    if (dish.isYesNo || (link && isCheckbox(link, dish))) return checkedAddOn(dish)
    const { min, max: ownMax, step } = amountRange(dish)
    const max = link?.maxQuantity != null ? Math.max(min, Math.min(ownMax, link.maxQuantity)) : ownMax
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
    const units = unitsOf(dish, { ...selection, addOns: selection.addOns ?? {} }).map((unit) => {
      const addOns: Record<number, AddOnSelection> = {}
      for (const [addOnId, addOn] of Object.entries(unit)) {
        const addOnDish = dishes.get(Number(addOnId))
        if (!addOnDish || !orderable(addOnDish) || !dish.addOnDishIds.includes(addOnDish.id)) {
          skipped++
          continue
        }
        const link = addOnLink(dish, addOnDish.id)
        const fitted = fit(addOnDish, addOn.optionId, addOn.quantity, link)
        // An add-on that no longer fits in its group's limit is left out.
        const group = link.groupId === null ? undefined : dish.addOnGroups?.find((g) => g.id === link.groupId)
        if (group?.maxUnits != null && groupUsed(dish, addOns, group.id, dishes) + groupUnits(link, addOnDish, fitted.quantity) > group.maxUnits) {
          skipped++
          continue
        }
        addOns[addOnDish.id] = fitted
      }
      return addOns
    })
    const extraUnits = units.slice(1)
    selections[dish.id] = {
      ...fit(dish, selection.optionId, selection.quantity),
      addOns: units[0],
      ...(extraUnits.some((u) => Object.keys(u).length > 0) && { extraUnits }),
    }
    // The amount may have been brought to the dish's range: keep add-ons for the units that are left.
    const answers = selection.answers?.map((unit) => keepAnswers(dish.questions ?? [], unit))
    selections[dish.id] = fitAddOns(
      dish,
      {
        ...selections[dish.id],
        ...(selection.notes && { notes: selection.notes }),
        ...(answers && { answers }),
        ...(selection.confirmed && { confirmed: selection.confirmed }),
      },
      dishes,
    )
  }
  return { selections, skipped }
}

/** A saved unit's answers that still fit the dish's questions (a draft kept while the admin changed them). */
function keepAnswers(questions: MenuQuestion[], answers: Answers | null | undefined): Answers {
  const kept: Answers = {}
  for (const q of questions) {
    const answer = answers?.[q.id]
    if (answer === undefined) continue
    if (q.kind === 'MultiChoice') {
      const picked = Array.isArray(answer) ? answer.filter((c) => q.choices.includes(c)) : []
      if (picked.length) kept[q.id] = picked
    } else if (typeof answer === 'string' && (q.kind !== 'SingleChoice' || q.choices.includes(answer))) kept[q.id] = answer
  }
  return kept
}

interface SavedLine {
  dishId: number
  optionId: number | null
  quantity: number
  addOns: { dishId: number; optionId: number | null; quantity: number }[]
}

/**
 * Saved order lines as selections. A dish can come in several lines (units that chose different add-ons): their units are
 * put side by side. Add-ons of a line with several units are shared out between its units as evenly as they divide.
 */
function selectionsFromLines(lines: SavedLine[], dishes: Map<number, MenuDish>): Record<number, Selection> {
  const units: Record<number, Record<number, AddOnSelection>[]> = {}
  const saved: Record<number, Selection> = {}
  for (const line of lines) {
    const dish = dishes.get(line.dishId)
    const n = dish ? unitCount(dish, line.quantity) : 1
    const lineUnits: Record<number, AddOnSelection>[] = Array.from({ length: n }, () => ({}))
    for (const addOn of line.addOns) {
      const whole = Number.isInteger(addOn.quantity)
      for (let i = 0; i < n; i++) {
        const quantity = whole ? Math.floor(addOn.quantity / n) + (i < addOn.quantity % n ? 1 : 0) : i === 0 ? addOn.quantity : 0
        if (quantity > 0) lineUnits[i][addOn.dishId] = { optionId: addOn.optionId, quantity }
      }
    }
    units[line.dishId] = [...(units[line.dishId] ?? []), ...lineUnits]
    const before = saved[line.dishId]
    saved[line.dishId] = { optionId: before?.optionId ?? line.optionId, quantity: (before?.quantity ?? 0) + line.quantity, addOns: {} }
  }
  for (const [id, selection] of Object.entries(saved)) {
    const all = units[Number(id)]
    const extraUnits = all.slice(1)
    // A past order was ordered as it was: every unit counts as adjusted.
    const confirmed = all.map(() => true)
    saved[Number(id)] = { ...selection, addOns: all[0] ?? {}, confirmed, ...(extraUnits.some((u) => Object.keys(u).length > 0) && { extraUnits }) }
  }
  return saved
}

/** A past order as a saved selection. Options are found again by their label; a vanished one falls back to the default. */
export function selectionsFromHistory(order: HistoryOrder, menu: Menu): Restored {
  const dishes = dishMap(menu)
  const optionOf = (dishId: number, label: string | null) =>
    dishes.get(dishId)?.options.find((o) => o.label === label)?.id ?? null

  const lines = order.items
    .filter((i) => i.parentItemId === null)
    .map((item) => ({
      dishId: item.dishId,
      optionId: optionOf(item.dishId, item.optionLabel),
      quantity: item.quantity,
      addOns: order.items
        .filter((i) => i.parentItemId === item.id)
        .map((addOn) => ({ dishId: addOn.dishId, optionId: optionOf(addOn.dishId, addOn.optionLabel), quantity: addOn.quantity })),
    }))
  return restoreSelections(selectionsFromLines(lines, dishes), menu)
}

/** A favorite as a saved selection, with whatever has vanished from the menu skipped. */
export function selectionsFromFavorite(favorite: Favorite, menu: Menu): Restored {
  return restoreSelections(selectionsFromLines(favorite.items, dishMap(menu)), menu)
}
