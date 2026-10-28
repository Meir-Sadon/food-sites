import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import { categoriesApi, type Category } from '../../api/catalog'
import { priceListsApi, type PriceList, type PriceListDish } from '../../api/priceLists'
import { FieldError, Info, Loading, Status } from '../ui'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage } from '../hooks'
import { useDirty, useUnsavedChanges } from '../unsaved'
import { PriceListForm, useListName } from './PriceListsPage'

interface Loaded {
  lists: PriceList[]
  dishes: PriceListDish[]
  categories: Category[]
}

/** One price list: its name and base, the phones it is for, and its dishes' prices and dates. */
export function PriceListPage() {
  const { t } = useTranslation()
  const nameOf = useListName()
  const id = Number(useParams().id)
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([priceListsApi.getAll(), priceListsApi.dishes(id), categoriesApi.get()])
      .then(([lists, dishes, categories]) => active && setData({ lists, dishes, categories }))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [id])

  const list = data?.lists.find((l) => l.id === id)

  return (
    <>
      <p>
        <Link to="/admin/price-lists">{t('admin.priceLists.back')}</Link>
      </p>
      {!data ? (
        <Loading failed={failed} />
      ) : !list ? (
        <Status message={t('errors.notFound')} error />
      ) : (
        <div className="stack">
          <h1>{nameOf(list)}</h1>
          {list.isDefault ? (
            <p className="hint">{t('admin.priceLists.defaultHint')}</p>
          ) : (
            <>
              <PriceListForm
                key={`${list.id}-${list.baseListId}`}
                idPrefix="price-list"
                lists={data.lists}
                selfId={list.id}
                initialName={list.name ?? ''}
                initialBaseId={list.baseListId}
                submitLabel={t('admin.save')}
                onSave={async (name, baseListId) => {
                  const saved = await priceListsApi.update(list.id, name, baseListId)
                  // A new base copied its prices, so the dishes are loaded again.
                  const dishes = saved.baseListId !== list.baseListId ? await priceListsApi.dishes(list.id) : data.dishes
                  setData((current) => current && { ...current, dishes, lists: current.lists.map((l) => (l.id === saved.id ? saved : l)) })
                }}
              />
              <PhonesForm
                list={list}
                onSaved={(saved) => setData((current) => current && { ...current, lists: current.lists.map((l) => (l.id === saved.id ? saved : l)) })}
              />
            </>
          )}
          <DishesForm
            key={`${list.id}-${list.baseListId}`}
            list={list}
            dishes={data.dishes}
            categories={data.categories}
            onSaved={(dishes) => setData((current) => current && { ...current, dishes })}
          />
        </div>
      )}
    </>
  )
}

