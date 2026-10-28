import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../api/client'
import { FieldError } from '../admin/ui'

interface Props {
  phone: string
  onPhoneChange: (phone: string) => void
  errors: FieldErrors
  /** For a second phone field on the same page (a dialog over the login form). */
  id?: string
}

/** The phone field. The number is taken as typed; there is no confirmation code. */
export function PhoneField({ phone, onPhoneChange, errors, id = 'order-phone' }: Props) {
  const { t } = useTranslation()
  return (
    <span className="field">
      <label htmlFor={id}>{t('order.phone')}</label>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        value={phone}
        aria-describedby={`${id}-error`}
        onChange={(e) => onPhoneChange(e.target.value)}
      />
      <FieldError errors={errors} field="phone" id={`${id}-error`} />
    </span>
  )
}
