import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import type { MenuDish } from '../api/site'
import { AmountControl } from './AmountControl'
import { formatMoney } from './format'
import { SummaryDetails } from './OrderSummary'
import { fitAddOns, limitedRange, lineTotal, remainingOn, summaryLines, type Selection } from './model'

/** The bold round basket that stays on screen on every layout, with the number of dishes, sides and drinks in it. */
export function CartButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" className="cart-button" aria-label={count > 0 ? t('order.cart.buttonCount', { count }) : t('order.cart.button')} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 8z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      {count > 0 && (
        <span className="cart-button__badge numeric" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  )
}

interface Props {
  selections: Record<number, Selection>
  dishes: Map<number, MenuDish>
  date: string | undefined
  total: number
  onChange: (dishId: number, selection: Selection | undefined) => void
  /** Closes the sheet and brings the client to the dish's own card to change its adjustments. */
  onEdit: (dishId: number) => void
  onClose: () => void
}

/** Everything chosen so far: the amount of each can be changed, a dish taken out, or its adjustments edited at its card. */
export function CartSheet({ selections, dishes, date, total, onChange, onEdit, onClose }: Props) {
  const { t } = useTranslation()
  const [shown, setShown] = useState<Record<number, boolean>>({})
  const lines = summaryLines(selections, dishes)
  return (
    <Modal title={t('order.cart.title')} onClose={onClose} wide>
      {lines.length === 0 ? (
        <p className="muted">{t('order.cart.empty')}</p>
      ) : (
        <ul className="order-summary__list cart-sheet__list">
          {lines.map((line) => {
            const { dish, selection } = line
            const range = limitedRange(dish, remainingOn(dish, date))
            const hasDetails = line.option !== null || line.details.length > 0
            const open = !!shown[dish.id]
            return (
              <li key={dish.id} className="order-summary__row">
                <div className="order-summary__main">
                  <span className="order-summary__name">{dish.name}</span>
                  <span className="order-summary__price numeric">{formatMoney(lineTotal(dish, selection.optionId, selection.quantity))}</span>
                </div>
                <div className="cart-sheet__controls">
                  {!dish.isYesNo && (
                    <AmountControl
                      name={dish.name}
                      value={selection.quantity}
                      {...range}
                      max={Math.max(range.max, range.min)}
                      onChange={(quantity) => onChange(dish.id, fitAddOns(dish, { ...selection, quantity }, dishes))}
                    />
                  )}
                  {hasDetails && (
                    <button type="button" className="button-quiet" aria-expanded={open} aria-label={t(open ? 'order.summary.hideDetails' : 'order.summary.showDetails', { name: dish.name })} onClick={() => setShown({ ...shown, [dish.id]: !open })}>
                      {t(open ? 'order.cart.hideDetails' : 'order.cart.details')}
                    </button>
                  )}
                  <button type="button" className="button-quiet" aria-label={t('order.cart.edit', { name: dish.name })} onClick={() => onEdit(dish.id)}>
                    {t('order.cart.editShort')}
                  </button>
                  <button type="button" className="button-quiet" aria-label={t('order.removeDish', { name: dish.name })} onClick={() => onChange(dish.id, undefined)}>
                    {t('order.remove')}
                  </button>
                </div>
                {hasDetails && open && <SummaryDetails line={line} />}
              </li>
            )
          })}
        </ul>
      )}
      <p className="cart-sheet__total">
        <span>{t('order.cart.total')}</span> <strong className="numeric">{formatMoney(total)}</strong>
      </p>
      <div className="modal__actions">
        <button type="button" onClick={onClose}>
          {t('order.cart.keepChoosing')}
        </button>
      </div>
    </Modal>
  )
}
