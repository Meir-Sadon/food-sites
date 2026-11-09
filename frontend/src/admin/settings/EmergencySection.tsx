import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { EMERGENCY_MESSAGE_MAX, emergencyApi, type EmergencyInput } from '../../api/emergency'
import type { FieldErrors } from '../../api/client'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { fieldErrorsOf, useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsaved'
import { FieldError, Loading, Section, Status } from '../ui'

/**
 * Emergency mode: the site takes no orders and visitors are told to phone. Saved on its own, so another section
 * never overwrites it with an older copy.
 */
export function EmergencySection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data, setData, failed } = useLoad(emergencyApi.get)
  const [edited, setEdited] = useState<EmergencyInput | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const current: EmergencyInput | null = data ? { enabled: data.enabled, phone: data.phone ?? '', message: data.message ?? '' } : null
  const form = edited ?? current
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(current)

  useUnsavedChanges(dirty, save)

  function set(patch: Partial<EmergencyInput>) {
    if (form) setEdited({ ...form, ...patch })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!form) return false
    setSaving(true)
    setError(null)
    setErrors({})
    try {
      setData(await emergencyApi.save(form))
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
    <Section title={t('admin.settings.emergency.title')} hint={t('admin.settings.emergency.hint')}>
      {!data || !form ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <label className="checkbox">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            {t('admin.settings.emergency.enabled')}
          </label>
          <span className="field">
            <label htmlFor="emergency-phone">{t('admin.settings.emergency.phone')}</label>
            <input
              id="emergency-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={form.phone ?? ''}
              aria-describedby="emergency-phone-error emergency-phone-hint"
              onChange={(e) => set({ phone: e.target.value })}
            />
            <span id="emergency-phone-hint" className="hint">
              {data.effectivePhone ? t('admin.settings.emergency.phoneHint', { phone: data.effectivePhone }) : t('admin.settings.emergency.phoneNone')}
            </span>
            <FieldError errors={errors} field="phone" id="emergency-phone-error" />
          </span>
          <span className="field">
            <label htmlFor="emergency-message">{t('admin.settings.emergency.message')}</label>
            <textarea
              id="emergency-message"
              rows={3}
              maxLength={EMERGENCY_MESSAGE_MAX}
              value={form.message ?? ''}
              aria-describedby="emergency-message-error emergency-message-hint"
              onChange={(e) => set({ message: e.target.value })}
            />
            <span id="emergency-message-hint" className="hint">
              {t('admin.settings.emergency.messageHint', { text: t('emergency.defaultMessage') })}
            </span>
            <FieldError errors={errors} field="message" id="emergency-message-error" />
          </span>
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
