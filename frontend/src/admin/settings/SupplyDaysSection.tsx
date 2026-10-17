import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { supplyDaysApi, weekdays, type SupplyDay, type Weekday } from '../../api/catalog'
import { Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsavedChanges'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'

export function SupplyDaysSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data: days, setData, failed, unsaved } = useLoad(supplyDaysApi.get)
  const [error, setError] = useState<string | null>(null)
  const { saved, flash } = useSavedFlash()
  const [saving, setSaving] = useState(false)

  function change(weekday: Weekday, patch: Partial<SupplyDay>) {
    setData((current) => current && current.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))
    setError(null)
  }

  async function save() {
    if (!days) return true
    setSaving(true)
    try {
      setData(await supplyDaysApi.save(days))
      setError(null)
      flash()
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }
  useUnsavedChanges(unsaved, save)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
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
                    <span className="row">
                      <span>{t('admin.settings.hours')}</span>
                      <input
                        type="time"
                        aria-label={t('admin.settings.hoursFrom', { day: name })}
                        value={day.deliveryFrom?.slice(0, 5) ?? ''}
                        onChange={(e) => change(day.weekday, { deliveryFrom: e.target.value ? `${e.target.value}:00` : null })}
                      />
                      <span>{t('admin.settings.hoursTo')}</span>
                      <input
                        type="time"
                        aria-label={t('admin.settings.hoursToFor', { day: name })}
                        value={day.deliveryTo?.slice(0, 5) ?? ''}
                        onChange={(e) => change(day.weekday, { deliveryTo: e.target.value ? `${e.target.value}:00` : null })}
                      />
                    </span>
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
        </form>
      )}
    </Section>
  )
}
