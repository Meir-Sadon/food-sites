import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuDish } from '../api/site'
import { DeliveryFeeNote } from './DeliveryFeeNote'
import { amountText, formatMoney } from './format'
import { lineTotal, summaryLines, type Selection, type SummaryLine } from './model'

/** What the client adjusted or wrote on one dish, a unit per line. */
export function SummaryDetails({ line }: { line: SummaryLine }) {
  const { t } = useTranslation()
  return (
    <ul className="summary-details">
      {line.option && <li>{line.option}</li>}
      {line.details.map((unit, i) => (
        <li key={i}>
          {unit.unit !== null && <strong>{t('order.summary.unit', { n: unit.unit })}: </strong>}
          {[
            ...unit.add,
            ...unit.answers.map((a) => `${a.question}: ${a.yesNo ? t(a.value === 'yes' ? 'order.yes' : 'order.no') : a.value}`),
            ...(unit.note ? [`${t('order.summary.note')}: ${unit.note}`] : []),
          ].join(' · ')}
        </li>
      ))}
    </ul>
  )
}

/**
 * The order so far, read only: each dish's main name and amount, and a small button beside the ones with adjustments or
 * remarks that shows what was changed.
 */
export function OrderSummary({
  selections,
  dishes,
  delivery,
}: {
  selections: Record<number, Selection>
  dishes: Map<number, MenuDish>
  /** The advanced delivery setting: the fee worked out from the address, or still waiting for it (`pending`). */
  delivery?: { fee: number; discount?: number; zoneName: string | null; pending: boolean }
}) {
  const { t } = useTranslation()
  const [shown, setShown] = useState<Record<number, boolean>>({})
  const lines = summaryLines(selections, dishes)
  if (lines.length === 0) return null
  return (
    <section className="order-summary" aria-labelledby="order-summary-title">
      <h3 id="order-summary-title">{t('order.summary.title')}</h3>
      <ul className="order-summary__list">
        {lines.map((line) => {
          const hasDetails = line.option !== null || line.details.length > 0
          const open = !!shown[line.dish.id]
          return (
            <li key={line.dish.id} className="order-summary__row">
              <div className="order-summary__main">
                <span className="order-summary__name">{line.dish.name}</span>
                <span className="order-summary__amount numeric">×{amountText(line.dish, line.selection.quantity, t)}</span>
                <span className="order-summary__price numeric">{formatMoney(lineTotal(line.dish, line.selection.optionId, line.selection.quantity))}</span>
                {hasDetails && (
                  <button
                    type="button"
                    className="order-summary__toggle"
                    aria-expanded={open}
                    aria-label={t(open ? 'order.summary.hideDetails' : 'order.summary.showDetails', { name: line.dish.name })}
                    onClick={() => setShown({ ...shown, [line.dish.id]: !open })}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
                    </svg>
                  </button>
                )}
              </div>
              {hasDetails && open && <SummaryDetails line={line} />}
            </li>
          )
        })}
        {delivery && (
          <li className="order-summary__row">
            <div className="order-summary__main">
              <span className="order-summary__name">
                {t('order.deliveryFee')}
                {delivery.zoneName ? ` (${delivery.zoneName})` : ''}
                <DeliveryFeeNote discount={delivery.discount} free={delivery.fee <= 0} />
              </span>
              <span className="order-summary__price numeric">{delivery.pending ? '—' : delivery.fee <= 0 && delivery.discount ? t('order.deliveryDiscount.freePrice') : formatMoney(delivery.fee)}</span>
            </div>
          </li>
        )}
      </ul>
    </section>
  )
}
