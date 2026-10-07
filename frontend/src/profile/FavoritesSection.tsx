import { useTranslation } from 'react-i18next'
import type { Favorite, Recommendation } from '../api/account'
import { ConfirmRemove } from '../admin/ui'

export function FavoritesSection({ favorites, dishNames, onRemove }: {
  favorites: Favorite[]
  /** Dish names by id, to describe what a favorite holds. Missing dishes are left out. */
  dishNames: Map<number, string>
  onRemove: (favorite: Favorite) => Promise<void>
}) {
  const { t } = useTranslation()
  return (
    <section className="account-section" aria-labelledby="profile-favorites-title">
      <h2 id="profile-favorites-title">{t('profile.favorites')}</h2>
      {favorites.length === 0 ? (
        <p>{t('profile.noFavorites')}</p>
      ) : (
        <ul className="list">
          {favorites.map((favorite) => (
            <li key={favorite.id} className="list__row">
              <span className="list__main">
                <strong>{favorite.name}</strong>
                <span className="muted">
                  {favorite.items
                    .map((i) => dishNames.get(i.dishId))
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </span>
              <ConfirmRemove name={favorite.name} onConfirm={() => onRemove(favorite)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const date = new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' })

export function RecommendationsSection({ recommendations }: { recommendations: Recommendation[] }) {
  const { t } = useTranslation()
  return (
    <section className="account-section" aria-labelledby="profile-recommendations-title">
      <h2 id="profile-recommendations-title">{t('profile.recommendations')}</h2>
      {recommendations.length === 0 ? (
        <p>{t('profile.noRecommendations')}</p>
      ) : (
        <ul className="list">
          {recommendations.map((r) => (
            <li key={r.id} className="list__row">
              <span className="list__main">
                <span>{r.text}</span>
                <span className="muted">{date.format(new Date(r.createdAt))}</span>
              </span>
              {r.isHandled && <span className="badge">{t('profile.handled')}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
