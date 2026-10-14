import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import type { MenuDish } from '../api/site'
import { AmountControl } from './AmountControl'
import { formatMoney, priceText } from './format'
import { SummaryDetails } from './OrderSummary'
import { fitAddOns, limitedRange, lineTotal, remainingOn, summaryLines, type Selection } from './model'

interface Props {
  selections: Record<number, Selection>
  dishes: Map<number, MenuDish>
  date: string | undefined
  total: number
  /** The delivery fee already inside `total`, shown as its own line; 0 for none. */
  deliveryFee?: number
  onChange: (dishId: number, selection: Selection | undefined) => void
  /** Closes the sheet and brings the client to the dish's own card to change its adjustments. */
  onEdit: (dishId: number) => void
  /** Closes the sheet and goes on to the order's details. */
  onContinue: () => void
  onClose: () => void
}

/** The dish's own picture, else its main dish's. */
const pictureOf = (dish: MenuDish, dishes: Map<number, MenuDish>) =>
  dish.images[0] ?? (dish.mainDishId != null ? dishes.get(dish.mainDishId)?.images[0] : undefined)

/**
 * Everything chosen so far, with each dish's picture: the amount of each can be changed, a dish taken out, or its
 * adjustments edited at its card. The total follows every change.
 */
export function CartSheet({ selections, dishes, date, total, deliveryFee = 0, onChange, onEdit, onContinue, onClose }: Props) {
  const { t } = useTranslation()
  const [shown, setShown] = useState<Record<number, boolean>>({})
  const lines = summaryLines(selections, dishes)
  return (
    <Modal title={t('order.cart.title')} onClose={onClose} wide>
      {lines.length === 0 ? (
        <p className="cart-sheet__empty">{t('order.cart.empty')}</p>
      ) : (
        <ul className="cart-sheet__list">
          {lines.map((line) => {
            const { dish, selection } = line
            const range = limitedRange(dish, remainingOn(dish, date))
            const hasDetails = line.option !== null || line.details.length > 0
            const open = !!shown[dish.id]
            const picture = pictureOf(dish, dishes)
            return (
              <li key={dish.id} className="cart-row">
                <div className="cart-row__top">
                  {picture ? <img className="cart-row__picture" src={picture} alt="" loading="lazy" /> : <span className="cart-row__picture cart-row__picture--empty" aria-hidden="true" />}
                  <div className="cart-row__text">
                    <span className="cart-row__name">{dish.name}</span>
                    <span className="muted cart-row__unit">{priceText(dish, t)}</span>
                  </div>
                  <strong key={lineTotal(dish, selection.optionId, selection.quantity)} className="cart-row__price numeric">
                    {formatMoney(lineTotal(dish, selection.optionId, selection.quantity))}
                  </strong>
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
                  <button type="button" className="button-quiet cart-row__remove" aria-label={t('order.removeDish', { name: dish.name })} onClick={() => onChange(dish.id, undefined)}>
                    {t('order.remove')}
                  </button>
                </div>
                {hasDetails && open && <SummaryDetails line={line} />}
              </li>
            )
          })}
        </ul>
      )}
      {deliveryFee > 0 && (
        <p className="cart-sheet__total">
          <span>{t('order.deliveryFee')}</span> <strong className="numeric">{formatMoney(deliveryFee)}</strong>
        </p>
      )}
      <p className="cart-sheet__total">
        <span>{t('order.cart.total')}</span> <strong key={total} className="numeric cart-sheet__sum">{formatMoney(total)}</strong>
      </p>
      <div className="modal__actions cart-sheet__actions">
        {lines.length > 0 && (
          <button type="button" onClick={onContinue}>
            {t('order.toDetails')}
          </button>
        )}
        <button type="button" className="button-quiet" onClick={onClose}>
          {t('order.cart.keepChoosing')}
        </button>
      </div>
    </Modal>
  )
}
