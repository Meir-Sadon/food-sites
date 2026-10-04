import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../api/client'
import type { ProfileForm } from './profileForm'
import { FieldError } from '../admin/ui'
import { AddressFields } from './AddressFields'

interface Props {
  form: ProfileForm
  onChange: (patch: Partial<ProfileForm>) => void
  errors: FieldErrors
  /** Prefix for the input ids, so two forms on a page never clash. */
  idPrefix: string
}

export function ProfileFields({ form, onChange, errors, idPrefix }: Props) {
  const { t } = useTranslation()
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <>
      <span className="field">
        <label htmlFor={id('name')}>{t('account.fullName')}</label>
        <input
          id={id('name')}
          autoComplete="name"
          maxLength={100}
          required
          value={form.fullName}
          aria-describedby={id('name-error')}
          onChange={(e) => onChange({ fullName: e.target.value })}
        />
        <FieldError errors={errors} field="fullName" id={id('name-error')} />
      </span>

      <AddressFields value={form} onChange={onChange} errors={errors} idPrefix={idPrefix} />

      <span className="field">
        <label htmlFor={id('email')}>{t('account.email')}</label>
        <input
          id={id('email')}
          type="email"
          autoComplete="email"
          dir="ltr"
          maxLength={200}
          value={form.email}
          aria-describedby={id('email-error')}
          onChange={(e) => onChange({ email: e.target.value })}
        />
        <FieldError errors={errors} field="email" id={id('email-error')} />
      </span>

      <span className="field">
        <label htmlFor={id('birthday')}>{t('account.birthday')}</label>
        <input
          id={id('birthday')}
          type="date"
          min="1900-01-01"
          max={today}
          autoComplete="bday"
          value={form.birthday}
          aria-describedby={id('birthday-error')}
          onChange={(e) => onChange({ birthday: e.target.value })}
        />
        <FieldError errors={errors} field="birthday" id={id('birthday-error')} />
      </span>

      <span className="field">
        <label htmlFor={id('ethnic')}>{t('account.ethnicBackground')}</label>
        <input
          id={id('ethnic')}
          maxLength={100}
          value={form.ethnicBackground}
          aria-describedby={id('ethnic-error')}
          onChange={(e) => onChange({ ethnicBackground: e.target.value })}
        />
        <FieldError errors={errors} field="ethnicBackground" id={id('ethnic-error')} />
      </span>
    </>
  )
}
