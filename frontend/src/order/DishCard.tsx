import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuDish } from '../api/site'
import { AmountControl } from './AmountControl'
import { formatMoney, priceText, unitLabel } from './format'
import { ImageCarousel } from './ImageCarousel'
import { addOnsOf, defaultOption, limitedRange, lineTotal, newSelection, remainingOn, type AddOnSelection, type Selection } from './model'

interface Props {
  dish: MenuDish
  dishes: Map<number, MenuDish>
  selection: Selection | undefined
  /** The chosen supply date, for dishes limited per date. */
  date: string | undefined
  onChange: (selection: Selection | undefined) => void
}

const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 3 })

function RemainingNote({ dish, remaining }: { dish: MenuDish; remaining: number | null }) {
  const { t } = useTranslation()
  if (remaining === null || remaining <= 0) return null
  const unit = unitLabel(dish, t)
  return (
    <p className="badge" role="status">
      {t('order.remaining', { amount: `${number.format(remaining)}${unit ? ` ${unit}` : ''}` })}
    </p>
  )
}

export function DishCard({ dish, dishes, selection, date, onChange }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const remaining = remainingOn(dish, date)
  const range = limitedRange(dish, remaining)
  const none = range.max < range.min
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

        {!dish.isSoldOut && <RemainingNote dish={dish} remaining={remaining} />}

        {dish.isSoldOut ? (
          <p className="badge" role="status">
            {t('order.soldOut')}
          </p>
        ) : none && !selection ? (
          <p className="badge" role="status">
            {t('order.soldOutForDate')}
          </p>
        ) : !selection && dish.openByDefault ? (
          // Open by default: the choices are shown right away and nothing is chosen until the client picks.
          dish.choiceMode === 'Fixed' && dish.options.length > 1 ? (
            <div className="dish__choice">
              <OptionCards
                dish={dish}
                name={`${id}-option`}
                checkedId={null}
                onPick={(optionId) => onChange({ ...newSelection(dish), optionId })}
              />
            </div>
          ) : (
            <div className="dish__choice">
              <div className="row">
                <AmountControl
                  name={dish.name}
                  value={0}
                  {...range}
                  max={Math.max(range.max, range.min)}
                  allowZero
                  unit={unitLabel(dish, t)}
                  onChange={(quantity) => quantity > 0 && onChange({ ...newSelection(dish), quantity })}
                />
              </div>
            </div>
          )
        ) : !selection ? (
          <button type="button" aria-label={t('order.addDish', { name: dish.name })} onClick={() => onChange(newSelection(dish))}>
            {t('order.add')}
          </button>
        ) : (
          <div className="dish__choice">
            {dish.choiceMode === 'Fixed' && dish.options.length > 1 && (
              <OptionCards dish={dish} name={`${id}-option`} checkedId={selection.optionId} onPick={(optionId) => onChange({ ...selection, optionId })} />
            )}

            {none && (
              <p className="badge" role="status">
                {t('order.soldOutForDate')}
              </p>
            )}
            <div className="row">
              <AmountControl
                name={dish.name}
                value={selection.quantity}
                {...range}
                max={Math.max(range.max, range.min)}
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
                  <AddOnRow key={addOn.id} addOn={addOn} date={date} selection={selection.addOns[addOn.id]} onChange={(next) => setAddOn(addOn, next)} />
                ))}
              </fieldset>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

/** The fixed options of a dish as cards; for an open-by-default dish the default one carries a sign. */
function OptionCards({
  dish,
  name,
  checkedId,
  onPick,
}: {
  dish: MenuDish
  name: string
  checkedId: number | null
  onPick: (optionId: number) => void
}) {
  const { t } = useTranslation()
  const marked = dish.openByDefault ? defaultOption(dish)?.id : undefined
  return (
    <fieldset>
      <legend>{t('order.optionFor', { name: dish.name })}</legend>
      <div className="option-cards">
        {dish.options.map((option) => (
          <label key={option.id} className="option-card">
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              checked={checkedId === option.id}
              onChange={() => onPick(option.id)}
            />
            {option.id === marked && <span className="option-card__default">★ {t('order.defaultOption')}</span>}
            <span className="option-card__label">{option.label}</span>
            <span className="option-card__price numeric">{formatMoney(option.price)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function AddOnRow({
  addOn,
  date,
  selection,
  onChange,
}: {
  addOn: MenuDish
  date: string | undefined
  selection: AddOnSelection | undefined
  onChange: (selection: AddOnSelection | undefined) => void
}) {
  const { t } = useTranslation()
  const remaining = remainingOn(addOn, date)
  const range = limitedRange(addOn, remaining)
  const none = range.max < range.min
  const optionId = selection?.optionId ?? (addOn.choiceMode === 'Fixed' ? (defaultOption(addOn)?.id ?? null) : null)

  return (
    <div className="addon">
      <span className="addon__name">
        {addOn.name} · {priceText(addOn, t)}
      </span>
      {none ? (
        <span className="badge">{t('order.soldOutForDate')}</span>
      ) : (
        <>
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
          <RemainingNote dish={addOn} remaining={remaining} />
        </>
      )}
    </div>
  )
}
