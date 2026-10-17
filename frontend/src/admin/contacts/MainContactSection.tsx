import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { contactsApi, type Contact } from '../../api/site'
import type { FieldErrors } from '../../api/client'
import { FieldError, Loading, Section, Status } from '../ui'
import { fieldErrorsOf, useFormErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsavedChanges'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'

type Field = keyof Contact

export function MainContactSection() {
  const { t } = useTranslation()
  const errorMessage = useFormErrorMessage()
  const { data: contact, setData, failed, unsaved } = useLoad(contactsApi.get)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const { saved, flash } = useSavedFlash()
  const [saving, setSaving] = useState(false)

  function change(patch: Partial<Contact>) {
    setData((current) => current && { ...current, ...patch })
    setError(null)
  }

  async function save() {
    if (!contact) return true
    setSaving(true)
    setErrors({})
    try {
      setData(await contactsApi.save(contact))
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
  useUnsavedChanges(unsaved, save)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  const text = (field: Field, label: string, props: { required?: boolean; type?: string; dir?: string; maxLength: number }) => {
    const id = `contact-${field}`
    return (
      <span className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type={props.type ?? 'text'}
          dir={props.dir}
          required={props.required}
          maxLength={props.maxLength}
          value={contact?.[field] ?? ''}
          aria-describedby={`${id}-error`}
          onChange={(e) => change({ [field]: e.target.value })}
        />
        <FieldError errors={errors} field={field} id={`${id}-error`} />
      </span>
    )
  }

  return (
    <Section title={t('admin.contacts.main')} hint={t('admin.contacts.mainHint')}>
      {!contact ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack" noValidate>
          {text('name', t('admin.contacts.name'), { required: true, maxLength: 100 })}
          {text('phone', t('admin.contacts.phone'), { required: true, type: 'tel', dir: 'ltr', maxLength: 20 })}
          {text('address', t('admin.contacts.address'), { maxLength: 300 })}
          {text('email', t('admin.contacts.email'), { type: 'email', dir: 'ltr', maxLength: 200 })}
          {text('openingHours', t('admin.contacts.openingHours'), { maxLength: 500 })}
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
