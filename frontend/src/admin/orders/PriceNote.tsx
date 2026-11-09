import { useTranslation } from 'react-i18next'
import type { AdminOrderItem } from '../../api/operations'
import { formatMoney } from '../../order/format'
import { useFeature } from '../../site/useSite'

/** What a line cost less than its regular price, over all its units. */
export function listSaving(items: AdminOrderItem[]): number {
  return items.reduce((sum, i) => (i.regularUnitPrice && i.regularUnitPrice > i.unitPrice ? sum + (i.regularUnitPrice - i.unitPrice) * i.quantity : sum), 0)
}

/**
 * The price list a line was priced from (always, once the site uses price lists; one that is not the default list is
 * marked) and, when the line cost less than its regular price, both prices.
 */
export function PriceNote({ item }: { item: AdminOrderItem }) {
  const { t } = useTranslation()
  const priceLists = useFeature('priceLists')
  const discounted = !!item.regularUnitPrice && item.regularUnitPrice > item.unitPrice
  if (!item.priceListName && !priceLists && !discounted) return null
  return (
    <>
      {item.priceListName ? (
        <span className="cart-row__unit price-note price-note--list">{t('admin.priceLists.orderLine', { name: item.priceListName })}</span>
      ) : (
        priceLists && <span className="muted cart-row__unit">{t('admin.priceLists.orderLineBase', { name: t('admin.priceLists.defaultName') })}</span>
      )}
      {discounted && (
        <span className="cart-row__unit price-note price-note--discount">
          {t('admin.priceLists.orderDiscount', {
            regular: formatMoney(item.regularUnitPrice!),
            price: formatMoney(item.unitPrice),
            saved: formatMoney((item.regularUnitPrice! - item.unitPrice) * item.quantity),
          })}
        </span>
      )}
    </>
  )
}

