import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import { categoriesApi, type Category } from '../../api/catalog'
import { linkedLists, priceListsApi, type PriceList, type PriceListDish, type PriceListStatuses } from '../../api/priceLists'
import { BADGE_NEW_UNITS, type BadgeNewUnit } from '../../api/site'
import { FieldError, Info, Loading, Section, Status } from '../ui'
import { SectionGroup, SectionSlot } from '../sectionGroup'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage } from '../hooks'
import { useDirty, useUnsavedChanges } from '../unsaved'
import { PriceListForm, useListName } from './PriceListsPage'
import { LinkedListsQuestion, PriceRowFields } from './priceRow'
import { inputOf, pricesChanged, rowOf, type Row } from './priceRowModel'

interface Loaded {
  lists: PriceList[]
  dishes: PriceListDish[]
  categories: Category[]
}

/** One price list: its name and base, the phones and statuses it is for, and its dishes' prices and dates. */
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

  const update = (saved: PriceList) =>
    setData((current) => current && { ...current, lists: current.lists.map((l) => (l.id === saved.id ? saved : l)) })

  return (
    <SectionGroup>
      <p>
        <Link to="/admin/price-lists">{t('admin.priceLists.back')}</Link>
      </p>
      {!data ? (
        <Loading failed={failed} />
      ) : !list ? (
        <Status message={t('errors.notFound')} error />
      ) : (
        <>
          <h1>{nameOf(list)}</h1>
          {list.isDefault ? (
            <p className="hint">{t('admin.priceLists.defaultHint')}</p>
          ) : (
            <>
              <SectionSlot>
                <Section title={t('admin.priceLists.general')}>
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
                </Section>
              </SectionSlot>
              <SectionSlot>
                <Section title={t('admin.priceLists.assignment')} hint={t('admin.priceLists.assignmentHint')}>
                  <PhonesForm list={list} onSaved={update} />
                  <StatusesForm list={list} onSaved={update} />
                </Section>
              </SectionSlot>
            </>
          )}
          <DishesSections
            key={`${list.id}-${list.baseListId}`}
            list={list}
            lists={data.lists}
            dishes={data.dishes}
            categories={data.categories}
            onSaved={(dishes) => setData((current) => current && { ...current, dishes })}
          />
        </>
      )}
    </SectionGroup>
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
        <h3 id="price-list-phones">{t('admin.priceLists.phones')}</h3>
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

interface StatusFields {
  newClients: boolean
  newClientsAmount: string
  newClientsUnit: BadgeNewUnit
  noOrders: boolean
  midOrder: boolean
  openOrder: boolean
  openOrderAbove: string
}

const fieldsOf = (s: PriceListStatuses): StatusFields => ({
  newClients: s.newClientsAmount !== null,
  newClientsAmount: String(s.newClientsAmount ?? 1),
  newClientsUnit: s.newClientsUnit ?? 'week',
  noOrders: s.noOrders,
  midOrder: s.midOrder,
  openOrder: s.openOrderAbove !== null,
  openOrderAbove: s.openOrderAbove === null ? '' : String(s.openOrderAbove),
})

const statusesOf = (f: StatusFields): PriceListStatuses => ({
  newClientsAmount: f.newClients ? Number(f.newClientsAmount) : null,
  newClientsUnit: f.newClients ? f.newClientsUnit : null,
  noOrders: f.noOrders,
  midOrder: f.midOrder,
  openOrderAbove: f.openOrder ? Number(f.openOrderAbove) : null,
})

/** The clients the list is for by what they are doing: new on the site, no orders yet, mid-order, an open order above an amount. */
function StatusesForm({ list, onSaved }: { list: PriceList; onSaved: (list: PriceList) => void }) {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const [fields, setFields] = useState(() => fieldsOf(list.statuses))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { dirty, markSaved } = useDirty(fields)
  useUnsavedChanges(dirty, save)
  const set = (patch: Partial<StatusFields>) => {
    setSaved(false)
    setFields((current) => ({ ...current, ...patch }))
  }

  async function save() {
    setErrors({})
    setError(null)
    setSaved(false)
    try {
      const result = await priceListsApi.saveStatuses(list.id, statusesOf(fields))
      const next = fieldsOf(result.statuses)
      setFields(next)
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

  return (
    <section className="stack" aria-labelledby="price-list-statuses">
      <span className="with-info">
        <h3 id="price-list-statuses">{t('admin.priceLists.statuses')}</h3>
        <Info text={t('admin.priceLists.statusesHint')} about={t('admin.priceLists.statuses')} />
      </span>
      <label className="checkbox">
        <input type="checkbox" checked={fields.newClients} onChange={(e) => set({ newClients: e.target.checked })} />
        {t('admin.priceLists.newClients')}
      </label>
      {fields.newClients && (
        <div className="row">
          <span className="field field--narrow">
            <label htmlFor="price-list-new-amount">{t('admin.priceLists.newClientsAmount')}</label>
            <input id="price-list-new-amount" type="number" min={1} max={365} inputMode="numeric" value={fields.newClientsAmount}
              onChange={(e) => set({ newClientsAmount: e.target.value })} aria-describedby="price-list-new-amount-error" />
            <FieldError errors={errors} field="newClientsAmount" id="price-list-new-amount-error" />
          </span>
          <span className="field field--narrow">
            <label htmlFor="price-list-new-unit">{t('admin.priceLists.newClientsUnit')}</label>
            <select id="price-list-new-unit" value={fields.newClientsUnit} onChange={(e) => set({ newClientsUnit: e.target.value as BadgeNewUnit })}>
              {BADGE_NEW_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {t(`admin.settings.badges.units.${unit}`)}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={fields.noOrders} onChange={(e) => set({ noOrders: e.target.checked })} />
        {t('admin.priceLists.noOrders')}
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={fields.midOrder} onChange={(e) => set({ midOrder: e.target.checked })} />
        {t('admin.priceLists.midOrder')}
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={fields.openOrder} onChange={(e) => set({ openOrder: e.target.checked })} />
        {t('admin.priceLists.openOrder')}
      </label>
      {fields.openOrder && (
        <span className="field field--narrow">
          <label htmlFor="price-list-open-above">{t('admin.priceLists.openOrderAbove')}</label>
          <input id="price-list-open-above" type="number" min={0} step="any" inputMode="decimal" value={fields.openOrderAbove}
            onChange={(e) => set({ openOrderAbove: e.target.value })} aria-describedby="price-list-open-above-error" />
          <FieldError errors={errors} field="openOrderAbove" id="price-list-open-above-error" />
        </span>
      )}
      {error && <Status message={error} error />}
      {saved && <Status message={t('admin.saved')} />}
      <span className="row">
        <button type="button" onClick={() => void save()}>
          {t('admin.priceLists.saveStatuses')}
        </button>
      </span>
    </section>
  )
}

/** Every dish's prices in the list, a foldable block per category that saves on its own. */
function DishesSections({
  list,
  lists,
  dishes,
  categories,
  onSaved,
}: {
  list: PriceList
  lists: PriceList[]
  dishes: PriceListDish[]
  categories: Category[]
  onSaved: (dishes: PriceListDish[]) => void
}) {
  const { t } = useTranslation()
  const byCategory = categories
    .map((category) => ({ category, dishes: dishes.filter((d) => d.categoryId === category.id) }))
    .filter((g) => g.dishes.length > 0)
  if (byCategory.length === 0) return <p className="muted">{t('admin.priceLists.noDishes')}</p>
  return byCategory.map(({ category, dishes: own }) => (
    <SectionSlot key={category.id}>
      <CategoryPrices list={list} lists={lists} category={category} dishes={own} onSaved={onSaved} />
    </SectionSlot>
  ))
}

/** One category's dishes in the list. In the default list only the regular prices are edited. */
function CategoryPrices({
  list,
  lists,
  category,
  dishes,
  onSaved,
}: {
  list: PriceList
  lists: PriceList[]
  category: Category
  dishes: PriceListDish[]
  onSaved: (dishes: PriceListDish[]) => void
}) {
  const { t } = useTranslation()
  const nameOf = useListName()
  const formError = useFormErrorMessage()
  const [saved, setSavedDishes] = useState(dishes)
  const [rows, setRows] = useState(() => dishes.map(rowOf))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [asking, setAsking] = useState(false)
  const { dirty, markSaved } = useDirty(rows)
  useUnsavedChanges(dirty, () => save(false))
  const linked = linkedLists(list, lists)

  function set(index: number, row: Row) {
    setDone(false)
    setRows((current) => current.map((r, i) => (i === index ? row : r)))
  }

  function submit() {
    const changed = rows.some((row, i) => pricesChanged(row, rowOf(saved[i])))
    if (linked.length > 0 && changed) setAsking(true)
    else void save(false)
  }

  async function save(updateLinked: boolean) {
    setAsking(false)
    setErrors({})
    setError(null)
    setDone(false)
    try {
      const result = await priceListsApi.saveDishes(list.id, rows.map((r) => inputOf(r, list.isDefault)), updateLinked)
      const own = saved.map((d) => result.find((r) => r.dishId === d.dishId) ?? d)
      const next = own.map(rowOf)
      setSavedDishes(own)
      setRows(next)
      markSaved(next)
      onSaved(result)
      setDone(true)
      return true
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
      return false
    }
  }

  return (
    <Section title={category.name} hint={t(list.isDefault ? 'admin.priceLists.defaultDishesHint' : 'admin.priceLists.dishesHint')}>
      <ul className="price-list-dishes">
        {saved.map((dish, i) => (
          <PriceRowFields
            key={dish.dishId}
            list={list}
            dish={dish}
            row={rows[i]}
            onChange={(row) => set(i, row)}
            errors={errors}
            field={`dishes[${i}]`}
            idPrefix={`pl-${dish.dishId}`}
            heading={{ title: dish.name, imageUrl: dish.imageUrl, showImage: true }}
          />
        ))}
      </ul>
      {error && <Status message={error} error />}
      {done && <Status message={t('admin.saved')} />}
      <span className="row">
        <button type="button" onClick={submit}>
          {t('admin.priceLists.saveDishes')}
        </button>
      </span>
      {asking && (
        <LinkedListsQuestion names={linked.map(nameOf)} onAnswer={(updateLinked) => void save(updateLinked)} onCancel={() => setAsking(false)} />
      )}
    </Section>
  )
}
