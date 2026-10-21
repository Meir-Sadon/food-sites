import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IMAGE_TYPES, MAX_DISH_IMAGES, MAX_IMAGE_BYTES, categoriesApi, dishesApi, type Category, type Dish } from '../../api/catalog'
import { Modal } from '../../components/Modal'
import { normalizeSearchText, scoreDish, SEARCH_MIN_LENGTH } from '../../order/search'
import { BadgesSection } from '../settings/BadgesSection'
import { ConfirmRemove, DragHandle, Info, Loading, MoveButtons, Status } from '../ui'
import { moved, useDragSort } from '../sortable'
import { useErrorMessage } from '../hooks'
import { priceSummary } from '../format'

export function DishesPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [dishes, setDishes] = useState<Dish[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [generalOpen, setGeneralOpen] = useState(false)
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    Promise.all([categoriesApi.get(), dishesApi.getAll()])
      .then(([c, d]) => {
        setCategories(c)
        setDishes(d)
      })
      .catch(() => setFailed(true))
  }, [])

  async function act(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const replace = (dish: Dish) => setDishes((current) => current && current.map((d) => (d.id === dish.id ? dish : d)))
  const patch = (id: number, change: Partial<Dish>) =>
    setDishes((current) => current && current.map((d) => (d.id === id ? { ...d, ...change } : d)))

  // Shows the new order at once; the saved list replaces it, or the old one comes back with an error.
  function reorder(categoryId: number, ids: number[]) {
    const before = dishes
    setDishes((current) => current && current.map((d) => (d.categoryId === categoryId && ids.includes(d.id) ? { ...d, displayOrder: ids.indexOf(d.id) } : d)))
    void act(async () => {
      try {
        setDishes(await dishesApi.reorder(categoryId, ids))
      } catch (err) {
        setDishes(before)
        throw err
      }
    })
  }

  if (!categories || !dishes) return <Loading failed={failed} />

  const searching = normalizeSearchText(query).length >= SEARCH_MIN_LENGTH
  const visible = dishes
    .filter((d) => !d.isHidden)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
  // While searching, only matching dishes stay and the categories holding them open by themselves.
  const shown = searching ? visible.filter((d) => scoreDish(query, d) > 0) : visible
  const categoryIds = categories.filter((c) => visible.some((d) => d.categoryId === c.id)).map((c) => c.id)
  const allOpen = categoryIds.length > 0 && categoryIds.every((id) => opened.has(id))
  const toggleCategory = (id: number) =>
    setOpened((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const removed = dishes.filter((d) => d.isHidden)

  return (
    <>
      <div className="row row--between">
        <div className="with-info">
          <h1>{t('admin.dishes.title')}</h1>
          {visible.length > 1 && <Info text={t('admin.dishes.orderHint')} about={t('admin.dishes.title')} />}
        </div>
        {categories.length > 0 && (
          <Link className="button-link" to="/admin/dishes/new">
            {t('admin.dishes.new')}
          </Link>
        )}
      </div>
      {categories.length === 0 && <p>{t('admin.dishes.needCategory')}</p>}
      {categories.length > 0 && visible.length === 0 && <p>{t('admin.dishes.empty')}</p>}
      {error && <Status message={error} error />}

      {visible.length > 0 && (
        <div className="row dishes-tools">
          <div className="dish-search" role="search">
            <label className="visually-hidden" htmlFor="admin-dish-search">
              {t('admin.dishes.search.label')}
            </label>
            <input
              id="admin-dish-search"
              type="search"
              autoComplete="off"
              value={query}
              placeholder={t('admin.dishes.search.placeholder')}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" className="dish-search__clear" aria-label={t('order.search.clear')} onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </div>
          {!searching && categoryIds.length > 1 && (
            <button type="button" className="button-quiet" onClick={() => setOpened(allOpen ? new Set() : new Set(categoryIds))}>
              {allOpen ? t('admin.dishes.closeAll') : t('admin.dishes.openAll')}
            </button>
          )}
        </div>
      )}
      {searching && shown.length === 0 && <p role="status">{t('admin.dishes.search.none')}</p>}

      {categories.map((category) => {
        const inCategory = shown.filter((d) => d.categoryId === category.id)
        if (inCategory.length === 0) return null
        return (
          <CategoryDishes
            key={category.id}
            category={category}
            dishes={inCategory}
            open={searching || opened.has(category.id)}
            onToggle={() => toggleCategory(category.id)}
            canToggle={!searching}
            onReorder={(ids) => reorder(category.id, ids)}
          >
            {(dish) => (
              <>
              <span className="list__main">
                <DishThumb dish={dish} onChange={replace} onError={setError} />
                <Link to={`/admin/dishes/${dish.id}`}>
                  <strong>{dish.name}</strong>
                </Link>
                <span className="muted">{priceSummary(dish, t)}</span>
                {dish.isAddOnOnly && <span className="badge">{t('admin.dishes.addOnOnly')}</span>}
              </span>
              <span className="row">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={dish.isSoldOut}
                    onChange={(e) => {
                      // Show the change at once; undo it if saving fails.
                      const isSoldOut = e.target.checked
                      patch(dish.id, { isSoldOut })
                      void act(async () => {
                        try {
                          await dishesApi.setSoldOut(dish.id, isSoldOut)
                        } catch (err) {
                          patch(dish.id, { isSoldOut: !isSoldOut })
                          throw err
                        }
                      })
                    }}
                  />
                  {t('admin.dishes.soldOut')}
                </label>
                <Link className="button-quiet" to={`/admin/dishes/${dish.id}`} aria-label={`${t('admin.edit')}: ${dish.name}`}>
                  {t('admin.edit')}
                </Link>
                <Link className="button-quiet" to={`/admin/dishes/new?copy=${dish.id}`} aria-label={`${t('admin.dishes.copy')}: ${dish.name}`}>
                  {t('admin.dishes.copyShort')}
                </Link>
                <ConfirmRemove
                  name={dish.name}
                  warn={async () => {
                    const { count } = await dishesApi.affectedOrders(dish.id)
                    return count > 0 ? t('admin.dishes.removeWarning', { name: dish.name, count }) : null
                  }}
                  onConfirm={() =>
                    act(async () => {
                      await dishesApi.remove(dish.id)
                      patch(dish.id, { isHidden: true })
                    })
                  }
                />
              </span>
              </>
            )}
          </CategoryDishes>
        )
      })}

      <details className="admin-section" onToggle={(e) => setGeneralOpen(e.currentTarget.open)}>
        <summary>{t('admin.dishes.general')}</summary>
        {generalOpen && <BadgesSection />}
      </details>

      {removed.length > 0 && (
        <details className="admin-section">
          <summary>{t('admin.dishes.removed', { count: removed.length })}</summary>
          <ul className="list">
            {removed.map((dish) => (
              <li key={dish.id} className="list__row list__row--removed">
                <span className="muted">{dish.name}</span>
                <button
                  type="button"
                  className="button-quiet"
                  onClick={() =>
                    act(async () => {
                      replace(await dishesApi.restore(dish.id))
                      // Restoring can bring back a removed category.
                      setCategories(await categoriesApi.get())
                    })
                  }
                >
                  {t('admin.dishes.restore')}: {dish.name}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

/** One category's dishes, reordered by dragging a row's grip or with its move buttons. */
function CategoryDishes({
  category,
  dishes,
  open,
  canToggle,
  onToggle,
  onReorder,
  children,
}: {
  category: Category
  dishes: Dish[]
  open: boolean
  canToggle: boolean
  onToggle: () => void
  onReorder: (ids: number[]) => void
  children: (dish: Dish) => ReactNode
}) {
  const sort = useDragSort(dishes, (dish) => dish.id, onReorder)
  const ids = dishes.map((d) => d.id)
  return (
    <section className="admin-section" aria-labelledby={`dishes-cat-${category.id}`}>
      <h2 id={`dishes-cat-${category.id}`} className="category-fold">
        <button type="button" aria-expanded={open} aria-controls={`dishes-cat-${category.id}-body`} disabled={!canToggle} onClick={onToggle}>
          <span aria-hidden="true">{open ? '▾' : '◂'}</span> {category.name} <span className="muted">({dishes.length})</span>
        </button>
      </h2>
      {open && (
      <ol className="list" id={`dishes-cat-${category.id}-body`}>
        {sort.items.map((dish, index) => (
          <li key={dish.id} ref={sort.itemRef(dish.id)} className={`list__row sortable-row${sort.dragging === dish.id ? ' is-dragging' : ''}`}>
            {dishes.length > 1 && (
              <span className="sortable-row__grip">
                <DragHandle {...sort.handleProps(dish.id)} />
                <MoveButtons name={dish.name} first={index === 0} last={index === dishes.length - 1} onMove={(direction) => onReorder(moved(ids, index, direction))} />
              </span>
            )}
            {children(dish)}
          </li>
        ))}
      </ol>
      )}
    </section>
  )
}

/**
 * A dish's picture in the list. Pressing it changes the picture without opening the dish: with none it opens the
 * file picker, with one it asks whether to replace or delete it.
 */
function DishThumb({ dish, onChange, onError }: { dish: Dish; onChange: (dish: Dish) => void; onError: (message: string | null) => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const input = useRef<HTMLInputElement>(null)
  const replacing = useRef(false)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const first = dish.images[0]

  async function run(action: () => Promise<Dish>) {
    setBusy(true)
    onError(null)
    try {
      onChange(await action())
    } catch (err) {
      onError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function pick(replace: boolean) {
    replacing.current = replace
    setAsking(false)
    input.current?.click()
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      onError(t('errors.imageTooLarge'))
      return
    }
    const old = replacing.current ? first : undefined
    void run(async () => {
      // A full dish makes room first; otherwise the new picture goes up before the old one goes.
      if (old && dish.images.length >= MAX_DISH_IMAGES) await dishesApi.removeImage(dish.id, old.id)
      const added = await dishesApi.addImage(dish.id, file)
      let result = added
      if (old && dish.images.length < MAX_DISH_IMAGES) result = await dishesApi.removeImage(dish.id, old.id)
      // The new picture takes the old one's place as the main picture.
      const ids = result.images.map((i) => i.id)
      const fresh = result.images.find((i) => !dish.images.some((d) => d.id === i.id))
      if (old && fresh && ids.length > 1 && ids[0] !== fresh.id) {
        return dishesApi.reorderImages(dish.id, [fresh.id, ...ids.filter((id) => id !== fresh.id)])
      }
      return result
    })
  }

  return (
    <>
      <button
        type="button"
        className="dish-thumb-button"
        disabled={busy}
        aria-label={`${first ? t('admin.dishes.changeImage') : t('admin.dishes.addImage')}: ${dish.name}`}
        onClick={() => (first ? setAsking(true) : pick(false))}
      >
        {first ? (
          <img className="dish-thumb" src={first.url} alt="" loading="lazy" />
        ) : (
          <span className="dish-thumb dish-thumb--empty" aria-hidden="true">+</span>
        )}
      </button>
      <input ref={input} type="file" accept={IMAGE_TYPES} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={handleFile} />
      {asking && first && (
        <Modal title={dish.name} onClose={() => setAsking(false)} top={<img className="dish-thumb-preview" src={first.url} alt="" />}>
          <div className="row">
            <button type="button" onClick={() => pick(true)}>
              {t('admin.dishes.replaceImage')}
            </button>
            {dish.images.length < MAX_DISH_IMAGES && (
              <button type="button" className="button-quiet" onClick={() => pick(false)}>
                {t('admin.dishes.addAnotherImage')}
              </button>
            )}
            <button
              type="button"
              className="button-danger"
              onClick={() => {
                setAsking(false)
                void run(() => dishesApi.removeImage(dish.id, first.id))
              }}
            >
              {t('admin.dishes.deleteImage')}
            </button>
            <button type="button" className="button-quiet" onClick={() => setAsking(false)}>
              {t('admin.cancel')}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
