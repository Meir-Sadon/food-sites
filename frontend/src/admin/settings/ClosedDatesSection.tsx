import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { closedDatesApi } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { formatDate } from '../format'
import { ConfirmRemove, FieldError, Loading, Section, Status } from '../ui'
import { fieldErrorsOf, useErrorMessage, useLoad } from '../hooks'

export function ClosedDatesSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data: dates, setData, failed } = useLoad(closedDatesApi.get)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setError(null)
    try {
      const added = await closedDatesApi.add(date, reason)
      setData((current) => [...(current ?? []), added].sort((a, b) => a.date.localeCompare(b.date)))
      setDate('')
      setReason('')
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      if (!Object.keys(fieldErrorsOf(err)).length) setError(errorMessage(err))
    }
  }

  async function handleRemove(id: number) {
    try {
      await closedDatesApi.remove(id)
      setData((current) => current && current.filter((d) => d.id !== id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Section title={t('admin.settings.closedDates')} hint={t('admin.settings.closedHint')}>
      {!dates ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          {dates.length === 0 ? (
            <p>{t('admin.settings.noClosedDates')}</p>
          ) : (
            <ul className="list">
              {dates.map((d) => (
                <li key={d.id} className="list__row">
                  <span>
                    <bdi className="numeric">{formatDate(d.date)}</bdi>
                    {d.reason && ` · ${d.reason}`}
                  </span>
                  <ConfirmRemove name={formatDate(d.date)} onConfirm={() => handleRemove(d.id)} />
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAdd} className="row row--end">
            <span className="field">
              <label htmlFor="closed-date">{t('admin.settings.date')}</label>
              <input
                id="closed-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-describedby="closed-date-error"
              />
              <FieldError errors={errors} field="date" id="closed-date-error" />
            </span>
            <span className="field field--grow">
              <label htmlFor="closed-reason">{t('admin.settings.reason')}</label>
              <input id="closed-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            </span>
            <button type="submit" disabled={!date}>
              {t('admin.add')}
            </button>
          </form>
          {error && <Status message={error} error />}
        </div>
      )}
    </Section>
  )
}
