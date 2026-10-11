import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { driverLinksApi, driverUrl, type DriverLink } from '../../api/driver'
import { ordersAdminApi, type AdminOrder } from '../../api/operations'
import { contactsApi } from '../../api/site'
import { formatMoney } from '../../order/format'
import { formatDate, formatNumber } from '../format'
import { useLoad } from '../hooks'
import { Loading, MoveButtons } from '../ui'
import { DriverLinks } from './DriverLinks'
import {
  defaultEstimate,
  formatMinutes,
  navigationAddress,
  routeOrder,
  schedule,
  toMinutes,
  wazeUrl,
  type Stop,
  type TravelEstimate,
} from './plan'

const today = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The deliveries a driver takes on a supply day. */
const isDelivery = (o: AdminOrder) => o.fulfillmentMethod === 'Delivery' && o.status !== 'Cancelled'

/**
 * The driver's report for one supply day: the admin picks all or some deliveries, and gets them in a
 * suggested driving order with when to leave for each, a Waze link, what to hand over and what to collect.
 * The order can be changed by hand; the page prints, and can be sent to the driver on WhatsApp.
 */
export function RoutePage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const date = params.get('date') || today()
  const { data: contact } = useLoad(contactsApi.get)
  const kitchen = contact?.address?.trim() || null

  // The day's deliveries, kept with the date they are for so another date shows loading until it is in.
  const [loaded, setLoaded] = useState<{ date: string; orders: AdminOrder[] } | null>(null)
  const orders = loaded?.date === date ? loaded.orders : null
  const [failed, setFailed] = useState(false)
  const [excluded, setExcluded] = useState<number[]>([])
  const [estimate, setEstimate] = useState<TravelEstimate>(defaultEstimate)
  const [start, setStart] = useState('')
  // The driving order once the admin moved a stop; null follows the suggested order.
  const [manual, setManual] = useState<number[] | null>(null)
  // The day's driver links, newest first, kept with their date like the orders.
  const [links, setLinks] = useState<{ date: string; links: DriverLink[] } | null>(null)

  useEffect(() => {
    let current = true
    ordersAdminApi
      .list({ from: date, to: date })
      .then((result) => {
        if (!current) return
        setLoaded({ date, orders: result.filter(isDelivery) })
        setFailed(false)
      })
      .catch(() => current && setFailed(true))
    driverLinksApi
      .list(date)
      .then((result) => current && setLinks({ date, links: result }))
      .catch(() => current && setLinks({ date, links: [] }))
    return () => {
      current = false
    }
  }, [date])

  const chosen = useMemo(() => (orders ?? []).filter((o) => !excluded.includes(o.id)), [orders, excluded])
  const suggested = useMemo(() => routeOrder(chosen, kitchen, estimate), [chosen, kitchen, estimate])
  const route = useMemo(() => {
    if (!manual) return suggested
    // Stops the admin added since moving one go last, in the suggested order.
    const byId = new Map(chosen.map((o) => [o.id, o]))
    const kept = manual.flatMap((id) => byId.get(id) ?? [])
    return [...kept, ...suggested.filter((o) => !manual.includes(o.id))]
  }, [manual, suggested, chosen])
  const stops = schedule(route, kitchen, estimate, start ? toMinutes(start) : null)
  const apartmentPrefix = t('address.apartmentShort', { apartment: '' }).trim()
  const dayLinks = links?.date === date ? links.links : []
  // The message to the driver carries the newest link while it still has this route's stops.
  const sharedLink = dayLinks[0]?.orderIds.join(',') === stops.map((s) => s.order.id).join(',') ? dayLinks[0] : undefined

  function changeDate(value: string) {
    if (!value) return
    setParams({ date: value })
    setExcluded([])
    setManual(null)
  }

  function toggle(id: number, on: boolean) {
    setExcluded((current) => (on ? current.filter((x) => x !== id) : [...current, id]))
  }

  function move(index: number, direction: 'Up' | 'Down') {
    const ids = route.map((o) => o.id)
    const target = direction === 'Up' ? index - 1 : index + 1
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setManual(ids)
  }

  const minutesField = (field: keyof TravelEstimate, label: string) => (
    <span className="field field--narrow">
      <label htmlFor={`route-${field}`}>{label}</label>
      <input
        id={`route-${field}`}
        type="number"
        inputMode="numeric"
        min={0}
        max={240}
        dir="ltr"
        className="input-narrow"
        value={estimate[field]}
        onChange={(e) => setEstimate({ ...estimate, [field]: Math.max(0, Number(e.target.value) || 0) })}
      />
    </span>
  )

  return (
    <div className="route-page">
      <h1>{t('admin.route.titleFor', { date: formatDate(date) })}</h1>

      <form className="row row--end no-print" onSubmit={(e) => e.preventDefault()} aria-label={t('admin.route.options')}>
        <span className="field field--narrow">
          <label htmlFor="route-date">{t('admin.route.date')}</label>
          <input id="route-date" type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
        </span>
        <span className="field field--narrow">
          <label htmlFor="route-start">{t('admin.route.start')}</label>
          <input id="route-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </span>
        {minutesField('sameCity', t('admin.route.sameCity'))}
        {minutesField('otherCity', t('admin.route.otherCity'))}
        {minutesField('atStop', t('admin.route.atStop'))}
      </form>
      <p className="hint no-print">{t('admin.route.estimateHint', { kitchen: kitchen ?? t('admin.route.noKitchen') })}</p>

      {!orders ? (
        <Loading failed={failed} />
      ) : orders.length === 0 ? (
        <p>{t('admin.route.empty')}</p>
      ) : (
        <>
          <details className="route-choose no-print">
            <summary>{t('admin.route.choose', { chosen: chosen.length, count: orders.length })}</summary>
            <div className="row">
              <button type="button" className="button-quiet" onClick={() => setExcluded([])}>
                {t('admin.route.chooseAll')}
              </button>
              <button type="button" className="button-quiet" onClick={() => setExcluded(orders.map((o) => o.id))}>
                {t('admin.route.chooseNone')}
              </button>
            </div>
            <ul className="list">
              {orders.map((o) => (
                <li key={o.id}>
                  <label className="checkbox">
                    <input type="checkbox" checked={!excluded.includes(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />
                    {t('admin.orders.orderN', { id: o.id })} · {o.name} · {o.address}
                  </label>
                </li>
              ))}
            </ul>
          </details>

          <div className="row no-print">
            <button type="button" onClick={() => window.print()}>
              {t('admin.route.print')}
            </button>
            {stops.length > 0 && (
              <a className="button-quiet" href={shareUrl(stops, date, apartmentPrefix, t, sharedLink)} target="_blank" rel="noreferrer">
                {t('admin.route.share')}
              </a>
            )}
            {manual && (
              <button type="button" className="button-quiet" onClick={() => setManual(null)}>
                {t('admin.route.resetOrder')}
              </button>
            )}
          </div>

          <DriverLinks date={date} stops={stops} links={dayLinks} onChange={(next) => setLinks({ date, links: next })} />

          {stops.length > 0 && (
            <p className="route-summary">
              {t('admin.route.summary', {
                count: stops.length,
                leave: formatMinutes(stops[0].leave),
                end: formatMinutes(stops[stops.length - 1].arrive + estimate.atStop),
                collect: formatMoney(stops.filter((s) => !s.order.isPaid).reduce((sum, s) => sum + s.order.total, 0)),
              })}
            </p>
          )}

          <ol className="route-stops">
            {stops.map((stop, index) => (
              <StopCard
                key={stop.order.id}
                stop={stop}
                index={index}
                count={stops.length}
                apartmentPrefix={apartmentPrefix}
                onMove={(direction) => move(index, direction)}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

function StopCard({
  stop,
  index,
  count,
  apartmentPrefix,
  onMove,
}: {
  stop: Stop
  index: number
  count: number
  apartmentPrefix: string
  onMove: (direction: 'Up' | 'Down') => void
}) {
  const { t } = useTranslation()
  const { order } = stop
  const name = t('admin.orders.orderN', { id: order.id })
  return (
    <li className="route-stop" aria-label={t('admin.route.stopN', { n: index + 1, name })}>
      <header className="row row--between">
        <h2 className="route-stop__title">
          <span className="route-stop__number">{index + 1}</span> {name} · {order.name}
        </h2>
        <DeliveryState order={order} />
        <span className="no-print">
          <MoveButtons name={name} first={index === 0} last={index === count - 1} onMove={onMove} />
        </span>
      </header>

      <p className="route-stop__times">
        <strong>{t('admin.route.leaveAt', { time: formatMinutes(stop.leave) })}</strong>
        {' · '}
        {t('admin.route.arriveAt', { time: formatMinutes(stop.arrive), minutes: stop.travel })}
        {' · '}
        {stop.windowFrom !== null
          ? t('admin.route.asked', { from: formatMinutes(stop.windowFrom), to: formatMinutes(stop.windowFrom + 60) })
          : t('admin.route.noHour')}
      </p>
      {stop.late && (
        <p role="status" className="notice notice--warning">
          {t('admin.route.late')}
        </p>
      )}

      <p>
        {order.address}
        <br />
        <a href={`tel:${order.phone}`} dir="ltr">
          {order.phone}
        </a>
      </p>
      <p className="row no-print">
        <a className="button-link" href={wazeUrl(navigationAddress(order.address, apartmentPrefix))} target="_blank" rel="noreferrer">
          {t('admin.route.waze')}
          <span className="visually-hidden"> {name}</span>
        </a>
        <a className="button-quiet" href={`tel:${order.phone}`}>
          {t('admin.route.call')}
          <span className="visually-hidden"> {order.name}</span>
        </a>
      </p>

      <ul className="list">
        {order.items.map((item) => (
          <li key={item.id}>
            {item.parentItemId !== null && <span aria-hidden="true">+ </span>}
            {formatNumber(item.quantity)} × {item.dishName}
            {item.optionLabel ? ` (${item.optionLabel})` : ''}
          </li>
        ))}
      </ul>

      <p className={order.isPaid ? 'muted' : 'route-stop__collect'}>
        {order.isPaid
          ? t('admin.route.paid')
          : t(order.paymentMethod === 'Transfer' ? 'admin.route.collectTransfer' : 'admin.route.collect', {
              total: formatMoney(order.total),
            })}
      </p>
      {order.notes && (
        <p>
          {t('admin.orders.notes')}: {order.notes}
        </p>
      )}
    </li>
  )
}

/** What the driver reported for this stop, through the driver's link. */
function DeliveryState({ order }: { order: AdminOrder }) {
  const { t } = useTranslation()
  const report = order.delivery
  if (!report?.outcome || !report.reportedAt) return null
  const time = new Date(report.reportedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  return report.outcome === 'Delivered' ? (
    <span className="badge driver-badge driver-badge--ok">{t('admin.route.delivered', { time })}</span>
  ) : (
    <span className="badge driver-badge driver-badge--warn">{t('admin.route.notDelivered', { time })}</span>
  )
}

/**
 * The route as one WhatsApp message the admin sends the driver: every stop with its times and Waze link, and with
 * a driver link, the link to all the stops and to each stop's page for its report.
 */
function shareUrl(stops: Stop[], date: string, apartmentPrefix: string, t: TFunction, link?: DriverLink) {
  const lines = [t('admin.route.titleFor', { date: formatDate(date) })]
  if (link) lines.push(t('admin.route.linkLine', { url: driverUrl(link.token) }))
  stops.forEach((stop, index) => {
    const { order } = stop
    lines.push(
      '',
      `${index + 1}. ${t('admin.route.leaveAt', { time: formatMinutes(stop.leave) })} · ${t('admin.orders.orderN', { id: order.id })} · ${order.name} · ${order.phone}`,
      order.address,
      stop.windowFrom !== null
        ? t('admin.route.asked', { from: formatMinutes(stop.windowFrom), to: formatMinutes(stop.windowFrom + 60) })
        : t('admin.route.noHour'),
      order.isPaid
        ? t('admin.route.paid')
        : t(order.paymentMethod === 'Transfer' ? 'admin.route.collectTransfer' : 'admin.route.collect', { total: formatMoney(order.total) }),
      ...(order.notes ? [`${t('admin.orders.notes')}: ${order.notes}`] : []),
      wazeUrl(navigationAddress(order.address, apartmentPrefix)),
      ...(link ? [t('admin.route.driverPage', { url: driverUrl(link.token, order.id) })] : []),
    )
  })
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`
}
