import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { weekdays } from '../../api/catalog'
import { usageApi, type UsageReport } from '../../api/operations'
import { formatMoney } from '../../order/format'
import { formatDate, formatNumber } from '../format'
import { useErrorMessage } from '../hooks'
import { Loading, Section, Status } from '../ui'
import { BarChart, StepBars } from './BarChart'

type Period = '7' | '30' | '90' | 'custom'

/** "2026-10-10" for a date in the viewer's time zone. */
function isoDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function lastDays(days: number) {
  const to = new Date()
  const from = new Date(to)
  from.setDate(to.getDate() - days + 1)
  return { from: isoDate(from), to: isoDate(to) }
}

/** "35%", or "–" when there is nothing to divide by. */
function percent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–'
}

/** "10/10" from "2026-10-10". */
const shortDate = (iso: string) => formatDate(iso).slice(0, 5)

/** How many people use the client site, how far they get with an order, and who comes back. */
export function UsagePage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [period, setPeriod] = useState<Period>('30')
  const [range, setRange] = useState(() => lastDays(30))
  const [report, setReport] = useState<UsageReport | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!range.from || !range.to) return
    let current = true
    usageApi
      .get(range.from, range.to)
      .then((result) => {
        if (!current) return
        setReport(result)
        setError(null)
      })
      .catch((err) => current && setError(err ?? new Error()))
    return () => {
      current = false
    }
  }, [range])

  function choose(value: Period) {
    setPeriod(value)
    if (value !== 'custom') setRange(lastDays(Number(value)))
  }

  return (
    <>
      <h1>{t('admin.usage.title')}</h1>
      <p className="hint">{t('admin.usage.intro')}</p>

      <form className="row row--end" onSubmit={(e) => e.preventDefault()} aria-label={t('admin.usage.range')}>
        <span className="field field--narrow">
          <label htmlFor="usage-period">{t('admin.usage.period')}</label>
          <select id="usage-period" value={period} onChange={(e) => choose(e.target.value as Period)}>
            <option value="7">{t('admin.usage.lastDays', { count: 7 })}</option>
            <option value="30">{t('admin.usage.lastDays', { count: 30 })}</option>
            <option value="90">{t('admin.usage.lastDays', { count: 90 })}</option>
            <option value="custom">{t('admin.usage.custom')}</option>
          </select>
        </span>
        {period === 'custom' && (
          <>
            <span className="field field--narrow">
              <label htmlFor="usage-from">{t('admin.orders.from')}</label>
              <input id="usage-from" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </span>
            <span className="field field--narrow">
              <label htmlFor="usage-to">{t('admin.orders.to')}</label>
              <input id="usage-to" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </span>
          </>
        )}
      </form>

      {error != null && <Status message={errorMessage(error)} error />}
      {!report ? error == null && <Loading /> : <UsageReportView report={report} />}
    </>
  )
}

