import { useTranslation } from 'react-i18next'
import { formatMoney } from './format'

/** Why a delivery fee is not the regular one: shown beside the fee of an order that got the large-order discount. */
export function DeliveryFeeNote({ discount, free }: { discount?: number; free: boolean }) {
  const { t } = useTranslation()
  if (!discount || discount <= 0) return null
  return (
    <small className="delivery-note">
      {free ? t('order.deliveryDiscount.free') : t('order.deliveryDiscount.partial', { amount: formatMoney(discount) })}
    </small>
  )
}
