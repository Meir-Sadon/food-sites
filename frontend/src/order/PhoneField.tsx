import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../api/client'
import { FieldError } from '../admin/ui'

interface Props {
  phone: string
  onPhoneChange: (phone: string) => void
  errors: FieldErrors
}

/** The phone field. The number is taken as typed; there is no confirmation code. */
export function PhoneField({ phone, onPhoneChange, errors }: Props) {
  const { t } = useTranslation()
  return (
    <span className="field">
      <label htmlFor="order-phone">{t('order.phone')}</label>
      <input
        id="order-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        value={phone}
        aria-describedby="order-phone-error"
        onChange={(e) => onPhoneChange(e.target.value)}
      />
      <FieldError errors={errors} field="phone" id="order-phone-error" />
    </span>
  )
}
