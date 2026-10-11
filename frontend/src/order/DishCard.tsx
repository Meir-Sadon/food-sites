import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuAddOn, MenuAddOnGroup, MenuDish, MenuQuestion } from '../api/site'
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
  fitAddOns,
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
  type Answer,
  type Answers,
  type Selection,
  unitAnswers,
  unitNote,
  withAnswer,
  ANSWER_MAX_LENGTH,
  unitsOf,
  withNote,
  withUnit,
  NOTE_MAX_LENGTH,
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

/** A variant with no pictures, description or allergens of its own has nothing to fill a row with. */
const isCompact = (variant: MenuDish) => variant.images.length === 0 && !variant.description && !variant.allergenInfo

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
            <li
              key={variant.id}
              className={`dish-variant${selections[variant.id] ? ' dish-variant--chosen' : ''}${isCompact(variant) && !selections[variant.id] ? ' dish-variant--compact' : ''}`}
            >
              {/* A variant with pictures of its own shows them; without, the card's pictures (the main dish's) stay. */}
              <ImageCarousel images={variant.images} name={variant.name} />
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
  const units = selection ? unitsOf(dish, selection) : []
  const options = dish.choiceMode === 'Fixed' && dish.options.length > 1 && !yesNo
  const questions = dish.questions ?? []

  /** Changes one add-on of one ordered unit. */
  function setAddOn(unit: number, addOn: MenuDish, next: AddOnSelection | undefined) {
    if (!selection) return
    const addOnSelections = { ...unitsOf(dish, selection)[unit] }
    if (next && next.quantity > 0) addOnSelections[addOn.id] = next
    else delete addOnSelections[addOn.id]
    onChange(withUnit(selection, unit, addOnSelections))
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
                onChange={(quantity) => onChange(fitAddOns(dish, { ...selection, quantity }, dishes))}
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

          {units.length > 1 ? (
            units.map((unit, i) => (
              <div key={i} className="addon-unit" role="group" aria-label={t('order.unitN', { n: i + 1, name: dish.name })}>
                <h4 className="addon-unit__title">{t('order.unitN', { n: i + 1, name: dish.name })}</h4>
                <NoteField label={t('order.unitNote', { n: i + 1 })} value={unitNote(selection, i)} onChange={(note) => onChange(withNote(selection, i, note))} />
                <QuestionFields
                  questions={questions}
                  answers={unitAnswers(selection, i)}
                  onChange={(questionId, answer) => onChange(withAnswer(selection, i, questionId, answer))}
                />
                {addOns.length > 0 && (
                  <>
                    <AddOnGroups parent={dish} offers={addOns} dishes={dishes} date={date} selections={unit} onChange={(a, next) => setAddOn(i, a, next)} />
                    <select
                      aria-label={t('order.copyAddOnsTo', { n: i + 1 })}
                      value=""
                      onChange={(e) => e.target.value !== '' && onChange(withUnit(selection, i, { ...units[Number(e.target.value)] }))}
                    >
                      <option value="">{t('order.copyAddOnsFrom')}</option>
                      {units.map((_, k) =>
                        k === i ? null : (
                          <option key={k} value={k}>
                            {t('order.unitOption', { n: k + 1 })}
                          </option>
                        ),
                      )}
                    </select>
                  </>
                )}
              </div>
            ))
          ) : (
            <>
              {addOns.length > 0 && (
                <AddOnGroups parent={dish} offers={addOns} dishes={dishes} date={date} selections={units[0]} onChange={(a, next) => setAddOn(0, a, next)} />
              )}
              {!yesNo && (
                <NoteField label={t('order.noteFor', { name: dish.name })} value={unitNote(selection, 0)} onChange={(note) => onChange(withNote(selection, 0, note))} />
              )}
              <QuestionFields
                questions={questions}
                answers={unitAnswers(selection, 0)}
                onChange={(questionId, answer) => onChange(withAnswer(selection, 0, questionId, answer))}
              />
            </>
          )}
        </div>
      )}
    </>
  )
}

/** A name or remark the client writes on one ordered dish (who it is for, how they want it). */
function NoteField({ label, value, onChange }: { label: string; value: string; onChange: (note: string) => void }) {
  return (
    <input
      type="text"
      className="dish-note"
      aria-label={label}
      placeholder={label}
      maxLength={NOTE_MAX_LENGTH}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** The dish's questions for one ordered unit, each answered the way the admin chose. */
function QuestionFields({
  questions,
  answers,
  onChange,
}: {
  questions: MenuQuestion[]
  answers: Answers
  onChange: (questionId: number, answer: Answer) => void
}) {
  if (questions.length === 0) return null
  return (
    <div className="dish-questions">
      {questions.map((q) => (
        <QuestionField key={q.id} question={q} answer={answers[q.id]} onChange={(answer) => onChange(q.id, answer)} />
      ))}
    </div>
  )
}

function QuestionField({ question, answer, onChange }: { question: MenuQuestion; answer: Answer | undefined; onChange: (answer: Answer) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const text = typeof answer === 'string' ? answer : ''
  const label = (
    <>
      {question.text}
      {question.isRequired && (
        <>
          <span aria-hidden="true"> *</span>
          <span className="visually-hidden"> {t('order.requiredMark')}</span>
        </>
      )}
    </>
  )

  // Questions answered with a choice of several radio buttons or check boxes are a group under the question.
  const choices = (kind: 'radio' | 'checkbox', values: { value: string; label: string }[]) => (
    <fieldset className="dish-question">
      <legend>{label}</legend>
      <div className="row">
        {values.map((c) => {
          const picked = Array.isArray(answer) ? answer : []
          const checked = kind === 'radio' ? text === c.value : picked.includes(c.value)
          return (
            <label key={c.value} className="checkbox">
              <input
                type={kind}
                name={id}
                checked={checked}
                onChange={(e) =>
                  onChange(
                    kind === 'radio'
                      ? c.value
                      : question.choices.filter((v) => (v === c.value ? e.target.checked : picked.includes(v))),
                  )
                }
              />
              {c.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )

  switch (question.kind) {
    case 'YesNo':
      return choices('radio', [
        { value: 'yes', label: t('order.yes') },
        { value: 'no', label: t('order.no') },
      ])
    case 'MultiChoice':
      return choices('checkbox', question.choices.map((c) => ({ value: c, label: c })))
    case 'SingleChoice':
      if (!question.showAsDropdown) return choices('radio', question.choices.map((c) => ({ value: c, label: c })))
      return (
        <span className="field dish-question">
          <label htmlFor={id}>{label}</label>
          <select id={id} value={text} onChange={(e) => onChange(e.target.value)} aria-required={question.isRequired}>
            <option value="">{t('order.chooseAnswer')}</option>
            {question.choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </span>
      )
    default:
      return (
        <span className="field dish-question">
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            type={question.kind === 'Number' ? 'number' : question.kind === 'Date' ? 'date' : 'text'}
            inputMode={question.kind === 'Number' ? 'decimal' : undefined}
            step={question.kind === 'Number' ? 'any' : undefined}
            maxLength={question.kind === 'Text' ? ANSWER_MAX_LENGTH : undefined}
            value={text}
            aria-required={question.isRequired}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
      )
  }
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
