import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client'
import { driverApi, type DriverRoute, type DriverStop } from '../api/driver'
import { Loading } from '../admin/ui'
import { formatDate } from '../admin/format'
import { formatMinutes, navigationAddress, toMinutes, wazeUrl } from '../admin/route/plan'
import { formatMoney, formatTime } from '../order/format'
import { siteLogo } from '../site/config'
import { isOpen, toCollect, useDriver, type DriverContext } from './stops'

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'notFound' } | { kind: 'ready'; route: DriverRoute }

/**
 * The driver's page behind the link the admin sent (`/d/<token>`): the day's stops in the admin's order, and
 * a page for each stop (`/d/<token>/<orderId>`) with the order and the report. No login; the link is the key.
 */
export function DriverPage() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    driverApi
      .route(token)
      .then((route) => active && setState({ kind: 'ready', route }))
      .catch((err) => active && setState({ kind: err instanceof ApiError && err.status === 404 ? 'notFound' : 'failed' }))
    return () => {
      active = false
    }
  }, [token])

  const updateStop = useCallback(
    (stop: DriverStop) =>
      setState((current) =>
        current.kind === 'ready'
          ? { kind: 'ready', route: { ...current.route, stops: current.route.stops.map((s) => (s.orderId === stop.orderId ? stop : s)) } }
          : current,
      ),
    [],
  )

  return (
    <main className="driver-page stack">
      <header className="driver-page__header">
        {siteLogo && <img className="driver-page__logo" src={siteLogo} alt="" />}
        <h1>{state.kind === 'ready' ? t('driver.titleFor', { date: formatDate(state.route.date) }) : t('driver.title')}</h1>
      </header>
      {state.kind === 'loading' || state.kind === 'failed' ? (
        <Loading failed={state.kind === 'failed'} />
      ) : state.kind === 'notFound' ? (
        <p role="alert" className="notice notice--warning">
          {t('driver.notFound')}
        </p>
      ) : (
        <Outlet context={{ token, route: state.route, updateStop } satisfies DriverContext} />
      )}
    </main>
  )
}

/** The list of stops, with the day's progress and the next stop marked. */
export function DriverStops() {
  const { t } = useTranslation()
  const { route } = useDriver()
  const stops = route.stops
  const live = stops.filter((s) => !s.cancelled)
  const reported = live.filter((s) => s.outcome !== null).length
  const delivered = live.filter((s) => s.outcome === 'Delivered').length
  const next = stops.find(isOpen)
  const left = stops.filter(isOpen).reduce((sum, s) => sum + toCollect(s), 0)
  const collected = stops.filter((s) => s.paidByDriver).reduce((sum, s) => sum + s.total, 0)

  return (
    <>
      <section className="driver-progress" aria-label={t('driver.progress')}>
        <p className="driver-progress__count">{t('driver.reportedOf', { done: reported, count: live.length })}</p>
        <progress max={Math.max(live.length, 1)} value={reported} aria-hidden="true" />
        <p className="muted">
          {t('driver.deliveredCount', { count: delivered })}
          {reported > delivered && <> · {t('driver.notDeliveredCount', { count: reported - delivered })}</>}
        </p>
        <p>
          {t('driver.leftToCollect', { amount: formatMoney(left) })}
          {collected > 0 && <> · {t('driver.collected', { amount: formatMoney(collected) })}</>}
        </p>
        {!next && live.length > 0 && (
          <p role="status" className="driver-progress__done">
            {t('driver.allDone')}
          </p>
        )}
      </section>

      <ol className="route-stops">
        {stops.map((stop, index) => (
          <StopSummary key={stop.orderId} stop={stop} n={index + 1} isNext={stop === next} />
        ))}
      </ol>
      <p className="hint">{t('driver.validThrough', { date: formatDate(route.validThrough) })}</p>
    </>
  )
}

function StopSummary({ stop, n, isNext }: { stop: DriverStop; n: number; isNext: boolean }) {
  const { t } = useTranslation()
  const apartmentPrefix = t('address.apartmentShort', { apartment: '' }).trim()
  const collect = toCollect(stop)
  return (
    <li
      className={`route-stop driver-stop${isNext ? ' driver-stop--next' : ''}${isOpen(stop) ? '' : ' driver-stop--done'}`}
      aria-label={t('driver.stopN', { n, name: stop.name })}
    >
      <header className="row row--between">
        <h2 className="route-stop__title">
          <span className="route-stop__number">{n}</span> {stop.name}
        </h2>
        <StopState stop={stop} isNext={isNext} />
      </header>
      <p className="route-stop__times">
        <StopTimes stop={stop} />
      </p>
      <p>{stop.address}</p>
      {isOpen(stop) && (
        <p className={collect > 0 ? 'route-stop__collect' : 'muted'}>
          {collect > 0 ? t('driver.collect', { amount: formatMoney(collect) }) : t('driver.paidAlready')}
        </p>
      )}
      <p className="row driver-actions">
        <Link className="button-link" to={String(stop.orderId)}>
          {isOpen(stop) ? t('driver.openStop') : t('driver.viewStop')}
          <span className="visually-hidden"> {stop.name}</span>
        </Link>
        {isOpen(stop) && (
          <>
            <a className="button-quiet" href={wazeUrl(navigationAddress(stop.address, apartmentPrefix))} target="_blank" rel="noreferrer">
              {t('driver.waze')}
              <span className="visually-hidden"> {stop.name}</span>
            </a>
            <a className="button-quiet" href={`tel:${stop.phone}`}>
              {t('driver.call')}
              <span className="visually-hidden"> {stop.name}</span>
            </a>
          </>
        )}
      </p>
    </li>
  )
}

export function StopState({ stop, isNext = false }: { stop: DriverStop; isNext?: boolean }) {
  const { t } = useTranslation()
  if (stop.cancelled) return <span className="badge driver-badge driver-badge--off">{t('driver.state.cancelled')}</span>
  if (stop.outcome === 'Delivered') return <span className="badge driver-badge driver-badge--ok">{t('driver.state.delivered')}</span>
  if (stop.outcome === 'NotDelivered') return <span className="badge driver-badge driver-badge--warn">{t('driver.state.notDelivered')}</span>
  return isNext ? <span className="badge driver-badge">{t('driver.state.next')}</span> : null
}

/** "Planned 12:30 · asked 12:00–13:00", from what the stop has. */
export function StopTimes({ stop }: { stop: DriverStop }) {
  const { t } = useTranslation()
  const parts = []
  if (stop.plannedArrival) parts.push(t('driver.plannedAt', { time: formatTime(stop.plannedArrival) }))
  if (stop.deliveryHour) {
    const from = toMinutes(stop.deliveryHour)
    parts.push(t('driver.asked', { from: formatMinutes(from), to: formatMinutes(from + 60) }))
  }
  return <>{parts.length ? parts.join(' · ') : t('driver.noHour')}</>
}
