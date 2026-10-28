import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { supplyDaysApi, weekdays, type SupplyDay, type SupplyHours, type Weekday } from '../../api/catalog'
import { ApiError } from '../../api/client'
import { Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'
import { useDirty, useUnsavedChanges } from '../unsaved'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'

const MAX_RANGES = 6

export function SupplyDaysSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data: days, setData, failed } = useLoad(supplyDaysApi.get)
  const [error, setError] = useState<string | null>(null)
  const { saved, flash } = useSavedFlash()
  const [saving, setSaving] = useState(false)
  /** Dishes sold in specific hours of a weekday whose hours changed; set while the admin decides whether to save anyway. */
  const [affectedDishes, setAffectedDishes] = useState<string[] | null>(null)

  function change(weekday: Weekday, patch: Partial<SupplyDay>) {
    setData((current) => current && current.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))
    setError(null)
  }

  function changeRange(day: SupplyDay, index: number, patch: Partial<SupplyHours>) {
    change(day.weekday, { hours: day.hours.map((r, i) => (i === index ? { ...r, ...patch } : r)) })
  }

  const { dirty, markSaved } = useDirty(days)
  useUnsavedChanges(dirty, () => save())

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(confirmed = false): Promise<boolean> {
    if (!days) return false
    setSaving(true)
    try {
      const result = await supplyDaysApi.save(days, confirmed)
      setAffectedDishes(null)
      setData(result)
      markSaved(result)
      setError(null)
      flash()
      return true
    } catch (err) {
      if (err instanceof ApiError && err.code === 'dishAvailabilityAffected') {
        const dishes = (err.body?.dishes ?? []) as { name: string }[]
        setAffectedDishes(dishes.map((d) => d.name))
        setError(null)
        return false
      }
      setAffectedDishes(null)
      setError(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title={t('admin.settings.supplyDays')} hint={t('admin.settings.supplyHint')}>
      {!days ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <ul className="supply-days">
            {days.map((day) => {
              const name = t(`weekdays.${day.weekday}`)
              return (
                <li key={day.weekday} className={day.enabled ? 'supply-day supply-day--on' : 'supply-day'}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={day.enabled}
                      onChange={(e) => change(day.weekday, { enabled: e.target.checked })}
                    />
                    {name}
                  </label>
                  {day.enabled && (
                    <span className="row">
                      <span>{t('admin.settings.cutoff')}</span>
                      <select
                        aria-label={t('admin.settings.cutoffDay', { day: name })}
                        value={day.cutoffDay}
                        onChange={(e) => change(day.weekday, { cutoffDay: e.target.value as Weekday })}
                      >
                        {weekdays.map((w) => (
                          <option key={w} value={w}>
                            {t(`weekdays.${w}`)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="time"
                        aria-label={t('admin.settings.cutoffTime', { day: name })}
                        value={day.cutoffTime.slice(0, 5)}
                        required
                        onChange={(e) => change(day.weekday, { cutoffTime: `${e.target.value}:00` })}
                      />
                    </span>
                  )}
                  {day.enabled && (
                    <div className="supply-hours">
                      <span>{t('admin.settings.hours')}</span>
                      {day.hours.map((range, i) => (
                        <span key={i} className="row">
                          <input
                            type="time"
                            aria-label={t('admin.settings.hoursFrom', { day: name, n: i + 1 })}
                            value={range.from.slice(0, 5)}
                            required
                            onChange={(e) => changeRange(day, i, { from: `${e.target.value}:00` })}
                          />
                          <span>{t('admin.settings.hoursTo')}</span>
                          <input
                            type="time"
                            aria-label={t('admin.settings.hoursToFor', { day: name, n: i + 1 })}
                            value={range.to.slice(0, 5)}
                            required
                            onChange={(e) => changeRange(day, i, { to: `${e.target.value}:00` })}
                          />
                          <button
                            type="button"
                            className="secondary"
                            aria-label={t('admin.settings.removeRange', { day: name, n: i + 1 })}
                            onClick={() => change(day.weekday, { hours: day.hours.filter((_, j) => j !== i) })}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      {day.hours.length < MAX_RANGES && (
                        <button
                          type="button"
                          className="secondary"
                          aria-label={t('admin.settings.addRangeFor', { day: name })}
                          onClick={() => change(day.weekday, { hours: [...day.hours, { from: '11:00:00', to: '00:00:00' }] })}
                        >
                          {t('admin.settings.addRange')}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
            <SavedNote show={saved} />
            {error && <Status message={error} error />}
          </div>
          {affectedDishes !== null && (
            <div className="warning" role="alert">
              <p>{t('admin.settings.availabilityAffected', { names: affectedDishes.join(', ') })}</p>
              <div className="row">
                <button type="button" onClick={() => void save(true)}>
                  {t('admin.dishes.saveAnyway')}
                </button>
                <button type="button" className="button-quiet" onClick={() => setAffectedDishes(null)}>
                  {t('admin.cancel')}
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </Section>
  )
}
