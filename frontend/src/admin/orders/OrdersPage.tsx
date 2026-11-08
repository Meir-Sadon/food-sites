import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ordersAdminApi, orderStatuses, type AdminOrder, type OrderStatus } from '../../api/operations'
import { formatDate } from '../format'
import { Loading } from '../ui'
import { CookingSummary } from './CookingSummary'
import { OrderCard } from './OrderCard'
import { usePrintOrders } from './usePrintOrders'

const today = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Finished orders (delivered, cancelled) start hidden; the admin ticks them to see them. */
const defaultStatuses: OrderStatus[] = ['New', 'Confirmed', 'Ready']

/** Orders grouped by supply day, with a printable cooking summary for each day. */
export function OrdersPage() {
  const { t } = useTranslation()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState('')
  const [statuses, setStatuses] = useState<OrderStatus[]>(defaultStatuses)
  /** Orders the admin changed stay on screen even when their new status is hidden, until the list reloads. */
  const [touched, setTouched] = useState<number[]>([])
  const [loaded, setOrders] = useState<AdminOrder[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [summaryDate, setSummaryDate] = useState<string | null>(null)
  const printer = usePrintOrders()

  useEffect(() => {
    let current = true
    ordersAdminApi
      .list({ from, to })
      .then((result) => {
        if (!current) return
        setOrders(result)
        setTouched([])
        setFailed(false)
      })
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [from, to])

  const replace = (order: AdminOrder) => {
    setTouched((ids) => [...ids, order.id])
    setOrders((list) => {
      if (!list) return list
      return list.map((o) => (o.id === order.id ? order : o))
    })
  }

  const orders = loaded && loaded.filter((o) => statuses.includes(o.status) || touched.includes(o.id))
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
        <fieldset className="field">
          <legend>{t('admin.orders.statusFilter')}</legend>
          <span className="row">
            {orderStatuses.map((s) => (
              <label key={s} className="checkbox">
                <input
                  type="checkbox"
                  checked={statuses.includes(s)}
                  onChange={(e) => setStatuses((list) => (e.target.checked ? orderStatuses.filter((x) => x === s || list.includes(x)) : list.filter((x) => x !== s)))}
                />
                {t(`admin.orders.statuses.${s}`)}
              </label>
            ))}
          </span>
        </fieldset>
      </form>

      {orders && orders.length > 0 && (
        <p className="row no-print">
          <button type="button" onClick={() => printer.print(orders)}>
            {t('admin.orders.printAll')}
          </button>
          <span className="hint">{t('admin.orders.printHint')}</span>
        </p>
      )}
      {printer.sheet}

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
                  <span className="row no-print">
                    <button type="button" className="button-quiet" aria-expanded={open} onClick={() => setSummaryDate(open ? null : date)}>
                      {t('admin.orders.cookingSummary')}
                      <span className="visually-hidden"> {formatDate(date)}</span>
                    </button>
                    <button type="button" className="button-quiet" onClick={() => printer.print(ofDay)}>
                      {t('admin.orders.printDay')}
                      <span className="visually-hidden"> {formatDate(date)}</span>
                    </button>
                    {ofDay.some((o) => o.fulfillmentMethod === 'Delivery' && o.status !== 'Cancelled') && (
                      <Link className="button-quiet" to={`/admin/orders/route?date=${date}`}>
                        {t('admin.route.open')}
                        <span className="visually-hidden"> {formatDate(date)}</span>
                      </Link>
                    )}
                  </span>
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
