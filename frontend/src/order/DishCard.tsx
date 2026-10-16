import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { prefersReducedMotion } from '../components/motion'
import { Modal } from '../components/Modal'
import { DIETARY_QUESTION_ID } from '../api/catalog'
import { DietaryIcon } from './DietaryTags'
import { useSiteStyle } from '../site/useSite'
import { useTranslation } from 'react-i18next'
import type { MenuAddOn, MenuAddOnGroup, MenuDish, MenuQuestion } from '../api/site'
import { AmountControl } from './AmountControl'
import { formatMoney, optionPriceText, priceText, unitLabel } from './format'
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
  answerOf,
  unitAnswers,
  unitNote,
  unitConfirmed,
  withConfirmed,
  isAdjusted,
  applyToUnadjusted,
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

export function DishCard(props: Props) {
  return useSiteStyle() === 'tiles' ? <DishTile {...props} /> : <PlainDishCard {...props} />
}

function PlainDishCard({ dish, dishes, selection, date, onChange }: Props) {
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
 * A variant with no pictures of its own and nothing to choose but the amount (no options, add-ons or questions) is a
 * small box, side by side with the others like it.
 */
const isCompact = (variant: MenuDish, dishes: Map<number, MenuDish>) =>
  variant.images.length === 0 &&
  !(variant.choiceMode === 'Fixed' && variant.options.length > 1) &&
  (variant.questions ?? []).length === 0 &&
  addOnsOf(variant, dishes).length === 0

/**
 * A main dish with variants: one card with the main dish's images and description, and each variant under it with its
 * own price and choices. Each variant is ordered (and listed in the order) as a dish of its own.
 */
type GroupProps = {
  dish: MenuDish
  variants: MenuDish[]
  dishes: Map<number, MenuDish>
  selections: Record<number, Selection>
  date: string | undefined
  onChange: (dishId: number, selection: Selection | undefined) => void
}

export function DishGroupCard(props: GroupProps) {
  return useSiteStyle() === 'tiles' ? <DishGroupTile {...props} /> : <PlainDishGroupCard {...props} />
}

function PlainDishGroupCard(props: GroupProps) {
  const { dish, variants, selections } = props
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
        <VariantList {...props} idPrefix={id} />
      </div>
    </article>
  )
}

