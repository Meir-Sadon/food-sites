import { useTranslation } from 'react-i18next'
import { ordersAdminApi } from '../../api/operations'
import { formatDate, formatNumber } from '../format'
import { useLoad } from '../hooks'
import { Loading } from '../ui'

/** The total of each dish and option to cook for one supply day, ready to print. */
export function CookingSummary({ date }: { date: string }) {
  const { t } = useTranslation()
  const { data: summary, failed } = useLoad(() => ordersAdminApi.summary(date))

  if (!summary) return <Loading failed={failed} />

  return (
    <section className="cooking-summary" aria-label={t('admin.orders.summaryFor', { date: formatDate(date) })}>
      <h3>{t('admin.orders.summaryFor', { date: formatDate(date) })}</h3>
      <p className="muted">
        {t('admin.orders.summaryCounts', {
          orders: summary.orderCount,
          delivery: summary.deliveryCount,
          pickup: summary.pickupCount,
        })}
      </p>
      <p className="muted">
        {t('admin.orders.summaryDishes', {
          main: formatNumber(summary.mainDishCount),
          side: formatNumber(summary.sideDishCount),
        })}
      </p>
      {summary.rows.length === 0 ? (
        <p>{t('admin.orders.summaryEmpty')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{t('admin.orders.dish')}</th>
              <th scope="col">{t('admin.orders.option')}</th>
              <th scope="col">{t('admin.orders.quantity')}</th>
              <th scope="col">{t('admin.orders.ordersCount')}</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={`${row.dishId}-${row.optionLabel ?? ''}`}>
                <th scope="row">{row.dishName}</th>
                <td>{row.optionLabel}</td>
                <td className="numeric">{formatNumber(row.quantity)}</td>
                <td className="numeric">{row.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="button-quiet no-print" onClick={() => window.print()}>
        {t('admin.orders.print')}
      </button>
    </section>
  )
}
