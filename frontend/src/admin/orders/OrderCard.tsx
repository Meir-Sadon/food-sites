import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ordersAdminApi, orderStatuses, type AdminOrder, type OrderStatus } from '../../api/operations'
import { formatMoney } from '../../order/format'
import { formatNumber } from '../format'
import { useErrorMessage } from '../hooks'
import { ConfirmRemove, Status } from '../ui'
import { OrderEditor } from './OrderEditor'
import { PaidForm } from './PaidForm'
import { SendMessage } from './SendMessage'

export function OrderCard({ order, onChange }: { order: AdminOrder; onChange: (order: AdminOrder) => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [editing, setEditing] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [messaging, setMessaging] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const setStatus = (status: OrderStatus) => apply({ status }, () => ordersAdminApi.setStatus(order.id, status))
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
      <header className="row row--between">
        <h4>
          {t('admin.orders.orderN', { id: order.id })} · {order.name}
        </h4>
        <span className="numeric">{formatMoney(order.total)}</span>
      </header>
      <p className="muted">
        <a href={`tel:${order.phone}`}>{order.phone}</a>
        {' · '}
        {t(order.fulfillmentMethod === 'Delivery' ? 'admin.orders.delivery' : 'admin.orders.pickup')}
        {order.fulfillmentMethod === 'Delivery' && order.address ? `: ${order.address}` : ''}
        {' · '}
        {t(order.paymentMethod === 'Transfer' ? 'admin.orders.transfer' : 'admin.orders.onDelivery')}
        {order.isGuest && <span className="badge">{t('admin.orders.guest')}</span>}
      </p>
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

      <ul className="list">
        {order.items.map((item) => (
          <li key={item.id} className="list__row">
            <span>
              {item.parentItemId !== null && <span aria-hidden="true">+ </span>}
              {formatNumber(item.quantity)} × {item.dishName}
              {item.optionLabel ? ` (${item.optionLabel})` : ''}
            </span>
            <span className="numeric">{formatMoney(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      {order.isPaid && order.paidWith && (
        <p className="muted">
          {t('admin.orders.paidVia', { method: t(`admin.orders.paidMethods.${order.paidWith}`) })}
          {order.paymentComment ? ` · ${order.paymentComment}` : ''}
        </p>
      )}
      {order.notes && (
        <p>
          {t('admin.orders.notes')}: {order.notes}
        </p>
      )}

      <div className="row no-print">
        <span className="field field--narrow">
          <label htmlFor={`status-${order.id}`}>{t('admin.orders.status')}</label>
          <select id={`status-${order.id}`} value={order.status} onChange={(e) => void setStatus(e.target.value as OrderStatus)}>
            {orderStatuses.map((status) => (
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
        <button type="button" className="button-quiet" onClick={() => setMessaging(!messaging)} aria-expanded={messaging}>
          {t('admin.messages.send')}
          <span className="visually-hidden"> {t('admin.orders.orderN', { id: order.id })}</span>
        </button>
        {!cancelled && (
          <ConfirmRemove
            name={t('admin.orders.orderN', { id: order.id })}
            label={t('admin.orders.cancelOrder')}
            question={t('admin.orders.confirmCancel', { id: order.id })}
            confirmLabel={t('admin.orders.yesCancel')}
            onConfirm={() => setStatus('Cancelled')}
          />
        )}
      </div>
      {error && <Status message={error} error />}

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
