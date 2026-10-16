import { useTranslation } from 'react-i18next'
import { paymentKey } from '../../order/payment'
import type { AdminOrder } from '../../api/operations'
import { formatMoney, formatTime } from '../../order/format'
import { formatDate, formatNumber } from '../format'
import { orderLines } from './report'

export function PrintSheet({ orders }: { orders: AdminOrder[] }) {
  return (
    <div className="print-sheet" dir="rtl">
      {orders.map((order) => (
        <PrintedOrder key={order.id} order={order} />
      ))}
    </div>
  )
}

function PrintedOrder({ order }: { order: AdminOrder }) {
  const { t } = useTranslation()
  const delivery = order.fulfillmentMethod === 'Delivery'
  const paid = order.isPaid
    ? t('admin.orders.report.paidWith', { method: t(`admin.orders.paidMethods.${order.paidWith ?? 'Unknown'}`) })
    : t('admin.orders.report.unpaid')

  return (
    <article className="print-order">
      <header className="print-order__head">
        <h1>{t('admin.orders.sheet.order', { id: order.id })}</h1>
        <p className="print-order__name">{order.name}</p>
        {order.status === 'Cancelled' && <p className="print-order__cancelled">{t('admin.orders.sheet.cancelled')}</p>}
      </header>

      <dl className="print-order__facts">
        <div>
          <dt>{t('admin.orders.sheet.customer')}</dt>
          <dd>{order.name}</dd>
          <dd className="numeric" dir="ltr">{order.phone}</dd>
        </div>
        <div>
          <dt>{t('admin.orders.sheet.when')}</dt>
          <dd>
            {formatDate(order.supplyDate)}
            {order.deliveryHour ? ` · ${formatTime(order.deliveryHour)}` : ''}
          </dd>
          <dd>{t(delivery ? 'admin.orders.delivery' : 'admin.orders.pickup')}</dd>
        </div>
        {delivery && order.address && (
          <div>
            <dt>{t('admin.orders.sheet.where')}</dt>
            <dd>{order.address}</dd>
          </div>
        )}
        <div>
          <dt>{t('admin.orders.sheet.payment')}</dt>
          <dd>{t(paymentKey(order.paymentMethod))}</dd>
          <dd>{paid}</dd>
        </div>
      </dl>

      {order.notes && (
        <p className="print-order__notes">
          <strong>{t('admin.orders.sheet.notes')}:</strong> {order.notes}
        </p>
      )}

      <h2>{t('admin.orders.sheet.dishes')}</h2>
      <table className="print-order__dishes">
        <tbody>
          {orderLines(order).map(({ item, addOns }) => (
            <tr key={item.id}>
              <td className="print-order__qty numeric">{formatNumber(item.quantity)} ×</td>
              <td>
                <strong>{item.dishName}</strong>
                {item.optionLabel ? ` (${item.optionLabel})` : ''}
                {(item.note || item.answers?.length || addOns.length > 0) && (
                  <ul className="print-order__extras" aria-label={t('admin.orders.sheet.instructions')}>
                    {item.note && <li>{t('admin.orders.report.note')}: {item.note}</li>}
                    {(item.answers ?? []).map((a, i) => (
                      <li key={i}>
                        {a.question}: <strong>{a.answer}</strong>
                      </li>
                    ))}
                    {addOns.map((addOn) => (
                      <li key={addOn.id}>
                        + {formatNumber(addOn.quantity)} × {addOn.dishName}
                        {addOn.optionLabel ? ` (${addOn.optionLabel})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="numeric">{formatMoney(item.lineTotal + addOns.reduce((sum, a) => sum + a.lineTotal, 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!!order.deliveryFee && (
        <p className="print-order__fee">
          {t('order.deliveryFee')}
          {order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ''}: <strong className="numeric">{formatMoney(order.deliveryFee)}</strong>
        </p>
      )}
      <p className="print-order__total">
        {t('admin.orders.view.total')}: <strong className="numeric">{formatMoney(order.total)}</strong>
      </p>
    </article>
  )
}
