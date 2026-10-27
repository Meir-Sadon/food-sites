import { useTranslation } from 'react-i18next'
import { weekdays, type SupplyDay, type Weekday } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { FieldError, Info } from '../ui'
import { hasNoHours, missingShifts, rangeForm, shiftRanges, type AvailabilityForm, type DayForm, type RangeForm } from './availabilityForm'

interface Props {
  value: AvailabilityForm
  /** The business's working days and shifts: the ranges "specific hours" offers. */
  supplyDays: SupplyDay[]
  errors: FieldErrors
  onChange: (value: AvailabilityForm) => void
}

/**
 * The days and hours the dish is sold in, apart from the business's working days and shifts: a day is the whole day until
 * "specific hours" is pressed, which offers each shift of that day with its hours (editable). No day ticked: sold whenever.
 */
export function AvailabilitySection({ value, supplyDays, errors, onChange }: Props) {
  const { t } = useTranslation()
  const setDay = (day: Weekday, patch: Partial<DayForm>) => onChange({ ...value, [day]: { ...value[day], ...patch } })
  const setRange = (day: Weekday, key: number, patch: Partial<RangeForm>) =>
    setDay(day, { ranges: value[day].ranges.map((r) => (r.key === key ? { ...r, ...patch } : r)) })
  const anyDay = weekdays.some((day) => value[day].mode !== 'off')

  return (
    <fieldset className="stack availability" aria-labelledby="dish-availability-title">
      <legend className="with-info">
        <span id="dish-availability-title">{t('admin.dishes.availability.title')}</span>
        <Info text={t('admin.dishes.availability.hint')} about={t('admin.dishes.availability.title')} />
      </legend>
      <p className="hint">{anyDay ? t('admin.dishes.availability.some') : t('admin.dishes.availability.none')}</p>
      <ul className="availability__days">
        {weekdays.map((day) => {
          const form = value[day]
          const name = t(`weekdays.${day}`)
          const supplyDay = supplyDays.find((d) => d.weekday === day)
          const shifts = shiftRanges(supplyDay)
          // Ranges the form holds, then the shifts that none of them matches (unticked).
          const rows = form.mode === 'hours' ? [...form.ranges, ...missingShifts(supplyDay, form.ranges)] : []
          return (
            <li key={day} className="availability__day">
              <div className="row">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.mode !== 'off'}
                    onChange={(e) => setDay(day, { mode: e.target.checked ? 'whole' : 'off', ranges: [] })}
                  />
                  {name}
                </label>
                {form.mode === 'whole' && <span className="muted">{t('admin.dishes.availability.wholeDay')}</span>}
                {form.mode === 'whole' && (
                  <button
                    type="button"
                    className="secondary"
                    aria-label={t('admin.dishes.availability.specificFor', { day: name })}
                    onClick={() => setDay(day, { mode: 'hours', ranges: shifts.length > 0 ? shifts.map((r) => ({ ...r, on: false })) : [rangeForm('08:00', '12:00')] })}
                  >
                    {t('admin.dishes.availability.specific')}
                  </button>
                )}
                {form.mode === 'hours' && (
                  <button
                    type="button"
                    className="secondary"
                    aria-label={t('admin.dishes.availability.wholeFor', { day: name })}
                    onClick={() => setDay(day, { mode: 'whole', ranges: [] })}
                  >
                    {t('admin.dishes.availability.backToWhole')}
                  </button>
                )}
              </div>
              {form.mode === 'hours' && (
                <div className="availability__ranges stack">
                  {shifts.length === 0 && <p className="hint">{t('admin.dishes.availability.noShifts', { day: name })}</p>}
                  {rows.map((range, i) => {
                    const n = i + 1
                    const known = form.ranges.some((r) => r.key === range.key)
                    return (
                      <span key={range.key} className="row">
                        <input
                          type="checkbox"
                          aria-label={t('admin.dishes.availability.rangeOn', { day: name, n })}
                          checked={range.on}
                          onChange={(e) =>
                            known
                              ? setRange(day, range.key, { on: e.target.checked })
                              : setDay(day, { ranges: [...form.ranges, { ...range, on: e.target.checked }] })
                          }
                        />
                        <input
                          type="time"
                          aria-label={t('admin.dishes.availability.rangeFrom', { day: name, n })}
                          value={range.from}
                          disabled={!range.on}
                          required
                          onChange={(e) => known && setRange(day, range.key, { from: e.target.value })}
                        />
                        <span>{t('admin.settings.hoursTo')}</span>
                        <input
                          type="time"
                          aria-label={t('admin.dishes.availability.rangeTo', { day: name, n })}
                          value={range.to}
                          disabled={!range.on}
                          required
                          onChange={(e) => known && setRange(day, range.key, { to: e.target.value })}
                        />
                        {known && (
                          <button
                            type="button"
                            className="secondary"
                            aria-label={t('admin.dishes.availability.removeRange', { day: name, n })}
                            onClick={() => setDay(day, { ranges: form.ranges.filter((r) => r.key !== range.key) })}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    )
                  })}
                  <div>
                    <button
                      type="button"
                      className="secondary"
                      aria-label={t('admin.dishes.availability.addRangeFor', { day: name })}
                      onClick={() => setDay(day, { ranges: [...form.ranges, rangeForm('08:00', '12:00')] })}
                    >
                      {t('admin.dishes.availability.addRange')}
                    </button>
                  </div>
                  {hasNoHours(form) && <p className="hint">{t('admin.dishes.availability.noneTicked', { day: name })}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <FieldError errors={errors} field="availability" id="dish-availability-error" />
    </fieldset>
  )
}
