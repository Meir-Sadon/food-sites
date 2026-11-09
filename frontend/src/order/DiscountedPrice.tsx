import { useTranslation } from 'react-i18next'
import { formatMoney } from './format'

/** A price with the price before the discount struck through beside it, when there was a discount. */
export function DiscountedPrice({ before, price, free }: { before: number | null | undefined; price: number; free?: boolean }) {
  const { t } = useTranslation()
  const shown = free ? t('order.deliveryDiscount.freePrice') : formatMoney(price)
  if (!before || before <= price) return <>{shown}</>
  return (
    <>
      <del className="dish__price-before">
        <span className="visually-hidden">{t('order.priceBeforeDiscount')} </span>
        {formatMoney(before)}
      </del>{' '}
      {shown}
    </>
  )
}

/** The delivery fee paid, after the regular fee struck through when the large-order discount took off some of it. */
export function DeliveryFeePrice({ fee, discount }: { fee: number; discount?: number }) {
  return <DiscountedPrice before={discount ? fee + discount : null} price={fee} free={fee <= 0 && !!discount} />
}

/** What an order saved in all: the lines that cost less than their regular price, and the delivery discount. */
export function orderSaving(items: { quantity: number; unitPrice: number; regularUnitPrice?: number | null }[], deliveryDiscount = 0): number {
  return (
    items.reduce((sum, i) => (i.regularUnitPrice && i.regularUnitPrice > i.unitPrice ? sum + (i.regularUnitPrice - i.unitPrice) * i.quantity : sum), 0) +
    deliveryDiscount
  )
}
