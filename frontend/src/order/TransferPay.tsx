import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Payment } from '../api/site'
import { useToast } from '../components/toast'
import { formatMoney } from './format'
import { paymentKey, transferAmount } from './payment'

/**
 * How to pay by hand with Bit or PayBox: the business's number and the exact amount, each with a copy button,
 * and the owner's payment-request link when they set one. Neither app accepts a phone number and an amount in a
 * public link, so the client types them in (or opens the owner's own request link).
 */
export function TransferPay({ method, phone, total, link }: { method: Payment; phone: string; total: number; link?: string | null }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [failed, setFailed] = useState(false)
  const service = t(paymentKey(method))

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setFailed(false)
      toast(t('order.pay.copied'))
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="transfer-pay">
      <p>{t('order.success.transfer', { total: formatMoney(total), service })}</p>
      <p className="transfer-pay__row">
        <span>{t('order.pay.number')}</span>
        <strong dir="ltr">{phone}</strong>
        <button type="button" className="button button--small" onClick={() => copy(phone)}>
          {t('order.pay.copy')}
        </button>
      </p>
      <p className="transfer-pay__row">
        <span>{t('order.pay.amount')}</span>
        <strong dir="ltr">{transferAmount(total)}</strong>
        <button type="button" className="button button--small" onClick={() => copy(transferAmount(total))}>
          {t('order.pay.copy')}
        </button>
      </p>
      {failed && <p className="hint">{t('order.pay.copyFailed')}</p>}
      {link && (
        <a className="button" href={link} target="_blank" rel="noopener noreferrer">
          {t('order.pay.open', { service })}
        </a>
      )}
    </div>
  )
}
