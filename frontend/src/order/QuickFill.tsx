import { useTranslation } from 'react-i18next'
import { accountApi } from '../api/account'
import type { Menu } from '../api/site'
import { useLoad } from '../admin/hooks'
import { selectionsFromFavorite, selectionsFromHistory, type Restored } from './model'

interface Props {
  menu: Menu
  onApply: (restored: Restored) => void
}

/** For a logged-in client: fill the whole order from the last order or a favorite, in one click. */
export function QuickFill({ menu, onApply }: Props) {
  const { t } = useTranslation()
  const orders = useLoad(accountApi.orders)
  const favorites = useLoad(accountApi.favorites)
  const last = orders.data?.find((o) => o.status !== 'Cancelled')

  return (
    <section className="quick-fill" aria-label={t('order.quick.title')}>
      <button type="button" className="button-quiet" disabled={!last} onClick={() => last && onApply(selectionsFromHistory(last, menu))}>
        {t('order.quick.last')}
      </button>
      <details className="quick-fill__favorites">
        <summary className="button-quiet">{t('order.quick.favorites')}</summary>
        {favorites.data?.length ? (
          <ul className="list">
            {favorites.data.map((favorite) => (
              <li key={favorite.id} className="list__row">
                <button type="button" className="button-quiet" onClick={() => onApply(selectionsFromFavorite(favorite, menu))}>
                  {favorite.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t('order.quick.noFavorites')}</p>
        )}
      </details>
    </section>
  )
}
