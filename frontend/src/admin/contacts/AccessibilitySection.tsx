import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { accessibilityApi, type AccessibilityInfo } from '../../api/site'
import type { FieldErrors } from '../../api/client'
import { FieldError, Loading, Section, Status } from '../ui'
import { fieldErrorsOf, useFormErrorMessage, useLoad } from '../hooks'
import { useDirty, useUnsavedChanges } from '../unsaved'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'

type Field = 'name' | 'phone' | 'email' | 'notes'

/** The accessibility coordinator and known limits shown in the public accessibility statement. */
export function AccessibilitySection() {
  const { t } = useTranslation()
  const errorMessage = useFormErrorMessage()
  const { data: info, setData, failed } = useLoad(accessibilityApi.getAdmin)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const { saved, flash } = useSavedFlash()
  const [saving, setSaving] = useState(false)

  const { dirty, markSaved } = useDirty(info)
  useUnsavedChanges(dirty, save)

  function change(patch: Partial<AccessibilityInfo>) {
    setData((current) => current && { ...current, ...patch })
    setError(null)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!info) return false
    setSaving(true)
    setErrors({})
    try {
      const result = await accessibilityApi.save(info)
      setData(result)
      markSaved(result)
      setError(null)
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

  const id = (field: Field) => `accessibility-${field}`

  return (
    <Section title={t('admin.contacts.accessibility')} hint={t('admin.contacts.accessibilityHint')}>
      {!info ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack" noValidate>
          <span className="field">
            <label htmlFor={id('name')}>{t('admin.contacts.accessibilityName')}</label>
            <input id={id('name')} maxLength={100} value={info.name ?? ''} aria-describedby={`${id('name')}-error`} onChange={(e) => change({ name: e.target.value })} />
            <FieldError errors={errors} field="name" id={`${id('name')}-error`} />
          </span>
          <span className="field">
            <label htmlFor={id('phone')}>{t('admin.contacts.accessibilityPhone')}</label>
            <input id={id('phone')} type="tel" dir="ltr" maxLength={20} value={info.phone ?? ''} aria-describedby={`${id('phone')}-error`} onChange={(e) => change({ phone: e.target.value })} />
            <FieldError errors={errors} field="phone" id={`${id('phone')}-error`} />
          </span>
          <span className="field">
            <label htmlFor={id('email')}>{t('admin.contacts.accessibilityEmail')}</label>
            <input id={id('email')} type="email" dir="ltr" maxLength={200} value={info.email ?? ''} aria-describedby={`${id('email')}-error`} onChange={(e) => change({ email: e.target.value })} />
            <FieldError errors={errors} field="email" id={`${id('email')}-error`} />
          </span>
          <span className="field">
            <label htmlFor={id('notes')}>{t('admin.contacts.accessibilityNotes')}</label>
            <textarea id={id('notes')} rows={3} maxLength={1500} value={info.notes ?? ''} aria-describedby={`${id('notes')}-error`} onChange={(e) => change({ notes: e.target.value })} />
            <FieldError errors={errors} field="notes" id={`${id('notes')}-error`} />
          </span>
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
