import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  DESCRIPTION_MAX_LENGTH,
  UNIT_NAME_MAX_LENGTH,
  categoriesApi,
  DIETARY_TAGS,
  dishesApi,
  type Category,
  type DietaryTag,
  type ChoiceMode,
  type Dish,
  type DishInput,
  type SellBy,
} from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { FieldError, FormBlock, Info, Loading, Status } from '../ui'
import { fieldErrorsOf, useFormErrorMessage } from '../hooks'
import { useDirty, useUnsavedChanges } from '../unsaved'
import { DishImagesSection } from './DishImagesSection'
import { useToast } from '../../components/toast'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { useFeature } from '../../site/useSite'
import { AddOnsSection } from './AddOnsSection'
import { formKey, type AddOnForm, type GroupForm } from './addOnForm'
import { QuestionsSection } from './QuestionsSection'
import { questionsForm, questionsInput, type QuestionForm } from './questionForm'

interface OptionForm {
  key: number
  id: number | null
  label: string
  amount: string
  price: string
  isDefault: boolean
}

interface DishForm {
  name: string
  categoryId: string
  description: string
  allergenInfo: string
  sellBy: SellBy
  choiceMode: ChoiceMode
  minAmount: string
  maxAmount: string
  amountStep: string
  unitPrice: string
  unitName: string
  optionsTitle: string
  showOptionDifference: boolean
  dietaryTags: DietaryTag[]
  dietaryTagsSingle: boolean
  isAddOnOnly: boolean
  isSoldOut: boolean
  openByDefault: boolean
  isSideDish: boolean
  onSale: boolean
  maxPerSupplyDate: string
  options: OptionForm[]
  parentDishIds: number[]
  /** '' for a dish of its own, else the main dish's id. */
  mainDishId: string
  useMainDishPrice: boolean
  isYesNo: boolean
  adjustmentOptional: boolean
  groups: GroupForm[]
  addOns: AddOnForm[]
  questions: QuestionForm[]
}

let nextKey = 1
const str = (value: number | null) => (value === null ? '' : String(value))
const num = (value: string) => (value.trim() === '' ? null : Number(value))

const emptyOption = (isDefault: boolean): OptionForm => ({ key: nextKey++, id: null, label: '', amount: '1', price: '', isDefault })

function toForm(dish: Dish | null, categories: Category[], main: Dish | null = null): DishForm {
  if (!dish)
    return {
      mainDishId: main ? String(main.id) : '',
      useMainDishPrice: !!main,
      isYesNo: false,
      adjustmentOptional: true,
      groups: [],
      addOns: [],
      questions: [],
      name: '',
      categoryId: String(categories[0]?.id ?? ''),
      description: '',
      allergenInfo: '',
      sellBy: 'Units',
      choiceMode: 'Fixed',
      minAmount: '',
      maxAmount: '',
      amountStep: '',
      unitPrice: '',
      unitName: '',
      optionsTitle: '',
      showOptionDifference: false,
      dietaryTags: [],
      dietaryTagsSingle: false,
      isAddOnOnly: false,
      isSoldOut: false,
      openByDefault: false,
      isSideDish: false,
      onSale: false,
      maxPerSupplyDate: '',
      options: [emptyOption(true)],
      parentDishIds: [],
    }
  return {
    name: dish.name,
    categoryId: String(dish.categoryId),
    description: dish.description ?? '',
    allergenInfo: dish.allergenInfo ?? '',
    sellBy: dish.sellBy,
    choiceMode: dish.choiceMode,
    minAmount: str(dish.minAmount),
    maxAmount: str(dish.maxAmount),
    amountStep: str(dish.amountStep),
    unitPrice: str(dish.unitPrice),
    unitName: dish.unitName ?? '',
    optionsTitle: dish.optionsTitle ?? '',
    showOptionDifference: dish.showOptionDifference,
    dietaryTags: dish.dietaryTags ?? [],
    dietaryTagsSingle: dish.dietaryTagsSingle ?? false,
    isAddOnOnly: dish.isAddOnOnly,
    isSoldOut: dish.isSoldOut,
    openByDefault: dish.openByDefault,
    isSideDish: dish.isSideDish,
    onSale: dish.onSale ?? false,
    maxPerSupplyDate: str(dish.maxPerSupplyDate),
    options: dish.options.length
      ? dish.options.map((o) => ({ key: nextKey++, id: o.id, label: o.label, amount: String(o.amount), price: String(o.price), isDefault: o.isDefault }))
      : [emptyOption(true)],
    parentDishIds: dish.parentDishIds,
    ...addOnsForm(dish),
    questions: questionsForm(dish.questions),
  }
}

