import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { categoriesApi, type Category } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { ConfirmRemove, FieldError, Loading, MoveButtons, Status } from '../ui'
import { fieldErrorsOf, useErrorMessage, useLoad } from '../hooks'

export function CategoriesPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data: categories, setData, failed, reload } = useLoad(categoriesApi.get)
  const [newName, setNewName] = useState('')
  const [addErrors, setAddErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)

  async function act(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setAddErrors({})
    setError(null)
    try {
      const added = await categoriesApi.add(newName)
      setData((current) => [...(current ?? []), added])
      setNewName('')
    } catch (err) {
      setAddErrors(fieldErrorsOf(err))
    }
  }

  return (
    <>
      <h1>{t('admin.categories.title')}</h1>
      {!categories ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          {categories.length === 0 ? (
            <p>{t('admin.categories.empty')}</p>
          ) : (
            <ol className="list">
              {categories.map((category, index) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  first={index === 0}
                  last={index === categories.length - 1}
                  onMove={(direction) => act(async () => setData(await categoriesApi.move(category.id, direction)))}
                  onRename={async (name) => {
                    await categoriesApi.rename(category.id, name)
                    reload()
                  }}
                  onRemove={() =>
                    act(async () => {
                      await categoriesApi.remove(category.id)
                      setData((current) => current && current.filter((c) => c.id !== category.id))
                    })
                  }
                />
              ))}
            </ol>
          )}
          {error && <Status message={error} error />}
          <form onSubmit={handleAdd} className="row row--end">
            <span className="field field--grow">
              <label htmlFor="new-category">{t('admin.categories.newName')}</label>
              <input
                id="new-category"
                value={newName}
                maxLength={60}
                onChange={(e) => setNewName(e.target.value)}
                aria-describedby="new-category-error"
              />
              <FieldError errors={addErrors} field="name" id="new-category-error" />
            </span>
            <button type="submit" disabled={!newName.trim()}>
              {t('admin.add')}
            </button>
          </form>
        </div>
      )}
    </>
  )
}

function CategoryRow({
  category,
  first,
  last,
  onMove,
  onRename,
  onRemove,
}: {
  category: Category
  first: boolean
  last: boolean
  onMove: (direction: 'Up' | 'Down') => void
  onRename: (name: string) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [errors, setErrors] = useState<FieldErrors>({})
  const inputId = `category-${category.id}-name`

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    try {
      await onRename(name)
      setEditing(false)
    } catch (err) {
      setErrors(fieldErrorsOf(err))
    }
  }

  if (editing)
    return (
      <li className="list__row">
        <form onSubmit={handleSave} className="row row--end">
          <span className="field field--grow">
            <label htmlFor={inputId}>{t('admin.categories.name')}</label>
            <input id={inputId} value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} aria-describedby={`${inputId}-error`} />
            <FieldError errors={errors} field="name" id={`${inputId}-error`} />
          </span>
          <button type="submit">{t('admin.save')}</button>
          <button
            type="button"
            className="button-quiet"
            onClick={() => {
              setName(category.name)
              setErrors({})
              setEditing(false)
            }}
          >
            {t('admin.cancel')}
          </button>
        </form>
      </li>
    )

  return (
    <li className="list__row">
      <span className="list__main">
        <strong>{category.name}</strong>
        <span className="muted">{t('admin.categories.dishCount', { count: category.dishCount })}</span>
      </span>
      <span className="row">
        <MoveButtons name={category.name} first={first} last={last} onMove={onMove} />
        <button type="button" className="button-quiet" onClick={() => setEditing(true)}>
          {t('admin.categories.rename')}
        </button>
        <ConfirmRemove name={category.name} onConfirm={onRemove} />
      </span>
    </li>
  )
}
