import { useState } from 'react'
import { paymentKey } from '../../order/payment'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ordersAdminApi, orderStatuses, type AdminOrder, type OrderStatus } from '../../api/operations'
import { formatMoney, formatTime } from '../../order/format'
import { formatNumber } from '../format'
import { useErrorMessage } from '../hooks'
import { Status } from '../ui'
import { CancelForm } from './CancelForm'
import { OrderEditor } from './OrderEditor'
import { PaidForm } from './PaidForm'
import { SendMessage } from './SendMessage'
import { usePrintOrders } from './usePrintOrders'
import { ItemAnswers } from '../../components/ItemAnswers'

/** `compact` leaves out the header and dish list, for the order page that shows them in its own way. */
export function OrderCard({ order, onChange, compact = false }: { order: AdminOrder; onChange: (order: AdminOrder) => void; compact?: boolean }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [editing, setEditing] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [messaging, setMessaging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const printer = usePrintOrders()

  /** Shows the change at once and undoes it when saving fails. */
  async function apply(change: Partial<AdminOrder>, save: () => Promise<void>) {
    setError(null)
    onChange({ ...order, ...change })
    try {
      await save()
    } catch (err) {
      onChange(order)
      setError(errorMessage(err))
    }
  }

  const setStatus = (status: OrderStatus) => apply({ status, cancelReason: null, cancelledAt: null }, () => ordersAdminApi.setStatus(order.id, status))
  const unpay = () =>
    apply({ isPaid: false, paidWith: null, paymentComment: null }, () => ordersAdminApi.setPaid(order.id, { isPaid: false }))

  /** Ticking opens the form that asks how it was paid; unticking a paid order clears it at once. */
  function togglePaid(checked: boolean) {
    setError(null)
    if (checked) setMarkingPaid(true)
    else if (markingPaid) setMarkingPaid(false)
    else void unpay()
  }
  const cancelled = order.status === 'Cancelled'

  return (
    <article className={`order-card${cancelled ? ' order-card--cancelled' : ''}`} aria-label={t('admin.orders.orderN', { id: order.id })}>
      {!compact && (
        <>
      <header className="row row--between">
        <h4>
          {t('admin.orders.orderN', { id: order.id })} · {order.name}
        </h4>
        <span className="numeric">{formatMoney(order.total)}</span>
      </header>
      <p className="muted">
        <a href={`tel:${order.phone}`}>{order.phone}</a>
        {' · '}
        {order.deliveryHour && <>{t('admin.orders.hourAt', { hour: formatTime(order.deliveryHour) })} · </>}
        {t(order.fulfillmentMethod === 'Delivery' ? 'admin.orders.delivery' : 'admin.orders.pickup')}
        {order.fulfillmentMethod === 'Delivery' && order.address ? `: ${order.address}` : ''}
        {' · '}
        {t(paymentKey(order.paymentMethod))}
        {order.isGuest && <span className="badge">{t('admin.orders.guest')}</span>}
      </p>
        </>
      )}
      {order.hourFull && (
        <p role="status" className="notice notice--warning">
          {t('admin.orders.hourFull')}
        </p>
      )}
      {order.needsReview && (
        <p role="status" className="notice notice--warning">
          {t('admin.orders.needsReview')}{' '}
          <button
            type="button"
            onClick={() => void apply({ needsReview: false }, () => ordersAdminApi.approve(order.id))}
          >
            {t('admin.orders.approve')}
            <span className="visually-hidden"> {t('admin.orders.orderN', { id: order.id })}</span>
          </button>
        </p>
      )}

      {!compact && (
      <ul className="list">
        {order.items.map((item) => (
          <li key={item.id} className="list__row">
            <span>
              {item.parentItemId !== null && <span aria-hidden="true">+ </span>}
              {formatNumber(item.quantity)} × {item.dishName}
              {item.optionLabel ? ` (${item.optionLabel})` : ''}
              {item.note ? ` · ${item.note}` : ''}
              <ItemAnswers answers={item.answers} />
            </span>
            <span className="numeric">{formatMoney(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      )}
      {order.isPaid && order.paidWith && (
        <p className="muted">
          {t('admin.orders.paidVia', { method: t(`admin.orders.paidMethods.${order.paidWith}`) })}
          {order.paymentComment ? ` · ${order.paymentComment}` : ''}
          {order.paidByDriver ? ` · ${t('admin.orders.paidByDriver')}` : ''}
        </p>
      )}
      {order.delivery && <DeliveryReport order={order} />}
      {!compact && order.notes && (
        <p>
          {t('admin.orders.notes')}: {order.notes}
        </p>
      )}

      <div className="row no-print">
        <span className="field field--narrow">
          <label htmlFor={`status-${order.id}`}>{t('admin.orders.status')}</label>
          <select id={`status-${order.id}`} value={order.status} onChange={(e) => void setStatus(e.target.value as OrderStatus)}>
            {/* Cancelling goes through the cancel form, which asks why; the list only shows an order already cancelled. */}
            {orderStatuses.filter((status) => status !== 'Cancelled' || cancelled).map((status) => (
              <option key={status} value={status}>
                {t(`admin.orders.statuses.${status}`)}
              </option>
            ))}
          </select>
        </span>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={order.isPaid || markingPaid}
            onChange={(e) => togglePaid(e.target.checked)}
          />
          {t('admin.orders.paid')}
          <span className="visually-hidden"> {t('admin.orders.orderN', { id: order.id })}</span>
        </label>
        <button type="button" className="button-quiet" onClick={() => setEditing(!editing)} aria-expanded={editing}>
          {t('admin.edit')}
          <span className="visually-hidden"> {t('admin.orders.orderN', { id: order.id })}</span>
        </button>
        {!compact && (
          <Link className="button-quiet" to={`/admin/orders/${order.id}`}>
            {t('admin.orders.viewOrder')}
            <span className="visually-hidden"> {t('admin.orders.orderN', { id: order.id })}</span>
          </Link>
        )}
        {!compact && (
          <button type="button" className="button-quiet" onClick={() => printer.print([order])}>
            {t('admin.orders.printOrder')}
            <span className="visually-hidden"> {t('admin.orders.orderN', { id: order.id })}</span>
          </button>
        )}
        {printer.sheet}
        <button type="button" className="button-quiet" onClick={() => setMessaging(!messaging)} aria-expanded={messaging}>
          {t('admin.messages.send')}
          <span className="visually-hidden"> {t('admin.orders.orderN', { id: order.id })}</span>
        </button>
        {!cancelled && (
          <button type="button" className="button-quiet" onClick={() => setCancelling(!cancelling)} aria-expanded={cancelling}>
            {t('admin.orders.cancelOrder')}
            <span className="visually-hidden"> {t('admin.orders.orderN', { id: order.id })}</span>
          </button>
        )}
      </div>
      {error && <Status message={error} error />}

      {cancelling && !cancelled && (
        <CancelForm
          order={order}
          onClose={() => setCancelling(false)}
          onSaved={(change) => {
            onChange({ ...order, ...change })
            setCancelling(false)
          }}
        />
      )}

      {cancelled && order.cancelReason && (
        <p className="muted">
          {t('admin.orders.cancelReason')}: {order.cancelReason}
        </p>
      )}

      {markingPaid && !order.isPaid && (
        <PaidForm
          order={order}
          onClose={() => setMarkingPaid(false)}
          onSaved={(change) => {
            onChange({ ...order, ...change })
            setMarkingPaid(false)
          }}
        />
      )}

      {messaging && <SendMessage order={order} onClose={() => setMessaging(false)} />}

      {editing && (
        <OrderEditor
          order={order}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            onChange(saved)
            setEditing(false)
          }}
        />
      )}
    </article>
  )
}

/** What the driver reported through the driver's link: when, the note, and the photo from the door. */
function DeliveryReport({ order }: { order: AdminOrder }) {
  const { t } = useTranslation()
  const report = order.delivery!
  const time = report.reportedAt ? new Date(report.reportedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className="order-delivery stack" role="group" aria-label={t('admin.orders.deliveryReport')}>
      {report.outcome && (
        <p className={report.outcome === 'Delivered' ? 'driver-badge--ok' : 'notice notice--warning'}>
          {t(report.outcome === 'Delivered' ? 'admin.orders.deliveredAt' : 'admin.orders.notDeliveredAt', { time })}
          {report.note ? ` · ${t('admin.orders.driverNote')}: ${report.note}` : ''}
        </p>
      )}
      {report.proofUrl && (
        <a href={report.proofUrl} target="_blank" rel="noreferrer">
          <img className="order-delivery__proof" src={report.proofUrl} alt={t('admin.orders.proofAlt', { id: order.id })} />
        </a>
      )}
    </div>
  )
}