function UsageReportView({ report }: { report: UsageReport }) {
  const { t } = useTranslation()
  const { funnel, orders, registered } = report
  const days = report.days
  const dayLabelEvery = Math.max(1, Math.ceil(days.length / 8))
  const dayBars = (pick: (d: (typeof days)[number]) => number) => days.map((d) => ({ label: shortDate(d.day), value: pick(d) }))

  return (
    <>
      {report.approximate && (
        <p className="notice notice--warning">{t('admin.usage.approximate', { date: formatDate(report.keptSince) })}</p>
      )}

      <ul className="stat-tiles" aria-label={t('admin.usage.summary')}>
        <li>
          <span>{t('admin.usage.visitors')}</span>
          <strong className="numeric">{formatNumber(funnel.visitors)}</strong>
          <span className="hint">{t('admin.usage.newVisitors', { count: funnel.newVisitors })}</span>
        </li>
        <li>
          <span>{t('admin.usage.started')}</span>
          <strong className="numeric">{formatNumber(funnel.started)}</strong>
          <span className="hint">{t('admin.usage.ofVisitors', { percent: percent(funnel.started, funnel.visitors) })}</span>
        </li>
        <li>
          <span>{t('admin.usage.submitted')}</span>
          <strong className="numeric">{formatNumber(funnel.submitted)}</strong>
          <span className="hint">{t('admin.usage.ofVisitors', { percent: percent(funnel.submitted, funnel.visitors) })}</span>
        </li>
        <li>
          <span>{t('admin.usage.registered')}</span>
          <strong className="numeric">{formatNumber(registered.total)}</strong>
          <span className="hint">{t('admin.usage.newRegistered', { count: registered.new })}</span>
        </li>
        <li>
          <span>{t('admin.usage.returning')}</span>
          <strong className="numeric">{formatNumber(orders.returningCustomers)}</strong>
          <span className="hint">
            {t('admin.usage.reorderRate', { percent: percent(orders.returningCustomers, orders.customers), customers: orders.customers })}
          </span>
        </li>
        <li>
          <span>{t('admin.usage.averageOrder')}</span>
          <strong className="numeric">{formatMoney(orders.averageOrder)}</strong>
          <span className="hint">{t('admin.usage.ordersAndSales', { orders: orders.orders, sales: formatMoney(orders.sales) })}</span>
        </li>
      </ul>
      <p className="hint">{t('admin.usage.totalDevices', { count: report.totalDevices })}</p>

      <Section title={t('admin.usage.funnel')} hint={t('admin.usage.funnelHint')}>
        <StepBars
          steps={[
            { label: t('admin.usage.visitors'), value: funnel.visitors },
            {
              label: t('admin.usage.started'),
              value: funnel.started,
              note: t('admin.usage.step', {
                percent: percent(funnel.started, funnel.visitors),
                left: Math.max(0, funnel.visitors - funnel.started),
              }),
            },
            {
              label: t('admin.usage.submitted'),
              value: funnel.submitted,
              note: t('admin.usage.step', {
                percent: percent(funnel.submitted, funnel.started),
                left: Math.max(0, funnel.started - funnel.submitted),
              }),
            },
          ]}
        />
      </Section>

      <Section title={t('admin.usage.byDay')}>
        <div className="chart-grid">
          <BarChart title={t('admin.usage.visitors')} bars={dayBars((d) => d.visitors)} labelEvery={dayLabelEvery} />
          <BarChart title={t('admin.usage.started')} bars={dayBars((d) => d.started)} labelEvery={dayLabelEvery} />
          <BarChart title={t('admin.usage.submitted')} bars={dayBars((d) => d.submitted)} labelEvery={dayLabelEvery} />
          <BarChart title={t('admin.usage.orders')} bars={dayBars((d) => d.orders)} labelEvery={dayLabelEvery} />
        </div>
      </Section>

      <Section title={t('admin.usage.customers')} hint={t('admin.usage.customersHint')}>
        <StepBars
          steps={[
            { label: t('admin.usage.newCustomerOrders'), value: orders.newCustomerOrders },
            { label: t('admin.usage.returningCustomerOrders'), value: orders.returningCustomerOrders },
          ]}
        />
      </Section>

      <Section title={t('admin.usage.when')} hint={t('admin.usage.whenHint')}>
        <div className="chart-grid">
          <BarChart
            title={t('admin.usage.byWeekday')}
            bars={weekdays.map((day, i) => ({ label: t(`weekdays.${day}`), value: report.ordersByWeekday[i] ?? 0 }))}
          />
          <BarChart
            title={t('admin.usage.byHour')}
            bars={report.ordersByHour.map((value, hour) => ({ label: `${hour}:00`, value }))}
            labelEvery={4}
          />
        </div>
      </Section>

      <Section title={t('admin.usage.topDishes')}>
        {report.topDishes.length === 0 ? (
          <p>{t('admin.reports.empty')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.orders.dish')}</th>
                <th scope="col">{t('admin.orders.quantity')}</th>
                <th scope="col">{t('admin.reports.sales')}</th>
              </tr>
            </thead>
            <tbody>
              {report.topDishes.map((d) => (
                <tr key={d.dishName}>
                  <th scope="row">{d.dishName}</th>
                  <td className="numeric">{formatNumber(d.quantity)}</td>
                  <td className="numeric">{formatMoney(d.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  )
}
