import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuAddOn, MenuAddOnGroup, MenuDish } from '../api/site'
import { AmountControl } from './AmountControl'
import { formatMoney, priceText, unitLabel } from './format'
import { ImageCarousel } from './ImageCarousel'
import {
  addOnLineTotal,
  addOnRange,
  addOnsOf,
  addOnUnitPrice,
  checkedAddOn,
  defaultOption,
  fixedOption,
  groupUnits,
  groupUsed,
  isCheckbox,
  limitedRange,
  lineTotal,
  newSelection,
  remainingOn,
  type AddOnOffer,
  type AddOnSelection,
  type Selection,
} from './model'

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

/** The name, description, price and allergens of a dish (or of a variant, one heading level down). */
function DishDetails({ dish, nameId, variant }: { dish: MenuDish; nameId: string; variant?: boolean }) {
  const { t } = useTranslation()
  const Heading = variant ? 'h4' : 'h3'
  return (
    <>
      <Heading id={nameId}>{dish.name}</Heading>
      {dish.description && <p className="dish__description">{dish.description}</p>}
      <p className="dish__price">{priceText(dish, t)}</p>
      {dish.allergenInfo && (
        <p className="muted">
          {t('order.allergens')}: {dish.allergenInfo}
        </p>
      )}
    </>
  )
}

export function DishCard({ dish, dishes, selection, date, onChange }: Props) {
  const id = useId()
  return (
    <article className={`dish${selection ? ' dish--chosen' : ''}`} aria-labelledby={`${id}-name`}>
      <ImageCarousel images={dish.images} name={dish.name} />
      <div className="dish__body">
        <DishDetails dish={dish} nameId={`${id}-name`} />
        <DishChoice dish={dish} dishes={dishes} selection={selection} date={date} onChange={onChange} />
      </div>
    </article>
  )
}

/**
 * A main dish with variants: one card with the main dish's images and description, and each variant under it with its
 * own price and choices. Each variant is ordered (and listed in the order) as a dish of its own.
 */
