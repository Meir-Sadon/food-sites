import { useEffect, useState } from 'react'
import { paymentKey } from '../../order/payment'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import { ordersAdminApi, type AdminOrder } from '../../api/operations'
import { ItemAnswers } from '../../components/ItemAnswers'
import { DeliveryFeeNote } from '../../order/DeliveryFeeNote'
import { formatMoney, formatTime } from '../../order/format'
import { formatDate, formatNumber } from '../format'
import { whatsAppShareUrl } from '../messages/compose'
import { Loading } from '../ui'
import { OrderCard } from './OrderCard'
import { usePrintOrders } from './usePrintOrders'
import { orderLines, prepReport } from './report'

/**
 * One order the way the client saw it in the basket (each dish with its picture, amount, remark, answers and add-ons,
 * then the total), the details around it, a WhatsApp share of it as a preparation report, and the order's controls.
 * This is where the link in the owner's new-order mail lands.
 */
export function OrderViewPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const [order, setOrder] = useState<AdminOrder | null>(null)
  const printer = usePrintOrders()
  const [state, setState] = useState<'loading' | 'failed' | 'missing'>('loading')

  useEffect(() => {
    let active = true
    ordersAdminApi
      .get(id)
      .then((result) => active && setOrder(result))
      .catch((err) => active && setState(err instanceof ApiError && err.status === 404 ? 'missing' : 'failed'))
    return () => {
      active = false
    }
  }, [id])

  const back = (
    <p className="no-print">
      <Link to="/admin/orders">{t('admin.orders.view.back')}</Link>
    </p>
  )
  if (!order) {
    return (
      <>
        {back}
        {state === 'missing' ? <p role="alert">{t('admin.orders.view.notFound')}</p> : <Loading failed={state === 'failed'} />}
      </>
    )
  }

  const delivery = order.fulfillmentMethod === 'Delivery'
  return (
    <>
      {back}
      <h1>{t('admin.orders.orderN', { id: order.id })}</h1>
      <section className="order-view__facts stack" aria-label={t('admin.orders.view.customer')}>
        <p>
          <strong>{order.name}</strong> · <a href={`tel:${order.phone}`}>{order.phone}</a>
        </p>
        <p>
          {formatDate(order.supplyDate)}
          {order.deliveryHour ? ` · ${t('admin.orders.hourAt', { hour: formatTime(order.deliveryHour) })}` : ''}
          {' · '}
          {t(delivery ? 'admin.orders.delivery' : 'admin.orders.pickup')}
          {delivery && order.address ? `: ${order.address}` : ''}
        </p>
        <p>
          {t(paymentKey(order.paymentMethod))}
          {order.isPaid && order.paidWith ? ` · ${t('admin.orders.paidVia', { method: t(`admin.orders.paidMethods.${order.paidWith}`) })}` : ''}
        </p>
        {order.notes && (
          <p>
            {t('admin.orders.notes')}: {order.notes}
          </p>
        )}
      </section>

      <section className="order-view__basket" aria-label={t('admin.orders.view.basket')}>
        <h2>{t('admin.orders.view.basket')}</h2>
        <ul className="cart-sheet__list">
          {orderLines(order).map(({ item, addOns }) => (
            <li key={item.id} className="cart-row">
              <div className="cart-row__top">
                {item.imageUrl ? (
                  <img className="cart-row__picture" src={item.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className="cart-row__picture cart-row__picture--empty" aria-hidden="true" />
                )}
                <div className="cart-row__text">
                  <span className="cart-row__name">{item.dishName}</span>
                  <span className="muted cart-row__unit">
                    {formatNumber(item.quantity)} × {formatMoney(item.unitPrice)}
                    {item.optionLabel ? ` · ${item.optionLabel}` : ''}
                  </span>
                </div>
                <strong className="cart-row__price numeric">{formatMoney(item.lineTotal)}</strong>
              </div>
              {(item.note || item.answers?.length || addOns.length > 0) && (
                <div className="order-view__extras">
                  {item.note && (
                    <p>
                      <span className="muted">{t('admin.orders.view.noteLabel')}:</span> {item.note}
                    </p>
                  )}
                  <ItemAnswers answers={item.answers} />
                  {addOns.map((addOn) => (
                    <p key={addOn.id}>
                      + {formatNumber(addOn.quantity)} × {addOn.dishName}
                      {addOn.optionLabel ? ` (${addOn.optionLabel})` : ''}
                      {addOn.lineTotal > 0 ? ` · ${formatMoney(addOn.lineTotal)}` : ''}
                    </p>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        {!!order.minimumTopUp && (
          <p className="cart-sheet__total">
            <span>{t('order.minimumTopUp')}</span> <strong className="numeric">{formatMoney(order.minimumTopUp)}</strong>
          </p>
        )}
        {(!!order.deliveryFee || !!order.deliveryDiscount) && (
          <p className="cart-sheet__total">
            <span>
              {t('order.deliveryFee')}
              {order.deliveryZoneName ? ` (${order.deliveryZoneName})` : ''}
              <DeliveryFeeNote discount={order.deliveryDiscount} free={!order.deliveryFee} />
            </span>{' '}
            <strong className="numeric">{order.deliveryFee ? formatMoney(order.deliveryFee) : t('order.deliveryDiscount.freePrice')}</strong>
          </p>
        )}
        <p className="cart-sheet__total">
          <span>{t('admin.orders.view.total')}</span> <strong className="numeric cart-sheet__sum">{formatMoney(order.total)}</strong>
        </p>
      </section>

      <p className="no-print">
        <button type="button" onClick={() => printer.print([order])}>
          {t('admin.orders.printOrder')}
          <span className="visually-hidden"> {t('admin.orders.orderN', { id: order.id })}</span>
        </button>{' '}
        <span className="hint">{t('admin.orders.printHint')}</span>
      </p>
      {printer.sheet}

      <ShareReport key={`${order.id}-${order.status}-${order.isPaid}`} order={order} />

      <section className="admin-section no-print" aria-label={t('admin.orders.view.manage')}>
        <h2>{t('admin.orders.view.manage')}</h2>
        <OrderCard order={order} onChange={setOrder} compact />
      </section>
    </>
  )
}

/** The preparation report as WhatsApp text: the admin may edit it, then WhatsApp opens with it typed in. */
function ShareReport({ order }: { order: AdminOrder }) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => prepReport(order, t))
  return (
    <section className="send-message no-print" aria-label={t('admin.orders.view.shareTitle')}>
      <span className="field">
        <label htmlFor="order-report">{t('admin.orders.view.shareTitle')}</label>
        <textarea id="order-report" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
        <span className="hint">{t('admin.orders.view.shareHint')}</span>
      </span>
      <div className="row">
        <a className="button-link whatsapp-link" href={whatsAppShareUrl(text)} target="_blank" rel="noopener noreferrer">
          {t('admin.orders.view.share')}
        </a>
      </div>
    </section>
  )
}
