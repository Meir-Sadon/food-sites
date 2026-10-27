import { weekdays, type AvailabilityRule, type SupplyDay, type Weekday } from '../../api/catalog'
import { formKey } from './addOnForm'

/** One range of hours in a weekday the dish is sold in; `on` is its check box (a shift not ticked is not sold). */
export interface RangeForm {
  key: number
  from: string
  to: string
  on: boolean
}

/** A weekday of the dish's times: not sold, sold the whole day, or sold in the ticked ranges only. */
export interface DayForm {
  mode: 'off' | 'whole' | 'hours'
  ranges: RangeForm[]
}

export type AvailabilityForm = Record<Weekday, DayForm>

const hhmm = (time: string) => time.slice(0, 5)

export const rangeForm = (from: string, to: string, on = true): RangeForm => ({ key: formKey(), from: hhmm(from), to: hhmm(to), on })

/** The dish's rules in the form, a weekday at a time. */
export function availabilityForm(rules: AvailabilityRule[] | undefined): AvailabilityForm {
  const form = {} as AvailabilityForm
  for (const day of weekdays) {
    const own = (rules ?? []).filter((r) => r.weekday === day)
    form[day] = own.length === 0
      ? { mode: 'off', ranges: [] }
      : own.some((r) => r.from === null || r.to === null)
        ? { mode: 'whole', ranges: [] }
        : { mode: 'hours', ranges: own.map((r) => rangeForm(r.from!, r.to!)) }
  }
  return form
}

/**
 * The ranges of a day's shifts, each ticked: what "specific hours" starts from. The same range appears once, and a day
 * that is not a supply day (or has no hours) has none.
 */
export function shiftRanges(day: SupplyDay | undefined): RangeForm[] {
  return day?.enabled ? day.hours.map((h) => rangeForm(h.from, h.to)) : []
}

/** The shifts of a day that no range of the form covers exactly, unticked: a shift is always one tick away. */
export function missingShifts(day: SupplyDay | undefined, ranges: RangeForm[]): RangeForm[] {
  return shiftRanges(day)
    .filter((shift) => !ranges.some((r) => r.from === shift.from && r.to === shift.to))
    .map((shift) => ({ ...shift, on: false }))
}

/** The rules to send: a whole day, or the ticked ranges; ranges left unticked are not sold. */
export function availabilityInput(form: AvailabilityForm): AvailabilityRule[] {
  return weekdays.flatMap((day): AvailabilityRule[] => {
    const { mode, ranges } = form[day]
    if (mode === 'whole') return [{ weekday: day, from: null, to: null }]
    if (mode === 'off') return []
    return ranges.filter((r) => r.on).map((r) => ({ weekday: day, from: `${r.from}:00`, to: `${r.to}:00` }))
  })
}

/** Whether a day set to specific hours has none ticked (then the dish is not sold that day). */
export const hasNoHours = (day: DayForm) => day.mode === 'hours' && !day.ranges.some((r) => r.on)
