import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { categoriesApi, dishesApi, type Category, type Dish } from '../../api/catalog'
import { ConfirmRemove, Loading, Status } from '../ui'
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

  if (!categories || !dishes) return <Loading failed={failed} />

  const visible = dishes.filter((d) => !d.isHidden)
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

      {categories.map((category) => {
        const inCategory = visible.filter((d) => d.categoryId === category.id)
        if (inCategory.length === 0) return null
        return (
          <section key={category.id} className="admin-section" aria-labelledby={`dishes-cat-${category.id}`}>
            <h2 id={`dishes-cat-${category.id}`}>{category.name}</h2>
            <ul className="list">
              {inCategory.map((dish) => (
                <li key={dish.id} className="list__row">
                  <span className="list__main">
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
                </li>
              ))}
            </ul>
          </section>
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
