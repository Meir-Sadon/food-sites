import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categoriesApi, dishesApi, type Category, type Dish } from '../../api/catalog'
import { reportsApi, type Report, type ReportFilter } from '../../api/operations'
import { formatMoney } from '../../order/format'
import { formatDate, formatNumber } from '../format'
import { Loading, Section } from '../ui'

/** Dishes sold and total sales per week, with filters and an Excel export. */
export function ReportsPage() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<ReportFilter>({ from: '', to: '', dishId: '', categoryId: '', paymentMethod: '' })
  const [report, setReport] = useState<Report | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [dishes, setDishes] = useState<Dish[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    Promise.all([categoriesApi.get(), dishesApi.getAll()])
      .then(([c, d]) => {
        setCategories(c)
        setDishes(d)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    let current = true
    reportsApi
      .get(filter)
      .then((result) => {
        if (!current) return
        setReport(result)
        setFailed(false)
      })
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [filter])

  const set = (patch: Partial<ReportFilter>) => setFilter({ ...filter, ...patch })

  return (
    <>
      <h1>{t('admin.reports.title')}</h1>

      <form className="row row--end" onSubmit={(e) => e.preventDefault()} aria-label={t('admin.orders.filters')}>
        <span className="field field--narrow">
          <label htmlFor="report-from">{t('admin.orders.from')}</label>
          <input id="report-from" type="date" value={filter.from} onChange={(e) => set({ from: e.target.value })} />
        </span>
        <span className="field field--narrow">
          <label htmlFor="report-to">{t('admin.orders.to')}</label>
          <input id="report-to" type="date" value={filter.to} onChange={(e) => set({ to: e.target.value })} />
        </span>
        <span className="field field--narrow">
          <label htmlFor="report-category">{t('admin.reports.category')}</label>
          <select id="report-category" value={filter.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="">{t('admin.reports.all')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </span>
        <span className="field field--narrow">
          <label htmlFor="report-dish">{t('admin.reports.dish')}</label>
          <select id="report-dish" value={filter.dishId} onChange={(e) => set({ dishId: e.target.value })}>
            <option value="">{t('admin.reports.all')}</option>
            {dishes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </span>
        <span className="field field--narrow">
          <label htmlFor="report-payment">{t('admin.orders.payment')}</label>
          <select id="report-payment" value={filter.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as ReportFilter['paymentMethod'] })}>
            <option value="">{t('admin.reports.all')}</option>
            <option value="OnDelivery">{t('admin.orders.onDelivery')}</option>
            <option value="Transfer">{t('admin.orders.transfer')}</option>
          </select>
        </span>
        <a className="button-link" href={reportsApi.exportUrl(filter)} download>
          {t('admin.reports.export')}
        </a>
      </form>

      {!report ? (
        <Loading failed={failed} />
      ) : (
        <>
          {failed && <Loading failed />}
          <p role="status" className="report-total">
            {t('admin.reports.total', { orders: report.orders, sales: formatMoney(report.sales) })}
          </p>
          {report.orders === 0 && <p>{t('admin.reports.empty')}</p>}

          {report.weeks.length > 0 && (
            <Section title={t('admin.reports.byWeek')} hint={t('admin.reports.weekHint')}>
              {report.weeks.map((week) => (
                <details key={week.weekStart} open>
                  <summary>
                    {t('admin.reports.weekOf', { date: formatDate(week.weekStart) })} · {t('admin.reports.weekTotal', { orders: week.orders, sales: formatMoney(week.sales) })}
                  </summary>
                  <table className="table">
                    <caption className="visually-hidden">{t('admin.reports.weekOf', { date: formatDate(week.weekStart) })}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('admin.orders.dish')}</th>
                        <th scope="col">{t('admin.orders.quantity')}</th>
                        <th scope="col">{t('admin.reports.sales')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {week.dishes.map((d) => (
                        <tr key={d.dishId}>
                          <th scope="row">{d.dishName}</th>
                          <td className="numeric">{formatNumber(d.quantity)}</td>
                          <td className="numeric">{formatMoney(d.sales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </Section>
          )}

          {report.dishes.length > 0 && (
            <Section title={t('admin.reports.byDish')}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('admin.orders.dish')}</th>
                    <th scope="col">{t('admin.orders.quantity')}</th>
                    <th scope="col">{t('admin.reports.sales')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dishes.map((d) => (
                    <tr key={d.dishId}>
                      <th scope="row">{d.dishName}</th>
                      <td className="numeric">{formatNumber(d.quantity)}</td>
                      <td className="numeric">{formatMoney(d.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </>
      )}
    </>
  )
}
