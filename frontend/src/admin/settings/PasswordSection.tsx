import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { changeAdminPassword } from '../../api/admin'
import { ApiError, type FieldErrors } from '../../api/client'
import { FieldError, Section, Status } from '../ui'
import { fieldErrorsOf, useFormErrorMessage } from '../hooks'

type Field = 'currentPassword' | 'newPassword'

export function PasswordSection() {
  const { t } = useTranslation()
  const errorMessage = useFormErrorMessage()
  const [values, setValues] = useState<Record<Field, string>>({ currentPassword: '', newPassword: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      await changeAdminPassword(values.currentPassword, values.newPassword)
      setValues({ currentPassword: '', newPassword: '' })
      setStatus({ message: t('admin.settings.passwordChanged') })
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      const tooMany = err instanceof ApiError && err.status === 429
      setStatus({ message: tooMany ? t('admin.tooManyAttempts') : errorMessage(err), error: true })
    } finally {
      setSaving(false)
    }
  }

  const input = (field: Field, label: string, autoComplete: string) => {
    const id = `settings-${field}`
    return (
      <span className="field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type="text"
          dir="ltr"
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={200}
          value={values[field]}
          aria-describedby={`${id}-error`}
          onChange={(e) => {
            setValues((current) => ({ ...current, [field]: e.target.value }))
            setStatus(null)
          }}
        />
        <FieldError errors={errors} field={field} id={`${id}-error`} />
      </span>
    )
  }

  return (
    <Section title={t('admin.settings.password')} hint={t('admin.settings.passwordHint')}>
      <form onSubmit={handleSubmit} className="stack">
        {input('currentPassword', t('admin.settings.currentPassword'), 'current-password')}
        {input('newPassword', t('admin.settings.newPassword'), 'new-password')}
        <div className="row">
          <button type="submit" disabled={saving || !values.currentPassword || !values.newPassword}>
            {saving ? t('admin.saving') : t('admin.settings.changePassword')}
          </button>
        </div>
        {status && <Status message={status.message} error={status.error} />}
      </form>
    </Section>
  )
}