/**
 * A new dish with every detail of another, ready to change and save. Nothing keeps an id, so saving creates its own
 * options, add-on groups and questions; its name says it is a copy.
 */
function copyForm(source: Dish, categories: Category[], name: string): DishForm {
  const form = toForm(source, categories)
  const groups = form.groups.map((g) => ({ ...g, id: null }))
  return {
    ...form,
    name,
    options: form.options.map((o) => ({ ...o, id: null })),
    groups,
    questions: questionsForm(source.questions, true),
  }
}

function addOnsForm(dish: Dish): Pick<DishForm, 'mainDishId' | 'useMainDishPrice' | 'isYesNo' | 'adjustmentOptional' | 'groups' | 'addOns'> {
  const groups = dish.addOnGroups.map((g) => ({ key: formKey(), id: g.id, name: g.name, maxUnits: str(g.maxUnits) }))
  return {
    mainDishId: dish.mainDishId === null ? '' : String(dish.mainDishId),
    useMainDishPrice: dish.useMainDishPrice,
    isYesNo: dish.isYesNo,
    adjustmentOptional: dish.adjustmentOptional,
    groups,
    addOns: dish.addOns.map((a) => ({
      key: formKey(),
      dishId: a.dishId,
      groupKey: groups[dish.addOnGroups.findIndex((g) => g.id === a.groupId)]?.key ?? null,
      price: str(a.price),
      maxQuantity: str(a.maxQuantity),
      isCheckbox: a.isCheckbox,
    })),
  }
}

/** With advanced dishes on, the dish's own add-ons are sent too; else they stay as they are. */
function toInput(form: DishForm, advanced: boolean): DishInput {
  const fixed = form.choiceMode === 'Fixed'
  const own = advanced
    ? {
        addOnGroups: form.groups.map((g) => ({ id: g.id, name: g.name, maxUnits: num(g.maxUnits) })),
        addOns: form.isAddOnOnly
          ? []
          : form.addOns.map((a) => ({
              dishId: a.dishId,
              group: a.groupKey === null ? null : form.groups.findIndex((g) => g.key === a.groupKey),
              price: num(a.price),
              maxQuantity: a.isCheckbox ? null : num(a.maxQuantity),
              isCheckbox: a.isCheckbox,
            })),
      }
    : {}
  return {
    ...own,
    mainDishId: form.mainDishId === '' ? null : Number(form.mainDishId),
    useMainDishPrice: form.mainDishId !== '' && form.useMainDishPrice,
    isYesNo: form.isYesNo,
    adjustmentOptional: form.mainDishId === '' && form.adjustmentOptional,
    name: form.name,
    categoryId: Number(form.categoryId),
    description: form.description || null,
    allergenInfo: form.allergenInfo || null,
    sellBy: form.sellBy,
    choiceMode: form.choiceMode,
    minAmount: fixed ? null : num(form.minAmount),
    maxAmount: fixed ? null : num(form.maxAmount),
    amountStep: fixed ? null : num(form.amountStep),
    unitPrice: fixed ? null : num(form.unitPrice),
    unitName: fixed ? null : form.unitName.trim() || null,
    optionsTitle: fixed ? form.optionsTitle.trim() || null : null,
    showOptionDifference: fixed && form.options.length > 1 && form.showOptionDifference,
    isAddOnOnly: form.isAddOnOnly,
    isSoldOut: form.isSoldOut,
    openByDefault: form.openByDefault,
    isSideDish: form.isSideDish,
    onSale: form.onSale,
    maxPerSupplyDate: num(form.maxPerSupplyDate),
    options: fixed
      ? form.options.map((o) => ({ id: o.id, label: o.label, amount: num(o.amount) ?? 0, price: num(o.price) ?? 0, isDefault: o.isDefault }))
      : [],
    parentDishIds: form.parentDishIds,
    dietaryTags: form.dietaryTags,
    dietaryTagsSingle: form.dietaryTags.length > 1 && form.dietaryTagsSingle,
    questions: questionsInput(form.questions),
  }
}

