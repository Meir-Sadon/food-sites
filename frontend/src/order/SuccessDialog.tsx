import { isTransfer } from './payment'
import { TransferPay } from './TransferPay'
import { useTranslation } from 'react-i18next'
import type { Confirmation } from '../api/site'
import { Modal } from '../components/Modal'
import { DeliveryFeeNote } from './DeliveryFeeNote'
import { formatMoney, formatSupplyDate, formatTime } from './format'

const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 3 })

interface Props {
  confirmation: Confirmation
  contactPhone: string | null
  onClose: () => void
}

/** Shown after the order is saved: the summary of what was ordered. */
export function SuccessDialog({ confirmation, contactPhone, onClose }: Props) {
  const { t } = useTranslation()
  // Each dish with allergens once, with what the business wrote about it.
  const allergens = [...new Map(confirmation.items.filter((i) => i.allergenInfo).map((i) => [i.dishName, i.allergenInfo as string])).entries()]
  return (
    <Modal title={t('order.success.title')} onClose={onClose}>
      <p>{t('order.success.number', { id: confirmation.id })}</p>
      <p>
        {formatSupplyDate(confirmation.supplyDate, t)} ·{' '}
        {confirmation.deliveryHour && <>{t('order.success.hour', { hour: formatTime(confirmation.deliveryHour) })} · </>}
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
      {allergens.length > 0 && (
        <div className="notice notice--warning" role="note">
          <strong>{t('order.success.allergensTitle')}</strong>
          <ul>
            {allergens.map(([name, info]) => (
              <li key={name}>
                {name}: {info}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!confirmation.minimumTopUp && (
        <p className="summary__total">
          {t('order.minimumTopUp')}: <strong className="numeric">{formatMoney(confirmation.minimumTopUp)}</strong>
        </p>
      )}
      {(!!confirmation.deliveryFee || !!confirmation.deliveryDiscount) && (
        <p className="summary__total">
          {t('order.deliveryFee')}:{' '}
          <strong className="numeric">{confirmation.deliveryFee ? formatMoney(confirmation.deliveryFee) : t('order.deliveryDiscount.freePrice')}</strong>
          <DeliveryFeeNote discount={confirmation.deliveryDiscount} free={!confirmation.deliveryFee} />
        </p>
      )}
      <p className="summary__total">
        {t('order.total')}: <strong className="numeric">{formatMoney(confirmation.total)}</strong>
      </p>
      {isTransfer(confirmation.paymentMethod) && confirmation.paymentPhone ? (
        <TransferPay
          method={confirmation.paymentMethod}
          phone={confirmation.paymentPhone}
          total={confirmation.total}
          link={confirmation.paymentLink}
        />
      ) : (
        <p>{t('order.payOnDeliveryNote')}</p>
      )}
      {confirmation.hourFull && (
        <p role="status" className="notice notice--warning">
          {t('order.success.hourFull')}
        </p>
      )}
      {confirmation.needsReview && (
        <p role="status" className="notice notice--warning">
          {t('order.success.needsReview')}
        </p>
      )}
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
