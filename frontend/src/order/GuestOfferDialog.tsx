import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fieldErrorsOf } from '../admin/hooks'
import { accountApi, type LoginResult } from '../api/account'
import type { FieldErrors } from '../api/client'
import { Modal } from '../components/Modal'
import { normalizePhone } from './phone'
import { PhoneField } from './PhoneField'

interface Props {
  /** The phone already typed in the order form. */
  phone: string
  /** The number of orders the discounts are limited to, when they are. */
  maxOrders: number | null
  onSignedUp: (result: LoginResult) => void
  /** Go on and send the order as a guest. */
  onSkip: () => void
  onCancel: () => void
}

/**
 * Asked once when a guest presses "send the order" and a price list gives a new client lower prices: sign up (or log in
 * to the account the phone already has) by phone, right here, and see the prices again before sending.
 */
export function GuestOfferDialog({ phone: initialPhone, maxOrders, onSignedUp, onSkip, onCancel }: Props) {
  const { t } = useTranslation()
  const [phone, setPhone] = useState(initialPhone)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)

  async function signUp() {
    const normalized = normalizePhone(phone)
    if (!normalized) {
      setErrors({ phone: ['phone'] })
      return
    }
    setBusy(true)
    setErrors({})
    try {
      onSignedUp(await accountApi.login(normalized))
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={t('guestOffer.title')} onClose={onCancel} wide>
      <p>{t('guestOffer.text')}</p>
      {maxOrders !== null && <p className="hint">{maxOrders === 1 ? t('guestOffer.limitOne') : t('guestOffer.limitMany', { count: maxOrders })}</p>}
      <PhoneField id="guest-offer-phone" phone={phone} onPhoneChange={setPhone} errors={errors} />
      <p className="hint">{t('guestOffer.phoneNote')}</p>
      <div className="row modal__actions modal__actions--inline">
        <button type="button" onClick={() => void signUp()} disabled={busy}>
          {t('guestOffer.signUp')}
        </button>
        <button type="button" className="button-quiet" onClick={onSkip} disabled={busy}>
          {t('guestOffer.skip')}
        </button>
        <button type="button" className="button-quiet" onClick={onCancel} disabled={busy}>
          {t('guestOffer.back')}
        </button>
      </div>
    </Modal>
  )
}