export function DishFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const dishId = id ? Number(id) : null
  const navigate = useNavigate()
  const errorMessage = useFormErrorMessage()
  const toast = useToast()
  const { saved, flash } = useSavedFlash()
  const advanced = useFeature('advancedDishes')
  const [search] = useSearchParams()
  const mainParam = search.get('main')
  const copyParam = dishId === null ? search.get('copy') : null

  const [categories, setCategories] = useState<Category[] | null>(null)
  const [allDishes, setAllDishes] = useState<Dish[] | null>(null)
  const [dish, setDish] = useState<Dish | null>(null)
  const [form, setForm] = useState<DishForm | null>(null)
  const [failed, setFailed] = useState(false)
  /** The dish this new one copies, when it is a copy. */
  const [source, setSource] = useState<Dish | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** Orders still to be supplied that this save would change; set while the admin decides. */
  const [affected, setAffected] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([categoriesApi.get(), dishesApi.getAll()])
      .then(([c, all]) => {
        const current = dishId === null ? null : (all.find((d) => d.id === dishId) ?? null)
        if (dishId !== null && !current) throw new Error('not found')
        setCategories(c)
        setAllDishes(all)
        setDish(current)
        const main = current === null && mainParam ? (all.find((d) => d.id === Number(mainParam)) ?? null) : null
        const copied = copyParam ? (all.find((d) => d.id === Number(copyParam) && !d.isHidden) ?? null) : null
        if (copyParam && !copied) throw new Error('not found')
        setSource(copied)
        setForm(copied ? copyForm(copied, c, t('admin.dishes.copyName', { name: copied.name })) : toForm(current, c, main))
      })
      .catch(() => setFailed(true))
  }, [dishId, mainParam, copyParam, t])

  const { dirty, markSaved } = useDirty(form)
  useUnsavedChanges(dirty, saveChecked)

  if (!categories || !allDishes || !form) return <Loading failed={failed} />

  const set = (patch: Partial<DishForm>) => setForm({ ...form, ...patch })
  const setOption = (key: number, patch: Partial<OptionForm>) =>
    set({
      options: form.options.map((o) =>
        o.key === key ? { ...o, ...patch } : patch.isDefault ? { ...o, isDefault: false } : o,
      ),
    })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void saveChecked()
  }

  /** Saves unless the dish is in orders not yet supplied: that needs the admin's go-ahead first (false then). */
  async function saveChecked(): Promise<boolean> {
    if (!form) return false
    if (dishId !== null) {
      const count = await dishesApi.affectedOrders(dishId).then((r) => r.count, () => 0)
      if (count > 0) {
        setAffected(count)
        return false
      }
    }
    return save()
  }

  async function save(): Promise<boolean> {
    if (!form) return false
    setAffected(null)
    setSaving(true)
    setErrors({})
    setError(null)
    try {
      // A copy takes every detail of its dish, even ones the form shows only with advanced dishes on.
      const input = toInput(form, advanced || source !== null)
      if (dishId === null) {
        const created = await dishesApi.create(source ? { ...input, copyImagesFrom: source.id } : input)
        toast(t('admin.dishes.createdSaved'))
        markSaved(form)
        navigate(`/admin/dishes/${created.id}`, { replace: true })
        return true
      }
      const result = await dishesApi.update(dishId, input)
      const next = toForm(result, categories!)
      setDish(result)
      setForm(next)
      markSaved(next)
      flash()
      return true
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  const err = (field: string) => ({ 'aria-describedby': `dish-${field}-error` })
  const fieldError = (field: string) => <FieldError errors={errors} field={field} id={`dish-${field}-error`} />
  const weight = form.sellBy === 'Weight'
  const unitName = form.unitName.trim()
  // Removed dishes this one is still linked under stay listed (marked), so the link can be taken off.
  const parentCandidates = allDishes.filter(
    (d) => d.id !== dishId && (d.isHidden ? form.parentDishIds.includes(d.id) : !d.isAddOnOnly),
  )
  const variants = dishId === null ? [] : allDishes.filter((d) => d.mainDishId === dishId && !d.isHidden)
  const mainCandidates = allDishes.filter((d) => !d.isHidden && !d.isAddOnOnly && d.mainDishId === null && d.id !== dishId)
  const isVariant = form.mainDishId !== ''
  const ownPrice = !(isVariant && form.useMainDishPrice)
  const mainDish = isVariant ? allDishes.find((d) => d.id === Number(form.mainDishId)) : undefined
  const inheritedAddOns = (mainDish?.addOns ?? [])
    .filter((a) => !form.addOns.some((own) => own.dishId === a.dishId))
    .map((a) => allDishes.find((d) => d.id === a.dishId)?.name)
    .filter((name): name is string => !!name)
  const addOnCandidates = allDishes.filter((d) => !d.isHidden && d.id !== dishId)
  // Dishes that offer this one among their own add-ons: set up on their forms, so not ticked here.
  const parentLinks = allDishes
    .filter((d) => dishId !== null && !d.isHidden && d.addOnDishIds.includes(dishId) && !form.parentDishIds.includes(d.id) && !(dish?.parentDishIds ?? []).includes(d.id))
    .map((d) => d.name)
  const inheritedQuestions = (mainDish?.questions ?? []).map((q) => q.text)
  /** Whether a field under one of these names (or lists, like `options[0].price`) failed validation. */
  const invalid = (...names: string[]) =>
    Object.keys(errors).some((key) => names.some((name) => key === name.toLowerCase() || key.startsWith(`${name.toLowerCase()}[`)))

  return (
    <>
      <p>
        <Link to="/admin/dishes">{t('admin.dishes.back')}</Link>
      </p>
      <h1>
        {source
          ? t('admin.dishes.copyTitle', { name: source.name })
          : dishId === null
            ? t('admin.dishes.new')
            : `${t('admin.dishes.editTitle')}: ${dish?.name}`}
      </h1>
      {source && <p className="hint">{t('admin.dishes.copyHint', { name: source.name })}</p>}
      {dish && !dish.isHidden && (
        <p>
          <Link className="button-quiet" to={`/admin/dishes/new?copy=${dish.id}`}>
            {t('admin.dishes.copy')}
          </Link>
        </p>
      )}

      <form onSubmit={handleSubmit} className="stack dish-form" noValidate>
        <FormBlock
          title={t('admin.dishes.blocks.basics')}
          about={t('admin.dishes.blocks.basicsAbout')}
          defaultOpen
          invalid={invalid('name', 'mainDishId', 'categoryId', 'description', 'allergenInfo')}
        >
        <span className="field">
          <label htmlFor="dish-name">{t('admin.dishes.name')}</label>
          <input id="dish-name" required maxLength={100} value={form.name} onChange={(e) => set({ name: e.target.value })} {...err('name')} />
          {fieldError('name')}
        </span>

        {(advanced || isVariant) && variants.length === 0 && (
          <span className="field">
            <span className="with-info">
              <label htmlFor="dish-mainDishId">{t('admin.dishes.variantOf')}</label>
              <Info text={t('admin.dishes.variantOfHint')} about={t('admin.dishes.variantOf')} />
            </span>
            <select
              id="dish-mainDishId"
              value={form.mainDishId}
              onChange={(e) => set({ mainDishId: e.target.value })}
              aria-describedby="dish-mainDishId-error"
            >
              <option value="">{t('admin.dishes.variantOfNone')}</option>
              {categories.map((category) => {
                const inCategory = mainCandidates.filter((d) => d.categoryId === category.id)
                return inCategory.length === 0 ? null : (
                  <optgroup key={category.id} label={category.name}>
                    {inCategory.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
            {fieldError('mainDishId')}
          </span>
        )}

        {isVariant ? (
          <p className="hint">{t('admin.dishes.variantCategory')}</p>
        ) : (
          <span className="field">
            <label htmlFor="dish-category">{t('admin.dishes.category')}</label>
            <select id="dish-category" value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })} {...err('categoryId')}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldError('categoryId')}
          </span>
        )}

        {variants.length > 0 && (
          <section className="stack" aria-labelledby="dish-variants-title">
            <div className="with-info">
              <h2 id="dish-variants-title">{t('admin.dishes.variants')}</h2>
              <Info text={t('admin.dishes.variantsHint')} about={t('admin.dishes.variants')} />
            </div>
            <ul>
              {variants.map((v) => (
                <li key={v.id}>
                  <Link to={`/admin/dishes/${v.id}`}>{v.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {advanced && dishId !== null && !isVariant && !form.isAddOnOnly && (
          <p>
            <Link to={`/admin/dishes/new?main=${dishId}`}>{t('admin.dishes.addVariant')}</Link>
          </p>
        )}

        <span className="field">
          {isVariant ? (
            <span className="with-info">
              <label htmlFor="dish-description">{t('admin.dishes.description')}</label>
              <Info text={t('admin.dishes.variantDescriptionHint')} about={t('admin.dishes.description')} />
            </span>
          ) : (
            <label htmlFor="dish-description">{t('admin.dishes.description')}</label>
          )}
          <textarea
            id="dish-description"
            rows={3}
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            aria-describedby="dish-description-count dish-description-error"
          />
          <span id="dish-description-count" className="hint">
            {t('admin.dishes.charsLeft', { count: DESCRIPTION_MAX_LENGTH - form.description.length })}
          </span>
          {fieldError('description')}
        </span>

        <span className="field">
          <label htmlFor="dish-allergens">{t('admin.dishes.allergens')}</label>
          <textarea id="dish-allergens" rows={2} maxLength={500} value={form.allergenInfo} onChange={(e) => set({ allergenInfo: e.target.value })} {...err('allergenInfo')} />
          {fieldError('allergenInfo')}
        </span>
        </FormBlock>

        <FormBlock
          title={t('admin.dishes.blocks.price')}
          about={t('admin.dishes.blocks.priceAbout')}
          invalid={invalid('useMainDishPrice', 'sellBy', 'choiceMode', 'options', 'optionsTitle', 'unitName', 'minAmount', 'maxAmount', 'amountStep', 'unitPrice')}
        >
        {isVariant && (
          <label className="checkbox">
            <input type="checkbox" checked={form.useMainDishPrice} onChange={(e) => set({ useMainDishPrice: e.target.checked })} {...err('useMainDishPrice')} />
            {t('admin.dishes.useMainDishPrice')}
          </label>
        )}
        {fieldError('useMainDishPrice')}

        {ownPrice && (
        <>
        <fieldset className="row">
          <legend>{t('admin.dishes.sellBy')}</legend>
          {(['Units', 'Weight'] as const).map((value) => (
            <label key={value} className="checkbox">
              <input type="radio" name="sellBy" value={value} checked={form.sellBy === value} onChange={() => set({ sellBy: value })} />
              {t(value === 'Units' ? 'admin.dishes.units' : 'admin.dishes.weight')}
            </label>
          ))}
        </fieldset>

        <fieldset className="row">
          <legend>{t('admin.dishes.choiceMode')}</legend>
          {(['Fixed', 'Free'] as const).map((value) => (
            <label key={value} className="checkbox">
              <input type="radio" name="choiceMode" value={value} checked={form.choiceMode === value} onChange={() => set({ choiceMode: value })} />
              {t(value === 'Fixed' ? 'admin.dishes.fixed' : 'admin.dishes.free')}
            </label>
          ))}
        </fieldset>

        {form.choiceMode === 'Fixed' ? (
          <fieldset className="stack" aria-describedby="dish-options-error">
            <legend>{t('admin.dishes.options')}</legend>
            <span className="field">
              <span className="with-info">
                <label htmlFor="dish-optionsTitle">{t('admin.dishes.optionsTitle')}</label>
                <Info text={t('admin.dishes.optionsTitleHint')} about={t('admin.dishes.optionsTitle')} />
              </span>
              <input
                id="dish-optionsTitle"
                maxLength={50}
                value={form.optionsTitle}
                onChange={(e) => set({ optionsTitle: e.target.value })}
                aria-describedby="dish-optionsTitle-error"
              />
              {fieldError('optionsTitle')}
            </span>
            {form.options.map((option, index) => {
              const n = index + 1
              const field = (name: string) => `options[${index}].${name}`
              return (
                <div key={option.key} className="option-row" role="group" aria-label={t('admin.dishes.optionN', { n })}>
                  <span className="field field--grow">
                    <label htmlFor={`option-${option.key}-label`}>{t('admin.dishes.optionLabel')}</label>
                    <input id={`option-${option.key}-label`} maxLength={50} value={option.label} onChange={(e) => setOption(option.key, { label: e.target.value })} {...err(field('label'))} />
                    {fieldError(field('label'))}
                  </span>
                  <span className="field field--narrow">
                    <label htmlFor={`option-${option.key}-amount`}>{t(weight ? 'admin.dishes.amountWeight' : 'admin.dishes.amountUnits')}</label>
                    <input id={`option-${option.key}-amount`} type="number" inputMode="decimal" min="0" step="any" value={option.amount} onChange={(e) => setOption(option.key, { amount: e.target.value })} {...err(field('amount'))} />
                    {fieldError(field('amount'))}
                  </span>
                  <span className="field field--narrow">
                    <label htmlFor={`option-${option.key}-price`}>{t('admin.dishes.price')}</label>
                    <input id={`option-${option.key}-price`} type="number" inputMode="decimal" min="0" step="any" value={option.price} onChange={(e) => setOption(option.key, { price: e.target.value })} {...err(field('price'))} />
                    {fieldError(field('price'))}
                  </span>
                  {form.options.length > 1 && (
                    <>
                      <label className="checkbox">
                        <input type="radio" name="defaultOption" checked={option.isDefault} onChange={() => setOption(option.key, { isDefault: true })} />
                        {t('admin.dishes.default')}
                      </label>
                      <button
                        type="button"
                        className="button-quiet"
                        aria-label={t('admin.dishes.removeOption', { n })}
                        onClick={() => {
                          const rest = form.options.filter((o) => o.key !== option.key)
                          if (option.isDefault) rest[0] = { ...rest[0], isDefault: true }
                          set({ options: rest })
                        }}
                      >
                        {t('admin.remove')}
                      </button>
                    </>
                  )}
                </div>
              )
            })}
            {fieldError('options')}
            <button type="button" className="button-quiet" onClick={() => set({ options: [...form.options, emptyOption(false)] })}>
              {t('admin.dishes.addOption')}
            </button>
            {form.options.length > 1 && (
              <span className="with-info">
                <label className="checkbox">
                  <input type="checkbox" checked={form.showOptionDifference} onChange={(e) => set({ showOptionDifference: e.target.checked })} />
                  {t('admin.dishes.showOptionDifference')}
                </label>
                <Info text={t('admin.dishes.showOptionDifferenceHint')} about={t('admin.dishes.showOptionDifference')} />
              </span>
            )}
          </fieldset>
        ) : (
          <>
            <span className="field">
              <span className="with-info">
                <label htmlFor="dish-unitName">{t('admin.dishes.unitName')}</label>
                <Info text={t('admin.dishes.unitNameHint')} about={t('admin.dishes.unitName')} />
              </span>
              <input
                id="dish-unitName"
                maxLength={UNIT_NAME_MAX_LENGTH}
                placeholder={t(weight ? 'order.kilo' : 'admin.dishes.unit')}
                value={form.unitName}
                onChange={(e) => set({ unitName: e.target.value })}
                aria-describedby="dish-unitName-error"
              />
              {fieldError('unitName')}
            </span>
            <fieldset className="row row--end">
              <legend>
                {unitName
                  ? t('admin.dishes.amountNamed', { unit: unitName })
                  : t(weight ? 'admin.dishes.amountWeight' : 'admin.dishes.amountUnits')}
              </legend>
              {(
                [
                  ['minAmount', t('admin.dishes.min')],
                  ['maxAmount', t('admin.dishes.max')],
                  ['amountStep', t('admin.dishes.step')],
                  [
                    'unitPrice',
                    unitName
                      ? t('admin.dishes.namedUnitPrice', { unit: unitName })
                      : t(weight ? 'admin.dishes.kiloPrice' : 'admin.dishes.unitPrice'),
                  ],
                ] as const
              ).map(([field, label]) => (
                <span key={field} className="field field--narrow">
                  <label htmlFor={`dish-${field}`}>{label}</label>
                  <input
                    id={`dish-${field}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={weight || field === 'unitPrice' ? 'any' : '1'}
                    value={form[field]}
                    onChange={(e) => set({ [field]: e.target.value })}
                    {...err(field)}
                  />
                  {fieldError(field)}
                </span>
              ))}
            </fieldset>
          </>
        )}
        </>
        )}
        </FormBlock>

        <FormBlock
          title={t('admin.dishes.blocks.availability')}
          about={t('admin.dishes.blocks.availabilityAbout')}
          invalid={invalid('isAddOnOnly', 'isYesNo', 'isSoldOut', 'isSideDish', 'openByDefault', 'maxPerSupplyDate')}
        >
        {!isVariant && (
          <>
            <label className="checkbox">
              <input type="checkbox" checked={form.isAddOnOnly} onChange={(e) => set({ isAddOnOnly: e.target.checked })} {...err('isAddOnOnly')} />
              {t('admin.dishes.addOnOnlyLabel')}
            </label>
          </>
        )}
        {fieldError('isAddOnOnly')}
        {(advanced || form.isYesNo) && (
          <label className="checkbox">
            <input type="checkbox" checked={form.isYesNo} onChange={(e) => set({ isYesNo: e.target.checked })} />
            {t('admin.dishes.yesNoLabel')}
          </label>
        )}
        {(advanced || form.adjustmentOptional) && form.mainDishId === '' && (
          <span className="with-info">
            <label className="checkbox">
              <input type="checkbox" checked={form.adjustmentOptional} onChange={(e) => set({ adjustmentOptional: e.target.checked })} />
              {t('admin.dishes.adjustmentOptionalLabel')}
            </label>
            <Info text={t('admin.dishes.adjustmentOptionalHint')} about={t('admin.dishes.adjustmentOptionalLabel')} />
          </span>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={form.isSoldOut} onChange={(e) => set({ isSoldOut: e.target.checked })} />
          {t('admin.dishes.soldOutLabel')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={form.onSale} onChange={(e) => set({ onSale: e.target.checked })} />
          {t('admin.dishes.onSaleLabel')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={form.isSideDish} onChange={(e) => set({ isSideDish: e.target.checked })} />
          {t('admin.dishes.sideDishLabel')}
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={form.openByDefault} onChange={(e) => set({ openByDefault: e.target.checked })} />
          {t('admin.dishes.openByDefaultLabel')}
        </label>

        <span className="field field--narrow">
          <span className="with-info">
            <label htmlFor="dish-maxPerSupplyDate">{t(weight ? 'admin.dishes.maxPerSupplyDateWeight' : 'admin.dishes.maxPerSupplyDate')}</label>
            <Info text={t('admin.dishes.maxPerSupplyDateHint')} about={t(weight ? 'admin.dishes.maxPerSupplyDateWeight' : 'admin.dishes.maxPerSupplyDate')} />
          </span>
          <input
            id="dish-maxPerSupplyDate"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={form.maxPerSupplyDate}
            onChange={(e) => set({ maxPerSupplyDate: e.target.value })}
            aria-describedby="dish-maxPerSupplyDate-error"
          />
          {fieldError('maxPerSupplyDate')}
        </span>
        </FormBlock>

        <FormBlock title={t('admin.dishes.blocks.dietary')} about={t('admin.dishes.blocks.dietaryAbout')} invalid={invalid('dietaryTags')}>
          <fieldset className="row dietary-options" aria-label={t('admin.dishes.blocks.dietary')}>
            {DIETARY_TAGS.map((tag) => (
              <label key={tag} className="checkbox">
                <input
                  type="checkbox"
                  checked={form.dietaryTags.includes(tag)}
                  onChange={(e) => set({ dietaryTags: e.target.checked ? [...form.dietaryTags, tag] : form.dietaryTags.filter((x) => x !== tag) })}
                />
                {t(`dietaryTags.${tag}`)}
              </label>
            ))}
          </fieldset>
          {form.dietaryTags.length > 1 && (
            <span className="with-info">
              <label className="checkbox">
                <input type="checkbox" checked={form.dietaryTagsSingle} onChange={(e) => set({ dietaryTagsSingle: e.target.checked })} />
                {t('admin.dishes.dietarySingle')}
              </label>
              <Info text={t('admin.dishes.dietarySingleHint')} about={t('admin.dishes.dietarySingle')} />
            </span>
          )}
          {fieldError('dietaryTags')}
        </FormBlock>

        <FormBlock title={t('admin.dishes.blocks.parents')} about={t('admin.dishes.blocks.parentsAbout')} invalid={invalid('parentDishIds')}>
        <fieldset className="stack" aria-labelledby="dish-parents-title" aria-describedby="dish-parentDishIds-error">
          <legend className="with-info">
            <span id="dish-parents-title">{t('admin.dishes.parents')}</span>
            <Info text={t('admin.dishes.parentsHint')} about={t('admin.dishes.parents')} />
          </legend>
          {parentLinks.length > 0 && <p className="hint">{t('admin.dishes.parentLinks', { names: parentLinks.join(', ') })}</p>}
          {parentCandidates.length === 0 && <p>{t('admin.dishes.noParents')}</p>}
          {categories.map((category) => {
            const inCategory = parentCandidates.filter((d) => d.categoryId === category.id)
            if (!inCategory.length) return null
            return (
              <div key={category.id} className="parent-group">
                <span className="muted">{category.name}</span>
                <div className="row">
                  {inCategory.map((d) => (
                    <label key={d.id} className="checkbox">
                      <input
                        type="checkbox"
                        checked={form.parentDishIds.includes(d.id)}
                        onChange={(e) =>
                          set({
                            parentDishIds: e.target.checked
                              ? [...form.parentDishIds, d.id]
                              : form.parentDishIds.filter((p) => p !== d.id),
                          })
                        }
                      />
                      {d.name}
                      {d.isHidden && ` (${t('admin.dishes.removedTag')})`}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
          {fieldError('parentDishIds')}
        </fieldset>
        </FormBlock>

        {(inheritedAddOns.length > 0 || (advanced && !form.isAddOnOnly)) && (
        <FormBlock title={t('admin.dishes.blocks.addOns')} about={t('admin.dishes.blocks.addOnsAbout')} invalid={invalid('addOns', 'addOnGroups')}>
        {inheritedAddOns.length > 0 && (
          <p className="hint">{t('admin.dishes.inheritedAddOns', { names: inheritedAddOns.join(', ') })}</p>
        )}
        {advanced && !form.isAddOnOnly && (
          <AddOnsSection
            groups={form.groups}
            addOns={form.addOns}
            candidates={addOnCandidates}
            allDishes={allDishes}
            categories={categories}
            errors={errors}
            onChange={(patch) => set(patch)}
          />
        )}
        </FormBlock>
        )}

        <FormBlock title={t('admin.dishes.blocks.questions')} about={t('admin.dishes.blocks.questionsAbout')} invalid={invalid('questions')}>
        <QuestionsSection questions={form.questions} inherited={inheritedQuestions} errors={errors} onChange={(questions) => set({ questions })} />
        </FormBlock>

        <div className="row form-actions">
          <button type="submit" disabled={saving}>
            {saving ? t('admin.saving') : t('admin.save')}
          </button>
          <SavedNote show={saved} />
          {error && <Status message={error} error />}
        </div>

        {affected !== null && (
          <div className="warning" role="alert">
            <p>{t('admin.dishes.saveWarning', { count: affected })}</p>
            <div className="row">
              <button type="button" onClick={() => void save()}>
                {t('admin.dishes.saveAnyway')}
              </button>
              <button type="button" className="button-quiet" onClick={() => setAffected(null)}>
                {t('admin.cancel')}
              </button>
            </div>
          </div>
        )}
      </form>

      {isVariant && <p className="hint">{t('admin.dishes.variantImages')}</p>}
      {dish ? (
        <DishImagesSection dish={dish} onChange={setDish} />
      ) : source && source.images.length > 0 ? null : (
        <p className="hint">{t('admin.dishes.imagesAfterSave')}</p>
      )}
    </>
  )
}