/** The phones the list is for, one per line (or separated by commas). */
function PhonesForm({ list, onSaved }: { list: PriceList; onSaved: (list: PriceList) => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [text, setText] = useState(list.phones.join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const phones = text.split(/[\n,]/).map((p) => p.trim()).filter(Boolean)
  const { dirty, markSaved } = useDirty(phones)
  useUnsavedChanges(dirty, save)

  async function save() {
    setError(null)
    setSaved(false)
    try {
      const result = await priceListsApi.savePhones(list.id, phones)
      setText(result.phones.join('\n'))
      markSaved(result.phones)
      onSaved(result)
      setSaved(true)
      return true
    } catch (err) {
      const fields = fieldErrorsOf(err)
      const bad = Object.keys(fields).map((key) => /^phones\[(\d+)\]$/.exec(key)?.[1]).find((i) => i !== undefined)
      setError(bad !== undefined ? t('admin.priceLists.badPhone', { phone: phones[Number(bad)] }) : errorMessage(err))
      return false
    }
  }

  return (
    <section className="stack" aria-labelledby="price-list-phones">
      <span className="with-info">
        <h2 id="price-list-phones">{t('admin.priceLists.phones')}</h2>
        <Info text={t('admin.priceLists.phonesHint')} about={t('admin.priceLists.phones')} />
      </span>
      <span className="field">
        <label htmlFor="price-list-phones-text">{t('admin.priceLists.phonesLabel')}</label>
        <textarea id="price-list-phones-text" rows={4} dir="ltr" value={text} onChange={(e) => setText(e.target.value)} />
      </span>
      {error && <Status message={error} error />}
      {saved && <Status message={t('admin.saved')} />}
      <span className="row">
        <button type="button" onClick={() => void save()}>
          {t('admin.priceLists.savePhones')}
        </button>
      </span>
    </section>
  )
}

interface Row {
  dishId: number
  basePrice: string
  price: string
  from: string
  to: string
}

const rowOf = (d: PriceListDish): Row => ({
  dishId: d.dishId,
  basePrice: String(d.basePrice),
  price: String(d.price),
  from: d.from ?? '',
  to: d.to ?? '',
})

/** Every dish's prices in the list, category by category. In the default list only the regular price is edited. */
function DishesForm({
  list,
  dishes,
  categories,
  onSaved,
}: {
  list: PriceList
  dishes: PriceListDish[]
  categories: Category[]
  onSaved: (dishes: PriceListDish[]) => void
}) {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const [rows, setRows] = useState(() => dishes.map(rowOf))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { dirty, markSaved } = useDirty(rows)
  useUnsavedChanges(dirty, save)

  function set(index: number, patch: Partial<Row>) {
    setSaved(false)
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row
        // Changing the base price of a dish whose price followed it moves the price too, so it is no discount.
        const follows = patch.basePrice !== undefined && row.price === row.basePrice
        return { ...row, ...patch, ...(follows && { price: patch.basePrice }) }
      }),
    )
  }

  async function save() {
    setErrors({})
    setError(null)
    setSaved(false)
    try {
      const result = await priceListsApi.saveDishes(
        list.id,
        rows.map((r) => ({
          dishId: r.dishId,
          basePrice: Number(list.isDefault ? r.price : r.basePrice),
          price: Number(r.price),
          from: list.isDefault ? null : r.from || null,
          to: list.isDefault ? null : r.to || null,
        })),
      )
      const next = result.map(rowOf)
      setRows(next)
      markSaved(next)
      onSaved(result)
      setSaved(true)
      return true
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
      return false
    }
  }

  const byCategory = categories
    .map((c) => ({ category: c, indexes: dishes.map((d, i) => (d.categoryId === c.id ? i : -1)).filter((i) => i >= 0) }))
    .filter((g) => g.indexes.length > 0)

  return (
    <section className="stack" aria-labelledby="price-list-dishes">
      <span className="with-info">
        <h2 id="price-list-dishes">{t('admin.priceLists.dishes')}</h2>
        <Info text={t(list.isDefault ? 'admin.priceLists.defaultDishesHint' : 'admin.priceLists.dishesHint')} about={t('admin.priceLists.dishes')} />
      </span>
      {dishes.length === 0 && <p className="muted">{t('admin.priceLists.noDishes')}</p>}
      {byCategory.map(({ category, indexes }) => (
        <fieldset key={category.id} className="stack">
          <legend>{category.name}</legend>
          <ul className="price-list-dishes">
            {indexes.map((i) => {
              const dish = dishes[i]
              const row = rows[i]
              const field = (name: string) => `dishes[${i}].${name}`
              const discount = !list.isDefault && Number(row.price) < Number(row.basePrice)
              return (
                <li key={dish.dishId} className="price-list-dish">
                  <span className="price-list-dish__head">
                    {dish.imageUrl ? <img src={dish.imageUrl} alt="" className="price-list-dish__image" /> : <span className="price-list-dish__image" />}
                    <strong>{dish.name}</strong>
                    {discount && <span className="price-list-dish__tag">{t('admin.priceLists.discount')}</span>}
                    {!dish.inList && <span className="muted">{t('admin.priceLists.notSaved')}</span>}
                  </span>
                  <span className="row row--end">
                    {!list.isDefault && (
                      <PriceField id={`pl-${dish.dishId}-base`} label={t('admin.priceLists.basePrice')} value={row.basePrice}
                        onChange={(basePrice) => set(i, { basePrice })} errors={errors} field={field('basePrice')} />
                    )}
                    <PriceField id={`pl-${dish.dishId}-price`} label={t(list.isDefault ? 'admin.priceLists.regularPrice' : 'admin.priceLists.listPrice')}
                      value={row.price} onChange={(price) => set(i, { price })} errors={errors} field={field('price')} />
                    {!list.isDefault && (
                      <>
                        <span className="field field--narrow">
                          <label htmlFor={`pl-${dish.dishId}-from`}>{t('admin.priceLists.from')}</label>
                          <input id={`pl-${dish.dishId}-from`} type="date" value={row.from} onChange={(e) => set(i, { from: e.target.value })} />
                        </span>
                        <span className="field field--narrow">
                          <label htmlFor={`pl-${dish.dishId}-to`}>{t('admin.priceLists.to')}</label>
                          <input id={`pl-${dish.dishId}-to`} type="date" value={row.to} onChange={(e) => set(i, { to: e.target.value })}
                            aria-describedby={`pl-${dish.dishId}-to-error`} />
                          <FieldError errors={errors} field={field('to')} id={`pl-${dish.dishId}-to-error`} />
                        </span>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </fieldset>
      ))}
      {error && <Status message={error} error />}
      {saved && <Status message={t('admin.saved')} />}
      {dishes.length > 0 && (
        <span className="row">
          <button type="button" onClick={() => void save()}>
            {t('admin.priceLists.saveDishes')}
          </button>
        </span>
      )}
    </section>
  )
}

function PriceField({ id, label, value, onChange, errors, field }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  errors: FieldErrors
  field: string
}) {
  return (
    <span className="field field--narrow">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="decimal" min="0" step="any" value={value} onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-error`} />
      <FieldError errors={errors} field={field} id={`${id}-error`} />
    </span>
  )
}
