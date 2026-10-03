import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  DESCRIPTION_MAX_LENGTH,
  categoriesApi,
  dishesApi,
  type Category,
  type ChoiceMode,
  type Dish,
  type DishInput,
  type SellBy,
} from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { FieldError, Loading, Status } from '../ui'
import { fieldErrorsOf, useFormErrorMessage } from '../hooks'
import { DishImagesSection } from './DishImagesSection'

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
  isAddOnOnly: boolean
  isSoldOut: boolean
  options: OptionForm[]
  parentDishIds: number[]
}

let nextKey = 1
const str = (value: number | null) => (value === null ? '' : String(value))
const num = (value: string) => (value.trim() === '' ? null : Number(value))

const emptyOption = (isDefault: boolean): OptionForm => ({ key: nextKey++, id: null, label: '', amount: '1', price: '', isDefault })

function toForm(dish: Dish | null, categories: Category[]): DishForm {
  if (!dish)
    return {
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
      isAddOnOnly: false,
      isSoldOut: false,
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
    isAddOnOnly: dish.isAddOnOnly,
    isSoldOut: dish.isSoldOut,
    options: dish.options.length
      ? dish.options.map((o) => ({ key: nextKey++, id: o.id, label: o.label, amount: String(o.amount), price: String(o.price), isDefault: o.isDefault }))
      : [emptyOption(true)],
    parentDishIds: dish.parentDishIds,
  }
}

function toInput(form: DishForm): DishInput {
  const fixed = form.choiceMode === 'Fixed'
  return {
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
    isAddOnOnly: form.isAddOnOnly,
    isSoldOut: form.isSoldOut,
    options: fixed
      ? form.options.map((o) => ({ id: o.id, label: o.label, amount: num(o.amount) ?? 0, price: num(o.price) ?? 0, isDefault: o.isDefault }))
      : [],
    parentDishIds: form.parentDishIds,
  }
}

export function DishFormPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const dishId = id ? Number(id) : null
  const location = useLocation()
  const navigate = useNavigate()
  const errorMessage = useFormErrorMessage()

  const [categories, setCategories] = useState<Category[] | null>(null)
  const [allDishes, setAllDishes] = useState<Dish[] | null>(null)
  const [dish, setDish] = useState<Dish | null>(null)
  const [form, setForm] = useState<DishForm | null>(null)
  const [failed, setFailed] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(
    (location.state as { created?: boolean } | null)?.created ? { message: t('admin.dishes.createdSaved') } : null,
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([categoriesApi.get(), dishesApi.getAll()])
      .then(([c, all]) => {
        const current = dishId === null ? null : (all.find((d) => d.id === dishId) ?? null)
        if (dishId !== null && !current) throw new Error('not found')
        setCategories(c)
        setAllDishes(all)
        setDish(current)
        setForm(toForm(current, c))
      })
      .catch(() => setFailed(true))
  }, [dishId])

  if (!categories || !allDishes || !form) return <Loading failed={failed} />

  const set = (patch: Partial<DishForm>) => setForm({ ...form, ...patch })
  const setOption = (key: number, patch: Partial<OptionForm>) =>
    set({
      options: form.options.map((o) =>
        o.key === key ? { ...o, ...patch } : patch.isDefault ? { ...o, isDefault: false } : o,
      ),
    })

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setErrors({})
    setStatus(null)
    try {
      const input = toInput(form)
      if (dishId === null) {
        const created = await dishesApi.create(input)
        navigate(`/admin/dishes/${created.id}`, { replace: true, state: { created: true } })
        return
      }
      const saved = await dishesApi.update(dishId, input)
      setDish(saved)
      setForm(toForm(saved, categories!))
      setStatus({ message: t('admin.saved') })
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setStatus({ message: errorMessage(err), error: true })
    } finally {
      setSaving(false)
    }
  }

  const err = (field: string) => ({ 'aria-describedby': `dish-${field}-error` })
  const fieldError = (field: string) => <FieldError errors={errors} field={field} id={`dish-${field}-error`} />
  const weight = form.sellBy === 'Weight'
  const parentCandidates = allDishes.filter((d) => !d.isHidden && !d.isAddOnOnly && d.id !== dishId)

  return (
    <>
      <p>
        <Link to="/admin/dishes">{t('admin.dishes.back')}</Link>
      </p>
      <h1>{dishId === null ? t('admin.dishes.new') : `${t('admin.dishes.editTitle')}: ${dish?.name}`}</h1>

      <form onSubmit={handleSubmit} className="stack dish-form" noValidate>
        <span className="field">
          <label htmlFor="dish-name">{t('admin.dishes.name')}</label>
          <input id="dish-name" required maxLength={100} value={form.name} onChange={(e) => set({ name: e.target.value })} {...err('name')} />
          {fieldError('name')}
        </span>

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

        <span className="field">
          <label htmlFor="dish-description">{t('admin.dishes.description')}</label>
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
          </fieldset>
        ) : (
          <fieldset className="row row--end">
            <legend>{t(weight ? 'admin.dishes.amountWeight' : 'admin.dishes.amountUnits')}</legend>
            {(
              [
                ['minAmount', 'admin.dishes.min'],
                ['maxAmount', 'admin.dishes.max'],
                ['amountStep', 'admin.dishes.step'],
                ['unitPrice', weight ? 'admin.dishes.kiloPrice' : 'admin.dishes.unitPrice'],
              ] as const
            ).map(([field, label]) => (
              <span key={field} className="field field--narrow">
                <label htmlFor={`dish-${field}`}>{t(label)}</label>
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
        )}

        <label className="checkbox">
          <input type="checkbox" checked={form.isAddOnOnly} onChange={(e) => set({ isAddOnOnly: e.target.checked })} {...err('isAddOnOnly')} />
          {t('admin.dishes.addOnOnlyLabel')}
        </label>
        {fieldError('isAddOnOnly')}
        <label className="checkbox">
          <input type="checkbox" checked={form.isSoldOut} onChange={(e) => set({ isSoldOut: e.target.checked })} />
          {t('admin.dishes.soldOutLabel')}
        </label>

        <fieldset className="stack" aria-describedby="dish-parents-hint dish-parentDishIds-error">
          <legend>{t('admin.dishes.parents')}</legend>
          <p id="dish-parents-hint" className="hint">
            {t('admin.dishes.parentsHint')}
          </p>
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
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
          {fieldError('parentDishIds')}
        </fieldset>

        <div className="row form-actions">
          <button type="submit" disabled={saving}>
            {saving ? t('admin.saving') : t('admin.save')}
          </button>
          {status && <Status message={status.message} error={status.error} />}
        </div>
      </form>

      {dish ? <DishImagesSection dish={dish} onChange={setDish} /> : <p className="hint">{t('admin.dishes.imagesAfterSave')}</p>}
    </>
  )
}
