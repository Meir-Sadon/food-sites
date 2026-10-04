import { useTranslation } from 'react-i18next'
import type { Confirmation } from '../api/site'
import { Modal } from '../components/Modal'
import { formatMoney, formatSupplyDate } from './format'

const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 3 })

interface Props {
  confirmation: Confirmation
  contactPhone: string | null
  onClose: () => void
}

/** Shown after the order is saved: the summary the client also gets by WhatsApp. */
export function SuccessDialog({ confirmation, contactPhone, onClose }: Props) {
  const { t } = useTranslation()
  return (
    <Modal title={t('order.success.title')} onClose={onClose}>
      <p>{t('order.success.number', { id: confirmation.id })}</p>
      <p>
        {formatSupplyDate(confirmation.supplyDate, t)} ·{' '}
        {confirmation.fulfillmentMethod === 'Delivery' ? t('order.delivery') : t('order.pickup')}
      </p>
      <ul className="summary">
        {confirmation.items.map((item, i) => (
          <li key={i} className={item.isAddOn ? 'summary__addon' : undefined}>
            <span>
              {number.format(item.quantity)} × {item.dishName}
              {item.optionLabel ? ` (${item.optionLabel})` : ''}
            </span>
            <span className="numeric">{formatMoney(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <p className="summary__total">
        {t('order.total')}: <strong className="numeric">{formatMoney(confirmation.total)}</strong>
      </p>
      {confirmation.paymentMethod === 'Transfer' && confirmation.paymentPhone ? (
        <p>
          {t('order.success.transfer', { total: formatMoney(confirmation.total) })}{' '}
          <strong dir="ltr">{confirmation.paymentPhone}</strong>
        </p>
      ) : (
        <p>{t('order.payOnDeliveryNote')}</p>
      )}
      {confirmation.needsReview && (
        <p role="status" className="notice notice--warning">
          {t('order.success.needsReview')}
        </p>
      )}
      <p>{t('order.success.whatsapp')}</p>
      {contactPhone && (
        <p className="muted">
          {t('order.callToChange')} <span dir="ltr">{contactPhone}</span>
        </p>
      )}
      <button type="button" onClick={onClose}>
        {t('order.success.close')}
      </button>
    </Modal>
  )
}