/** The variants of a main dish, each with its own price and choices. */
function VariantList({ dish, variants, dishes, selections, date, onChange, idPrefix }: GroupProps & { idPrefix: string }) {
  const { t } = useTranslation()
  return (
    <ul className="dish-variants" aria-label={t('order.variantsOf', { name: dish.name })}>
      {variants.map((variant) => (
        <li
          key={variant.id}
          className={`dish-variant${selections[variant.id] ? ' dish-variant--chosen' : ''}${isCompact(variant, dishes) ? ' dish-variant--compact' : ''}`}
        >
          {/* A variant with pictures of its own shows them; without, the card's pictures (the main dish's) stay. */}
          <ImageCarousel images={variant.images} name={variant.name} />
          <DishDetails dish={variant} nameId={`${idPrefix}-${variant.id}`} variant />
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
  )
}

// ---------- The "tiles" style: square tiles side by side, the choices in a dialog ----------

/** Whether adding the dish must first ask the client something: set options, or add-ons/questions they have to settle. */
/** True inside a tile's dialog, where a dish's adjustments are shown open at once instead of behind a toggle. */
const InTileDialog = createContext(false)

function needsDialog(dish: MenuDish, dishes: Map<number, MenuDish>) {
  if (dish.isYesNo) return false
  const options = dish.choiceMode === 'Fixed' && dish.options.length > 1
  const customizable = addOnsOf(dish, dishes).length > 0 || (dish.questions ?? []).length > 0
  return options || !!dish.openByDefault || (customizable && !dish.adjustmentOptional)
}

/** Sent to a tile's element to open its dialog, so the page can show what the client still has to settle there. */
export const OPEN_DISH_DIALOG = 'open-dish-dialog'

/** Opens a tile's dialog when the page asks (see OPEN_DISH_DIALOG). */
function useOpenOnRequest(ref: RefObject<HTMLElement | null>, open: () => void) {
  useEffect(() => {
    const element = ref.current
    element?.addEventListener(OPEN_DISH_DIALOG, open)
    return () => element?.removeEventListener(OPEN_DISH_DIALOG, open)
  }, [ref, open])
}

/** Whether a tap landed on the tile itself and not on one of its own buttons, fields or links, or inside a dialog it opened. */
function tappedTileSurface(event: React.MouseEvent) {
  return !(event.target as HTMLElement).closest('button, a, input, select, textarea, label, .modal-backdrop')
}

function TileIcon({ name }: { name: 'plus' | 'check' }) {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.5l4.5 4.5L19 7.5',
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

/** One picture of a tile's carousel: a dish's or variant's picture, with the variant's name when it has one. */
interface TileSlide {
  src: string | null
  label?: string
}

const SLIDE_MS = 3500

/** The tile's picture: the dish's first image, a carousel through every sub dish for a group, else a plain block. */
function TileMedia({ images, slides, name, children }: { images?: string[]; slides?: TileSlide[]; name: string; children: ReactNode }) {
  const { t } = useTranslation()
  const list: TileSlide[] = slides ?? (images ?? []).slice(0, 1).map((src) => ({ src }))
  const [index, setIndex] = useState(0)
  const many = list.length > 1
  useEffect(() => {
    if (!many || prefersReducedMotion()) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % list.length), SLIDE_MS)
    return () => clearInterval(timer)
  }, [many, list.length])
  const current = list.length > 0 ? index % list.length : 0
  const slide = list[current]
  return (
    <div className={`tile__media${many ? ' tile__media--carousel' : ''}`}>
      {slide?.src ? <img key={slide.src + current} src={slide.src} alt={slide.label ?? name} loading="lazy" /> : <span className="tile__placeholder" aria-hidden="true" />}
      {many && slide?.label && (
        <span className="tile__slide-label" aria-hidden="true">
          {slide.label}
        </span>
      )}
      {many && (
        <span className="tile__dots">
          {list.map((item, i) => (
            <button key={i} type="button" className="tile__dot" aria-label={t('order.showSlide', { name: item.label ?? name })} aria-current={i === current ? 'true' : undefined} onClick={() => setIndex(i)} />
          ))}
        </span>
      )}
      {children}
    </div>
  )
}

/** A small "!" on the picture's corner; pressing it shows which allergens the dish has, without opening the dish. */
function AllergenMark({ text }: { text?: string | null }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  if (!text) return null
  return (
    <span className="tile__allergen" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label={t('order.allergensShow')} aria-expanded={shown} onClick={() => setShown(!shown)}>
        !
      </button>
      {shown && (
        <span className="tile__allergen-text" role="status">
          {t('order.allergens')}: {text}
        </span>
      )}
    </span>
  )
}

/** The picture in a tile's dialog: whole, small, and a press enlarges it to fill the dialog. */
function DialogPicture({ images, name, onZoom }: { images: string[]; name: string; onZoom: () => void }) {
  const { t } = useTranslation()
  if (images.length === 0) return null
  return (
    <button type="button" className="tile-dialog__pic" aria-label={t('order.enlargeImage', { name })} onClick={onZoom}>
      <ImageCarousel images={images} name={name} />
      <span className="tile-dialog__zoom-hint" aria-hidden="true">
        ⤢
      </span>
    </button>
  )
}

/** The enlarged picture: it takes the whole dialog until it is pressed again or the back button is. */
function ZoomedPicture({ images, name, onBack }: { images: string[]; name: string; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <>
      <button type="button" className="tile-dialog__zoomed" aria-label={t('order.shrinkImage')} onClick={onBack}>
        <ImageCarousel images={images} name={name} />
      </button>
      <div className="modal__actions">
        <button type="button" onClick={onBack}>
          {t('order.shrinkImage')}
        </button>
      </div>
    </>
  )
}

function DishTile({ dish, dishes, selection, date, onChange }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(false)
  const articleRef = useRef<HTMLElement>(null)
  useOpenOnRequest(articleRef, () => flushSync(() => setOpen(true)))
  const remaining = remainingOn(dish, date)
  const range = limitedRange(dish, remaining)
  const yesNo = !!dish.isYesNo
  const unavailable = !!dish.isSoldOut || (range.max < range.min && !selection)
  const unitName = unitLabel(dish, t)

  function add() {
    // An open-by-default dish picks its own first choice in the dialog.
    if (!(dish.openByDefault && !yesNo)) onChange(newSelection(dish))
    if (needsDialog(dish, dishes)) setOpen(true)
  }

  // Tapping a tile that is not in the order does nothing: the client presses its add button first. Once it is in the
  // order and has choices to make, tapping it opens them.
  const customizable = needsDialog(dish, dishes) || addOnsOf(dish, dishes).length > 0 || (dish.questions ?? []).length > 0
  const tappable = !unavailable && !!selection && customizable && !yesNo
  function tapped(event: React.MouseEvent) {
    if (!tappable || !tappedTileSurface(event)) return
    setOpen(true)
  }

  return (
    <article
      ref={articleRef}
      className={`dish dish--tile${selection ? ' dish--chosen' : ''}`}
      aria-labelledby={`${id}-name`}
      data-dish-id={selection ? dish.id : undefined}
      onClick={tapped}
      style={tappable ? { cursor: 'pointer' } : undefined}
    >
      <TileMedia images={dish.images} name={dish.name}>
        {dish.isSoldOut ? (
          <p className="badge tile__badge" role="status">
            {t('order.soldOut')}
          </p>
        ) : unavailable ? (
          <p className="badge tile__badge" role="status">
            {t('order.soldOutForDate')}
          </p>
        ) : (
          remaining !== null &&
          remaining > 0 && (
            <p className="badge tile__badge" role="status">
              {t('order.remaining', { amount: `${number.format(remaining)}${unitName ? ` ${unitName}` : ''}` })}
            </p>
          )
        )}
        <AllergenMark text={dish.allergenInfo} />
        {unavailable ? null : !selection ? (
          <button type="button" className="tile__add" aria-label={t('order.addDish', { name: dish.name })} onClick={add}>
            <TileIcon name="plus" />
          </button>
        ) : yesNo ? (
          <button type="button" className="tile__count" aria-label={t('order.removeDish', { name: dish.name })} onClick={() => onChange(undefined)}>
            <TileIcon name="check" />
          </button>
        ) : (
          // Taking the amount down to 0 removes the dish from the order.
          <span className="tile__stepper" onClick={(event) => event.stopPropagation()}>
            <AmountControl
              name={dish.name}
              value={selection.quantity}
              {...range}
              max={Math.max(range.max, range.min)}
              unit={unitName}
              allowZero
              onChange={(quantity) => onChange(quantity <= 0 ? undefined : fitAddOns(dish, { ...selection, quantity }, dishes))}
            />
          </span>
        )}
      </TileMedia>
      <div className="tile__body">
        <h3 id={`${id}-name`}>{dish.name}</h3>
        <p className="dish__price">{priceText(dish, t)}</p>
        {dish.description && <p className="dish__description tile__description">{dish.description}</p>}
      </div>
      {open && (
        <Modal title={dish.name} onClose={() => { setZoom(false); setOpen(false) }} wide>
          {zoom ? (
            <ZoomedPicture images={dish.images} name={dish.name} onBack={() => setZoom(false)} />
          ) : (
            <>
          <div className="tile-dialog__head">
            <DialogPicture images={dish.images} name={dish.name} onZoom={() => setZoom(true)} />
            <div className="tile-dialog__info">
              <p className="dish__price">{priceText(dish, t)}</p>
              {dish.description && <p className="dish__description">{dish.description}</p>}
              {dish.allergenInfo && <p className="dish__allergens">{t('order.allergens')}: {dish.allergenInfo}</p>}
              {remaining !== null && remaining > 0 && (
                <p className="muted">{t('order.remaining', { amount: `${number.format(remaining)}${unitName ? ` ${unitName}` : ''}` })}</p>
              )}
            </div>
          </div>
          <InTileDialog.Provider value>
            <DishChoice dish={dish} dishes={dishes} selection={selection} date={date} onChange={onChange} />
          </InTileDialog.Provider>
          <div className="modal__actions">
            <button type="button" onClick={() => setOpen(false)}>
              {t('order.doneCustomizing')}
            </button>
          </div>
            </>
          )}
        </Modal>
      )}
    </article>
  )
}

/** A main dish with variants as a tile; the variants and their choices are in the dialog it opens. */
/** A group tile's pictures: the main dish's own, then each variant's first one (a variant with none shows its name alone). */
function groupSlides(dish: MenuDish, variants: MenuDish[]): TileSlide[] {
  return [...dish.images.map((src): TileSlide => ({ src })), ...variants.map((v): TileSlide => ({ src: v.images[0] ?? null, label: v.name }))]
}

function DishGroupTile(props: GroupProps) {
  const { dish, variants, selections } = props
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(false)
  const articleRef = useRef<HTMLElement>(null)
  useOpenOnRequest(articleRef, () => flushSync(() => setOpen(true)))
  const count = variants.filter((v) => selections[v.id]).length
  return (
    <article
      ref={articleRef}
      className={`dish dish--tile dish--group${count > 0 ? ' dish--chosen' : ''}`}
      aria-labelledby={`${id}-name`}
      data-variants={variants.map((v) => v.id).join(' ')}
      onClick={(event) => tappedTileSurface(event) && setOpen(true)}
      style={{ cursor: 'pointer' }}
    >
      <TileMedia slides={groupSlides(dish, variants)} name={dish.name}>
        {count > 0 && <p className="badge tile__badge">{t('order.chosenCount', { count })}</p>}
        <AllergenMark text={dish.allergenInfo} />
        <button type="button" className="tile__add" aria-label={t('order.chooseVariant', { name: dish.name })} onClick={() => setOpen(true)}>
          <TileIcon name="plus" />
        </button>
      </TileMedia>
      <div className="tile__body">
        <h3 id={`${id}-name`}>{dish.name}</h3>
        {dish.description && <p className="dish__description tile__description">{dish.description}</p>}
        <p className="muted tile__variants">{variants.map((v) => v.name).join(' · ')}</p>
      </div>
      {open && (
        <Modal title={dish.name} onClose={() => { setZoom(false); setOpen(false) }} wide>
          {zoom ? (
            <ZoomedPicture images={dish.images} name={dish.name} onBack={() => setZoom(false)} />
          ) : (
            <>
          <div className="tile-dialog__head">
            <DialogPicture images={dish.images} name={dish.name} onZoom={() => setZoom(true)} />
            <div className="tile-dialog__info">
              {dish.description && <p className="dish__description">{dish.description}</p>}
              {dish.allergenInfo && <p className="dish__allergens">{t('order.allergens')}: {dish.allergenInfo}</p>}
            </div>
          </div>
          <InTileDialog.Provider value>
            <VariantList {...props} idPrefix={id} />
          </InTileDialog.Provider>
          <div className="modal__actions">
            <button type="button" onClick={() => setOpen(false)}>
              {t('order.doneCustomizing')}
            </button>
          </div>
            </>
          )}
        </Modal>
      )}
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
  const customizable = addOns.length > 0 || questions.length > 0
  const optional = !!dish.adjustmentOptional
  // Each unit is shown open only when there is something to set besides a remark and the client must set it; otherwise
  // the units (or the dish's one remark) wait behind a show/hide button, except for a dish with dietary tags, whose
  // choice of a special version is shown open.
  const inDialog = useContext(InTileDialog)
  const unitsAlwaysShown = customizable && !optional
  const [unitsShown, setUnitsShown] = useState<boolean | null>(null)
  const showUnits = unitsAlwaysShown || inDialog || (unitsShown ?? (!!dish.dietaryTags?.length || units.some((unit) => Object.keys(unit).length > 0)))
  const toggleLabel = t(showUnits ? 'order.hideAdjustments' : 'order.showAdjustments')

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
        <div className="dish__choice" data-dish-id={dish.id}>
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

          {!unitsAlwaysShown && !inDialog && (customizable || !yesNo) && (
            <button
              type="button"
              className="button-quiet adjust-toggle"
              aria-expanded={showUnits}
              aria-label={t('order.toggleAdjustmentsFor', { action: toggleLabel, name: dish.name })}
              onClick={() => setUnitsShown(!showUnits)}
            >
              {toggleLabel}
            </button>
          )}
          {!showUnits ? null : customizable ? (
            <div className="addon-units">
              {units.map((unit, i) => {
                const adjusted = isAdjusted(selection, i, unit)
                const names = Object.keys(unit)
                  .map((addOnId) => dishes.get(Number(addOnId))?.name)
                  .filter(Boolean)
                  .join(', ')
                const status =
                  addOns.length === 0
                    ? ''
                    : names || (adjusted ? t('order.noAdjustments') : optional ? t('order.adjustmentOptional') : t('order.needsAdjustment'))
                const title = units.length > 1 ? t('order.unitN', { n: i + 1, name: dish.name }) : t('order.customize', { name: dish.name })
                const others = units.map((_, k) => k).filter((k) => k !== i)
                const waiting = others.some((k) => !isAdjusted(selection, k, units[k]))
                return (
                  <details key={i} className="addon-unit" open={inDialog || !!dish.dietaryTags?.length || undefined}>
                    <summary className="addon-unit__title">
                      {title}
                      {status && <span className={adjusted || optional ? 'muted' : 'addon-unit__missing'}> · {status}</span>}
                    </summary>
                    <div role="group" aria-label={title} className="stack">
                      <NoteField
                        label={units.length > 1 ? t('order.unitNote', { n: i + 1 }) : t('order.noteFor', { name: dish.name })}
                        value={unitNote(selection, i)}
                        onChange={(note) => onChange(withNote(selection, i, note))}
                      />
                      <QuestionFields
                        questions={questions}
                        dietaryTags={dish.dietaryTags}
                        answers={unitAnswers(selection, i)}
                        onChange={(questionId, answer) => onChange(withAnswer(selection, i, questionId, answer))}
                      />
                      {addOns.length > 0 && (
                        <>
                          <AddOnGroups parent={dish} offers={addOns} dishes={dishes} date={date} selections={unit} onChange={(a, next) => setAddOn(i, a, next)} />
                          <div className="row">
                            {Object.keys(unit).length === 0 && (
                              <button
                                type="button"
                                className="button-quiet"
                                aria-pressed={adjusted}
                                onClick={() => onChange(withConfirmed(selection, i, !unitConfirmed(selection, i)))}
                              >
                                {adjusted ? `✓ ${t('order.confirmedNoAdjustments')}` : t('order.confirmNoAdjustments')}
                              </button>
                            )}
                            {others.length > 0 && (
                              <select
                                aria-label={t('order.copyAddOnsTo', { n: i + 1 })}
                                value=""
                                onChange={(e) =>
                                  e.target.value !== '' &&
                                  onChange(withConfirmed(withUnit(selection, i, { ...units[Number(e.target.value)] }), i, true))
                                }
                              >
                                <option value="">{t('order.copyAddOnsFrom')}</option>
                                {others.map((k) => (
                                  <option key={k} value={k}>
                                    {t('order.unitOption', { n: k + 1 })}
                                  </option>
                                ))}
                              </select>
                            )}
                            {adjusted && waiting && (
                              <button type="button" className="button-quiet" onClick={() => onChange(applyToUnadjusted(dish, selection, i))}>
                                {t('order.applyToRest', { n: i + 1 })}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </details>
                )
              })}
            </div>
          ) : (
            !yesNo && (
              <NoteField label={t('order.noteFor', { name: dish.name })} value={unitNote(selection, 0)} onChange={(note) => onChange(withNote(selection, 0, note))} />
            )
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
  dietaryTags,
  onChange,
}: {
  questions: MenuQuestion[]
  answers: Answers
  /** The dish's dietary tags, in the order of its dietary question's choices, for the icon beside each. */
  dietaryTags?: string[]
  onChange: (questionId: number, answer: Answer) => void
}) {
  if (questions.length === 0) return null
  return (
    <div className="dish-questions">
      {questions.map((q) => (
        <QuestionField key={q.id} question={q} answer={answerOf(q, answers)} dietaryTags={dietaryTags} onChange={(answer) => onChange(q.id, answer)} />
      ))}
    </div>
  )
}

function QuestionField({
  question,
  answer,
  dietaryTags,
  onChange,
}: {
  question: MenuQuestion
  answer: Answer | undefined
  dietaryTags?: string[]
  onChange: (answer: Answer) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const text = typeof answer === 'string' ? answer : ''
  const dietary = question.id === DIETARY_QUESTION_ID
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
  const choices = (kind: 'radio' | 'checkbox', values: { value: string; label: string; icon?: string }[]) => (
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
              {c.icon && <DietaryIcon tag={c.icon} />}
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
      return choices('checkbox', question.choices.map((c, i) => ({ value: c, label: c, icon: dietary ? dietaryTags?.[i] : undefined })))
    case 'SingleChoice':
      // The dietary question is one tag or none: the regular dish is its first radio button, answered with nothing.
      if (dietary)
        return choices('radio', [
          { value: '', label: t('order.regularDish') },
          ...question.choices.map((c, i) => ({ value: c, label: c, icon: dietaryTags?.[i] })),
        ])
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
      <legend>{dish.optionsTitle || t('order.optionFor', { name: dish.name })}</legend>
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
            <span className="option-card__price numeric">{optionPriceText(dish, option)}</span>
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
              {group?.maxUnits != null && (
                <span className="muted">
                  {' '}
                  · {t('order.groupLimit', { max: group.maxUnits })} · {t('order.groupLeft', { count: Math.max(0, room(-1)) })}
                </span>
              )}
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

  // Each unit takes one from the group, a weight takes one whatever its amount. `room` already leaves this add-on's own
  // units out, so it is the most this add-on can reach (adding the current amount again would let it take twice the limit).
  const perUnit = groupUnits(link, addOn, 2) > 1
  const value = selection?.quantity ?? 0
  const max = perUnit ? Math.min(range.max, Math.max(0, room)) : room < 1 && !selection ? 0 : range.max

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
          {link.price !== null && (
            // Always present, so the amount control keeps its place when the first unit brings the price in.
            <span className="numeric muted addon__sum">{selection ? formatMoney(addOnLineTotal(parent, addOn, selection)) : null}</span>
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
