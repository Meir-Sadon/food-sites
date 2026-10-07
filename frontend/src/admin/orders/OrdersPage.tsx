import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ordersAdminApi, orderStatuses, type AdminOrder, type OrderStatus } from '../../api/operations'
import { formatDate } from '../format'
import { Loading } from '../ui'
import { CookingSummary } from './CookingSummary'
import { OrderCard } from './OrderCard'

const today = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Orders grouped by supply day, with a printable cooking summary for each day. */
export function OrdersPage() {
  const { t } = useTranslation()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [summaryDate, setSummaryDate] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    ordersAdminApi
      .list({ from, to, status })
      .then((result) => {
        if (!current) return
        setOrders(result)
        setFailed(false)
      })
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [from, to, status])

  const replace = (order: AdminOrder) =>
    setOrders((list) => {
      if (!list) return list
      const next = list.map((o) => (o.id === order.id ? order : o))
      return status && order.status !== status ? next.filter((o) => o.id !== order.id) : next
    })

  const days = [...new Set((orders ?? []).map((o) => o.supplyDate))]

  return (
    <>
      <h1 className="no-print">{t('admin.orders.title')}</h1>

      <form className="row row--end no-print" onSubmit={(e) => e.preventDefault()} aria-label={t('admin.orders.filters')}>
        <span className="field field--narrow">
          <label htmlFor="orders-from">{t('admin.orders.from')}</label>
          <input id="orders-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </span>
        <span className="field field--narrow">
          <label htmlFor="orders-to">{t('admin.orders.to')}</label>
          <input id="orders-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </span>
        <span className="field field--narrow">
          <label htmlFor="orders-status">{t('admin.orders.statusFilter')}</label>
          <select id="orders-status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
            <option value="">{t('admin.orders.allStatuses')}</option>
            {orderStatuses.map((s) => (
              <option key={s} value={s}>
                {t(`admin.orders.statuses.${s}`)}
              </option>
            ))}
          </select>
        </span>
      </form>

      {!orders ? (
        <Loading failed={failed} />
      ) : (
        <>
          {failed && <Loading failed />}
          {days.length === 0 && <p>{t('admin.orders.empty')}</p>}
          {days.map((date) => {
            const ofDay = orders.filter((o) => o.supplyDate === date)
            const open = summaryDate === date
            return (
              <section key={date} className="admin-section" aria-labelledby={`day-${date}`}>
                <div className="row row--between">
                  <h2 id={`day-${date}`}>
                    {formatDate(date)} <span className="muted">({t('admin.orders.dayCount', { count: ofDay.length })})</span>
                  </h2>
                  <button type="button" className="button-quiet no-print" aria-expanded={open} onClick={() => setSummaryDate(open ? null : date)}>
                    {t('admin.orders.cookingSummary')}
                    <span className="visually-hidden"> {formatDate(date)}</span>
                  </button>
                </div>
                {open && <CookingSummary date={date} />}
                <div className="stack">
                  {ofDay.map((order) => (
                    <OrderCard key={order.id} order={order} onChange={replace} />
                  ))}
                </div>
              </section>
            )
          })}
        </>
      )}
    </>
  )
}
