import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { categoriesApi, dishGroupsApi, dishesApi, type Category, type Dish, type DishGroup } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { ConfirmRemove, FieldError, Info, Loading, MoveButtons, Status } from '../ui'
import { fieldErrorsOf, useErrorMessage, useLoad } from '../hooks'
import { useDirty, useUnsavedChanges } from '../unsaved'

/** The dishes a group can hold: ordered on their own, not removed. */
const groupable = (dish: Dish) => !dish.isHidden && !dish.isAddOnOnly && dish.mainDishId === null

async function loadAll() {
  const [groups, categories, dishes] = await Promise.all([dishGroupsApi.get(), categoriesApi.get(), dishesApi.getAll()])
  return { groups, categories, dishes: dishes.filter(groupable) }
}

export function DishGroupsPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data, setData, failed, reload } = useLoad(loadAll)
  const [error, setError] = useState<string | null>(null)

  async function act(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <span className="with-info">
        <h1>{t('admin.dishGroups.title')}</h1>
        <Info text={t('admin.dishGroups.info')} about={t('admin.dishGroups.title')} />
      </span>
      {!data ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          {data.groups.length === 0 ? (
            <p>{t('admin.dishGroups.empty')}</p>
          ) : (
            <ol className="list">
              {data.groups.map((group, index) => (
                <GroupRow
                  key={group.id}
                  group={group}
                  categories={data.categories}
                  dishes={data.dishes}
                  first={index === 0}
                  last={index === data.groups.length - 1}
                  onMove={(direction) => act(async () => {
                    const groups = await dishGroupsApi.move(group.id, direction)
                    setData((current) => current && { ...current, groups })
                  })}
                  onSave={async (name, dishIds) => {
                    await dishGroupsApi.update(group.id, name, dishIds)
                    reload()
                  }}
                  onRemove={() =>
                    act(async () => {
                      await dishGroupsApi.remove(group.id)
                      setData((current) => current && { ...current, groups: current.groups.filter((g) => g.id !== group.id) })
                    })
                  }
                />
              ))}
            </ol>
          )}
          {error && <Status message={error} error />}
          <section className="stack" aria-labelledby="new-group-title">
            <h2 id="new-group-title">{t('admin.dishGroups.newTitle')}</h2>
            <GroupForm
              idPrefix="new-group"
              categories={data.categories}
              dishes={data.dishes}
              initialName=""
              initialDishIds={[]}
              submitLabel={t('admin.add')}
              resetOnSave
              onSave={async (name, dishIds) => {
                await dishGroupsApi.add(name, dishIds)
                reload()
              }}
            />
          </section>
        </div>
      )}
    </>
  )
}

function GroupRow({
  group,
  categories,
  dishes,
  first,
  last,
  onMove,
  onSave,
  onRemove,
}: {
  group: DishGroup
  categories: Category[]
  dishes: Dish[]
  first: boolean
  last: boolean
  onMove: (direction: 'Up' | 'Down') => void
  onSave: (name: string, dishIds: number[]) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)

  if (editing)
    return (
      <li className="list__row">
        <GroupForm
          idPrefix={`group-${group.id}`}
          categories={categories}
          dishes={dishes}
          initialName={group.name}
          initialDishIds={group.dishIds}
          submitLabel={t('admin.save')}
          onSave={async (name, dishIds) => {
            await onSave(name, dishIds)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )

  return (
    <li className="list__row">
      <span className="list__main">
        <strong>{group.name}</strong>
        <span className="muted">{t('admin.dishGroups.dishCount', { count: group.dishIds.length })}</span>
      </span>
      <span className="row">
        <MoveButtons name={group.name} first={first} last={last} onMove={onMove} />
        <button type="button" className="button-quiet" onClick={() => setEditing(true)} aria-label={`${t('admin.dishGroups.edit')}: ${group.name}`}>
          {t('admin.dishGroups.edit')}
        </button>
        <ConfirmRemove name={group.name} onConfirm={onRemove} />
      </span>
    </li>
  )
}

/** A group's name and the dishes in it, ticked category by category. */
function GroupForm({
  idPrefix,
  categories,
  dishes,
  initialName,
  initialDishIds,
  submitLabel,
  resetOnSave,
  onSave,
  onCancel,
}: {
  idPrefix: string
  categories: Category[]
  dishes: Dish[]
  initialName: string
  initialDishIds: number[]
  submitLabel: string
  resetOnSave?: boolean
  onSave: (name: string, dishIds: number[]) => Promise<void>
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [picked, setPicked] = useState(() => new Set(initialDishIds))
  const [errors, setErrors] = useState<FieldErrors>({})
  const errorMessage = useErrorMessage()
  const [error, setError] = useState<string | null>(null)
  const inputId = `${idPrefix}-name`
  const current = { name, dishIds: [...picked].sort((a, b) => a - b) }
  const { dirty, markSaved } = useDirty(current)
  useUnsavedChanges(dirty, save)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!name.trim()) return false
    setErrors({})
    setError(null)
    try {
      await onSave(name, [...picked])
      if (resetOnSave) {
        setName('')
        setPicked(new Set())
      } else markSaved(current)
      return true
    } catch (err) {
      const fields = fieldErrorsOf(err)
      setErrors(fields)
      if (!fields.name) setError(errorMessage(err))
      return false
    }
  }

  function toggle(id: number, on: boolean) {
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      <span className="field">
        <label htmlFor={inputId}>{t('admin.dishGroups.name')}</label>
        <input id={inputId} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-describedby={`${inputId}-error`} />
        <FieldError errors={errors} field="name" id={`${inputId}-error`} />
      </span>
      <fieldset className="stack">
        <legend>{t('admin.dishGroups.dishes')}</legend>
        {dishes.length === 0 && <p className="muted">{t('admin.dishGroups.noDishes')}</p>}
        {categories.map((category) => {
          const inCategory = dishes.filter((d) => d.categoryId === category.id)
          if (inCategory.length === 0) return null
          return (
            <fieldset key={category.id} className="stack" aria-label={category.name}>
              <strong>{category.name}</strong>
              {inCategory.map((dish) => (
                <label key={dish.id} className="checkbox">
                  <input type="checkbox" checked={picked.has(dish.id)} onChange={(e) => toggle(dish.id, e.target.checked)} />
                  {dish.name}
                </label>
              ))}
            </fieldset>
          )
        })}
        <FieldError errors={errors} field="dishids" id={`${idPrefix}-dishes-error`} />
      </fieldset>
      {error && <Status message={error} error />}
      <span className="row">
        <button type="submit" disabled={!name.trim()}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="button-quiet" onClick={onCancel}>
            {t('admin.cancel')}
          </button>
        )}
      </span>
    </form>
  )
}