export function DishGroupCard({
  dish,
  variants,
  dishes,
  selections,
  date,
  onChange,
}: {
  dish: MenuDish
  variants: MenuDish[]
  dishes: Map<number, MenuDish>
  selections: Record<number, Selection>
  date: string | undefined
  onChange: (dishId: number, selection: Selection | undefined) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const chosen = variants.some((v) => selections[v.id])
  return (
    <article className={`dish dish--group${chosen ? ' dish--chosen' : ''}`} aria-labelledby={`${id}-name`}>
      <ImageCarousel images={dish.images} name={dish.name} />
      <div className="dish__body">
        <h3 id={`${id}-name`}>{dish.name}</h3>
        {dish.description && <p className="dish__description">{dish.description}</p>}
        {dish.allergenInfo && (
          <p className="muted">
            {t('order.allergens')}: {dish.allergenInfo}
          </p>
        )}
        <ul className="dish-variants" aria-label={t('order.variantsOf', { name: dish.name })}>
          {variants.map((variant) => (
            <li key={variant.id} className={`dish-variant${selections[variant.id] ? ' dish-variant--chosen' : ''}`}>
              <DishDetails dish={variant} nameId={`${id}-${variant.id}`} variant />
              <DishChoice
                dish={variant}
                dishes={dishes}
                selection={selections[variant.id]}
                date={date}
                onChange={(selection) => onChange(variant.id, selection)}
              />
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

/** What the client picks for a dish: add it, its option and amount, and its add-ons. */
function DishChoice({ dish, dishes, selection, date, onChange }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const remaining = remainingOn(dish, date)
  const range = limitedRange(dish, remaining)
  const none = range.max < range.min
  const addOns = addOnsOf(dish, dishes)
  const yesNo = !!dish.isYesNo
  const options = dish.choiceMode === 'Fixed' && dish.options.length > 1 && !yesNo

  function setAddOn(addOn: MenuDish, next: AddOnSelection | undefined) {
    if (!selection) return
    const addOnSelections = { ...selection.addOns }
    if (next && next.quantity > 0) addOnSelections[addOn.id] = next
    else delete addOnSelections[addOn.id]
    onChange({ ...selection, addOns: addOnSelections })
  }

  return (
    <>
      {!dish.isSoldOut && <RemainingNote dish={dish} remaining={remaining} />}

      {dish.isSoldOut ? (
        <p className="badge" role="status">
          {t('order.soldOut')}
        </p>
      ) : none && !selection ? (
        <p className="badge" role="status">
          {t('order.soldOutForDate')}
        </p>
      ) : !selection && dish.openByDefault && !yesNo ? (
        // Open by default: the choices are shown right away and nothing is chosen until the client picks.
        options ? (
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
          {options && (
            <OptionCards dish={dish} name={`${id}-option`} checkedId={selection.optionId} onPick={(optionId) => onChange({ ...selection, optionId })} />
          )}

          {none && (
            <p className="badge" role="status">
              {t('order.soldOutForDate')}
            </p>
          )}
          <div className="row">
            {yesNo ? (
              <span className="badge">{t('order.added')}</span>
            ) : (
              <AmountControl
                name={dish.name}
                value={selection.quantity}
                {...range}
                max={Math.max(range.max, range.min)}
                unit={unitLabel(dish, t)}
                onChange={(quantity) => onChange({ ...selection, quantity })}
              />
            )}
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
            <AddOnGroups parent={dish} offers={addOns} dishes={dishes} date={date} selections={selection.addOns} onChange={setAddOn} />
          )}
        </div>
      )}
    </>
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

/** The add-ons under a dish: each named group under its own heading with its limit, then the ones in no group. */
function AddOnGroups({
  parent,
  offers,
  dishes,
  date,
  selections,
  onChange,
}: {
  parent: MenuDish
  offers: AddOnOffer[]
  dishes: Map<number, MenuDish>
  date: string | undefined
  selections: Record<number, AddOnSelection>
  onChange: (addOn: MenuDish, selection: AddOnSelection | undefined) => void
}) {
  const { t } = useTranslation()
  const groups: { group: MenuAddOnGroup | null; offers: AddOnOffer[] }[] = (parent.addOnGroups ?? [])
    .map((group) => ({ group: group as MenuAddOnGroup | null, offers: offers.filter((o) => o.link.groupId === group.id) }))
    .concat([{ group: null, offers: offers.filter((o) => !parent.addOnGroups?.some((g) => g.id === o.link.groupId)) }])
    .filter((g) => g.offers.length > 0)

  return (
    <>
      {groups.map(({ group, offers: inGroup }) => {
        // Room left in the group for an add-on: its limit less what the other add-ons in it already take.
        const room = (addOnId: number) =>
          group?.maxUnits == null ? Infinity : group.maxUnits - groupUsed(parent, selections, group.id, dishes, addOnId)
        return (
          <fieldset key={group?.id ?? 'other'} className="addons">
            <legend>
              {group ? group.name : t('order.addOns')}
              {group?.maxUnits != null && <span className="muted"> · {t('order.groupLimit', { max: group.maxUnits })}</span>}
            </legend>
            {inGroup.map(({ dish: addOn, link }) => (
              <AddOnRow
                key={addOn.id}
                addOn={addOn}
                link={link}
                parent={parent}
                date={date}
                room={room(addOn.id)}
                selection={selections[addOn.id]}
                onChange={(next) => onChange(addOn, next)}
              />
            ))}
          </fieldset>
        )
      })}
    </>
  )
}

function AddOnRow({
  addOn,
  link,
  parent,
  date,
  room,
  selection,
  onChange,
}: {
  addOn: MenuDish
  link: MenuAddOn
  parent: MenuDish
  date: string | undefined
  /** How many group units this add-on can still take. */
  room: number
  selection: AddOnSelection | undefined
  onChange: (selection: AddOnSelection | undefined) => void
}) {
  const { t } = useTranslation()
  const remaining = remainingOn(addOn, date)
  const range = addOnRange(link, addOn, remaining)
  const none = range.max < range.min
  const fixed = fixedOption(link, addOn)
  const optionId = (!fixed && selection?.optionId) || (addOn.choiceMode === 'Fixed' ? (defaultOption(addOn)?.id ?? null) : null)
  const price = link.price === null ? priceText(addOn, t) : priceOf(link, addOn, optionId, t)

  if (isCheckbox(link, addOn)) {
    const checked = !!selection
    const full = !checked && room < groupUnits(link, addOn, 1)
    return (
      <div className="addon">
        <label className="checkbox addon__name">
          <input
            type="checkbox"
            checked={checked}
            disabled={(none || full) && !checked}
            onChange={(e) => onChange(e.target.checked ? checkedAddOn(addOn) : undefined)}
          />
          {addOn.name} · {price}
        </label>
        {none && <span className="badge">{t('order.soldOutForDate')}</span>}
      </div>
    )
  }

  // Each unit takes one from the group, a weight takes one whatever its amount.
  const perUnit = groupUnits(link, addOn, 2) > 1
  const value = selection?.quantity ?? 0
  const max = perUnit ? Math.min(range.max, value + Math.max(0, room)) : room < 1 && !selection ? 0 : range.max

  return (
    <div className="addon">
      <span className="addon__name">
        {addOn.name} · {price}
      </span>
      {none ? (
        <span className="badge">{t('order.soldOutForDate')}</span>
      ) : (
        <>
          {addOn.choiceMode === 'Fixed' && addOn.options.length > 1 && !fixed && (
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
            value={value}
            {...range}
            max={max}
            allowZero
            unit={unitLabel(addOn, t)}
            onChange={(quantity) => onChange({ optionId, quantity })}
          />
          {selection && link.price !== null && (
            <span className="numeric muted">{formatMoney(addOnLineTotal(parent, addOn, selection))}</span>
          )}
          <RemainingNote dish={addOn} remaining={remaining} />
        </>
      )}
    </div>
  )
}

/** An add-on's own price under a dish: free, or per unit (per kilo or named unit for a free amount). */
function priceOf(link: MenuAddOn, addOn: MenuDish, optionId: number | null, t: ReturnType<typeof useTranslation>['t']) {
  const price = addOnUnitPrice(link, addOn, optionId)
  if (price === 0) return t('order.free')
  if (addOn.choiceMode === 'Free') return priceText({ ...addOn, unitPrice: price }, t)
  return formatMoney(price)
}
