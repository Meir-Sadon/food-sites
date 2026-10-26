import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '../../api/catalog'
import { INACTIVE_UNITS, type InactiveAfter } from '../../api/site'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import type { FieldErrors } from '../../api/client'
import { fieldErrorsOf, useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsaved'
import { FieldError, Loading, Section, Status } from '../ui'

/**
 * After how long without an order a registered client counts as inactive. The entry pop-ups use it to tell active
 * clients from inactive ones. Saved on its own, so another section never overwrites it with an older copy.
 */
export function InactiveAfterSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [edited, setEdited] = useState<InactiveAfter | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const period = edited ?? settings?.inactiveAfter
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(settings?.inactiveAfter)

  useUnsavedChanges(dirty, save)

  function set(patch: Partial<InactiveAfter>) {
    if (period) setEdited({ ...period, ...patch })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!period) return false
    setSaving(true)
    setError(null)
    setErrors({})
    try {
      setData(await settingsApi.saveInactiveAfter(period))
      setEdited(null)
      flash()
      return true
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title={t('admin.settings.inactive.title')} hint={t('admin.settings.inactive.hint')}>
      {!settings || !period ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <div className="row">
            <span className="field field--narrow">
              <label htmlFor="inactive-amount">{t('admin.settings.inactive.amount')}</label>
              <input
                id="inactive-amount"
                type="number"
                min={1}
                max={104}
                inputMode="numeric"
                value={period.amount}
                aria-describedby="inactive-amount-error"
                onChange={(e) => set({ amount: Number(e.target.value) })}
              />
              <FieldError errors={errors} field="amount" id="inactive-amount-error" />
            </span>
            <span className="field field--narrow">
              <label htmlFor="inactive-unit">{t('admin.settings.inactive.unit')}</label>
              <select id="inactive-unit" value={period.unit} onChange={(e) => set({ unit: e.target.value as InactiveAfter['unit'] })}>
                {INACTIVE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {t(`admin.settings.inactive.units.${unit}`)}
                  </option>
                ))}
              </select>
            </span>
          </div>
          <div className="row">
            <button type="submit" disabled={saving || !dirty}>
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
