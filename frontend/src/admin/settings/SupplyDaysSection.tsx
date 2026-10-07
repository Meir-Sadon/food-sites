import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { supplyDaysApi, weekdays, type SupplyDay, type Weekday } from '../../api/catalog'
import { Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'

export function SupplyDaysSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data: days, setData, failed } = useLoad(supplyDaysApi.get)
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  function change(weekday: Weekday, patch: Partial<SupplyDay>) {
    setData((current) => current && current.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))
    setStatus(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!days) return
    setSaving(true)
    try {
      setData(await supplyDaysApi.save(days))
      setStatus({ message: t('admin.saved') })
    } catch (err) {
      setStatus({ message: errorMessage(err), error: true })
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
                </li>
              )
            })}
          </ul>
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
            {status && <Status message={status.message} error={status.error} />}
          </div>
        </form>
      )}
    </Section>
  )
}
