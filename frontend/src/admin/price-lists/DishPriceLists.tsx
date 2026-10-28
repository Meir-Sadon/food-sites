import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import { linkedLists, priceListsApi, type ListDish } from '../../api/priceLists'
import { Modal } from '../../components/Modal'
import { fieldErrorsOf, useFormErrorMessage } from '../hooks'
import { Loading, Status } from '../ui'
import { useListName } from './PriceListsPage'
import { LinkedListsQuestion, PriceRowFields } from './priceRow'
import { inputOf, pricesChanged, rowOf, type Row } from './priceRowModel'

/** The dish form's "price lists" button: a window with the dish's row in every list (the regular prices read only). */
export function DishPriceListsButton({ dishId, dishName }: { dishId: number; dishName: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <span className="row">
        <button type="button" className="button-quiet" onClick={() => setOpen(true)}>
          {t('admin.priceLists.dishButton')}
        </button>
      </span>
      {open && <DishPriceLists dishId={dishId} dishName={dishName} onClose={() => setOpen(false)} />}
    </>
  )
}

function DishPriceLists({ dishId, dishName, onClose }: { dishId: number; dishName: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [data, setData] = useState<ListDish[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    priceListsApi.dish(dishId).then(
      (rows) => active && setData(rows),
      () => active && setFailed(true),
    )
    return () => {
      active = false
    }
  }, [dishId])

  return (
    <Modal title={t('admin.priceLists.dishTitle', { name: dishName })} onClose={onClose} wide closeButton>
      {!data ? <Loading failed={failed} /> : <DishPriceListsForm rows={data} onSaved={setData} />}
    </Modal>
  )
}

function DishPriceListsForm({ rows: saved, onSaved }: { rows: ListDish[]; onSaved: (rows: ListDish[]) => void }) {
  const { t } = useTranslation()
  const nameOf = useListName()
  const formError = useFormErrorMessage()
  const [rows, setRows] = useState<Row[]>(() => saved.map((r) => rowOf(r.dish)))
  const [errors, setErrors] = useState<Record<number, FieldErrors>>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [asking, setAsking] = useState(false)
  const lists = saved.map((r) => r.list)
  // The regular prices are the dish form's own fields, so the default list is shown, not edited, here.
  const changed = saved.map((r, i) => !r.list.isDefault && JSON.stringify(rows[i]) !== JSON.stringify(rowOf(r.dish)))
  const linked = saved
    .filter((r, i) => changed[i] && pricesChanged(rows[i], rowOf(r.dish)))
    .flatMap((r) => linkedLists(r.list, lists))
  const linkedNames = [...new Set(linked.map(nameOf))]

  function submit() {
    if (linkedNames.length > 0) setAsking(true)
    else void save(false)
  }

  async function save(updateLinked: boolean) {
    setAsking(false)
    setErrors({})
    setError(null)
    setDone(false)
    // Base lists first, so a list's own change wins over the update from its base.
    const order = saved.map((_, i) => i).filter((i) => changed[i]).sort((a, b) => Number(saved[a].list.baseListId !== null) - Number(saved[b].list.baseListId !== null))
    for (const i of order) {
      try {
        await priceListsApi.saveDishes(saved[i].list.id, [inputOf(rows[i], false)], updateLinked)
      } catch (err) {
        setErrors({ [i]: fieldErrorsOf(err) })
        setError(`${nameOf(saved[i].list)}: ${formError(err)}`)
        return
      }
    }
    const fresh = await priceListsApi.dish(saved[0].dish.dishId)
    setRows(fresh.map((r) => rowOf(r.dish)))
    onSaved(fresh)
    setDone(true)
  }

  return (
    <div className="stack">
      <p className="hint">{t('admin.priceLists.dishHint')}</p>
      <ul className="price-list-dishes">
        {saved.map((r, i) => (
          <PriceRowFields
            key={r.list.id}
            list={r.list}
            dish={r.dish}
            row={rows[i]}
            onChange={(row) => {
              setDone(false)
              setRows((current) => current.map((x, j) => (j === i ? row : x)))
            }}
            errors={errors[i] ?? {}}
            field="dishes[0]"
            idPrefix={`dpl-${r.list.id}`}
            heading={{ title: nameOf(r.list), showImage: false }}
            readOnly={r.list.isDefault}
          />
        ))}
      </ul>
      {error && <Status message={error} error />}
      {done && <Status message={t('admin.saved')} />}
      <span className="row">
        <button type="button" onClick={submit} disabled={!changed.some(Boolean)}>
          {t('admin.priceLists.saveDish')}
        </button>
      </span>
      {asking && <LinkedListsQuestion names={linkedNames} onAnswer={(updateLinked) => void save(updateLinked)} onCancel={() => setAsking(false)} />}
    </div>
  )
}
