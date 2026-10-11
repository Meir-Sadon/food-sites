import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { categoriesApi, dishesApi, type Category, type Dish } from '../../api/catalog'
import { ConfirmRemove, DragHandle, Loading, MoveButtons, Status } from '../ui'
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

  const visible = dishes.filter((d) => !d.isHidden).sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
  const removed = dishes.filter((d) => d.isHidden)

  return (
    <>
      <div className="row row--between">
        <h1>{t('admin.dishes.title')}</h1>
        {categories.length > 0 && (
          <Link className="button-link" to="/admin/dishes/new">
            {t('admin.dishes.new')}
          </Link>
        )}
      </div>
      {categories.length === 0 && <p>{t('admin.dishes.needCategory')}</p>}
      {categories.length > 0 && visible.length === 0 && <p>{t('admin.dishes.empty')}</p>}
      {error && <Status message={error} error />}

      {visible.length > 1 && <p className="hint">{t('admin.dishes.orderHint')}</p>}
      {categories.map((category) => {
        const inCategory = visible.filter((d) => d.categoryId === category.id)
        if (inCategory.length === 0) return null
        return (
          <CategoryDishes key={category.id} category={category} dishes={inCategory} onReorder={(ids) => reorder(category.id, ids)}>
            {(dish) => (
              <>
              <span className="list__main">
                {dish.images.length > 0 ? (
                  <img className="dish-thumb" src={dish.images[0].url} alt="" loading="lazy" />
                ) : (
                  <span className="dish-thumb dish-thumb--empty" role="img" aria-label={t('admin.dishes.noImage')} title={t('admin.dishes.noImage')} />
                )}
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

      {removed.length > 0 && (
        <details className="admin-section">
          <summary>{t('admin.dishes.removed', { count: removed.length })}</summary>
          <ul className="list">
            {removed.map((dish) => (
              <li key={dish.id} className="list__row">
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
  onReorder,
  children,
}: {
  category: Category
  dishes: Dish[]
  onReorder: (ids: number[]) => void
  children: (dish: Dish) => ReactNode
}) {
  const sort = useDragSort(dishes, (dish) => dish.id, onReorder)
  const ids = dishes.map((d) => d.id)
  return (
    <section className="admin-section" aria-labelledby={`dishes-cat-${category.id}`}>
      <h2 id={`dishes-cat-${category.id}`}>{category.name}</h2>
      <ol className="list">
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
    </section>
  )
}
