import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuDish } from '../api/site'
import { AmountControl } from './AmountControl'
import { formatMoney, priceText, unitLabel } from './format'
import { ImageCarousel } from './ImageCarousel'
import { addOnsOf, amountRange, defaultOption, lineTotal, newSelection, type AddOnSelection, type Selection } from './model'

interface Props {
  dish: MenuDish
  dishes: Map<number, MenuDish>
  selection: Selection | undefined
  onChange: (selection: Selection | undefined) => void
}

export function DishCard({ dish, dishes, selection, onChange }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const range = amountRange(dish)
  const addOns = addOnsOf(dish, dishes)

  function setAddOn(addOn: MenuDish, next: AddOnSelection | undefined) {
    if (!selection) return
    const addOnSelections = { ...selection.addOns }
    if (next && next.quantity > 0) addOnSelections[addOn.id] = next
    else delete addOnSelections[addOn.id]
    onChange({ ...selection, addOns: addOnSelections })
  }

  return (
    <article className={`dish${selection ? ' dish--chosen' : ''}`} aria-labelledby={`${id}-name`}>
      <ImageCarousel images={dish.images} name={dish.name} />
      <div className="dish__body">
        <h3 id={`${id}-name`}>{dish.name}</h3>
        {dish.description && <p>{dish.description}</p>}
        <p className="dish__price">{priceText(dish, t)}</p>
        {dish.allergenInfo && (
          <p className="muted">
            {t('order.allergens')}: {dish.allergenInfo}
          </p>
        )}

        {dish.isSoldOut ? (
          <p className="badge" role="status">
            {t('order.soldOut')}
          </p>
        ) : !selection ? (
          <button type="button" aria-label={t('order.addDish', { name: dish.name })} onClick={() => onChange(newSelection(dish))}>
            {t('order.add')}
          </button>
        ) : (
          <div className="dish__choice">
            {dish.choiceMode === 'Fixed' && dish.options.length > 1 && (
              <fieldset>
                <legend>{t('order.optionFor', { name: dish.name })}</legend>
                <div className="option-cards">
                  {dish.options.map((option) => (
                    <label key={option.id} className="option-card">
                      <input
                        type="radio"
                        name={`${id}-option`}
                        checked={selection.optionId === option.id}
                        onChange={() => onChange({ ...selection, optionId: option.id })}
                      />
                      <span className="option-card__label">{option.label}</span>
                      <span className="option-card__price numeric">{formatMoney(option.price)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="row">
              <AmountControl
                name={dish.name}
                value={selection.quantity}
                {...range}
                unit={unitLabel(dish, t)}
                onChange={(quantity) => onChange({ ...selection, quantity })}
              />
              <strong className="numeric">{formatMoney(lineTotal(dish, selection.optionId, selection.quantity))}</strong>
              <button
                type="button"
                className="button-quiet"
                aria-label={t('order.removeDish', { name: dish.name })}
                onClick={() => onChange(undefined)}
              >
                {t('order.remove')}
              </button>
            </div>

            {addOns.length > 0 && (
              <fieldset className="addons">
                <legend>{t('order.addOns')}</legend>
                {addOns.map((addOn) => (
                  <AddOnRow key={addOn.id} addOn={addOn} selection={selection.addOns[addOn.id]} onChange={(next) => setAddOn(addOn, next)} />
                ))}
              </fieldset>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function AddOnRow({
  addOn,
  selection,
  onChange,
}: {
  addOn: MenuDish
  selection: AddOnSelection | undefined
  onChange: (selection: AddOnSelection | undefined) => void
}) {
  const { t } = useTranslation()
  const range = amountRange(addOn)
  const optionId = selection?.optionId ?? (addOn.choiceMode === 'Fixed' ? (defaultOption(addOn)?.id ?? null) : null)

  return (
    <div className="addon">
      <span className="addon__name">
        {addOn.name} · {priceText(addOn, t)}
      </span>
      {addOn.choiceMode === 'Fixed' && addOn.options.length > 1 && (
        <select
          aria-label={t('order.optionFor', { name: addOn.name })}
          value={optionId ?? ''}
          onChange={(e) => onChange({ optionId: Number(e.target.value), quantity: selection?.quantity ?? range.min })}
        >
          {addOn.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} · {formatMoney(option.price)}
            </option>
          ))}
        </select>
      )}
      <AmountControl
        name={addOn.name}
        value={selection?.quantity ?? 0}
        {...range}
        allowZero
        unit={unitLabel(addOn, t)}
        onChange={(quantity) => onChange({ optionId, quantity })}
      />
    </div>
  )
}
