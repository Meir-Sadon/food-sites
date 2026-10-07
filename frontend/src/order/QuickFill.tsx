import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { accountApi } from '../api/account'
import type { Menu } from '../api/site'
import { useLoad } from '../admin/hooks'
import { Modal } from '../components/Modal'
import { useFeature } from '../site/useSite'
import { selectionsFromFavorite, selectionsFromHistory, type Restored } from './model'

interface Props {
  menu: Menu
  /** The order already has dishes in it: filling would replace them, so the client is asked first. */
  hasOrder: boolean
  onApply: (restored: Restored) => void
}

const noFavorites = () => Promise.resolve([])

/** For a logged-in client: fill the whole order from the last order or (when the site has them) a favorite, in one click. */
export function QuickFill({ menu, hasOrder, onApply }: Props) {
  const { t } = useTranslation()
  const orders = useLoad(accountApi.orders)
  // The order page shows this only once the site info is in, so the feature is settled.
  const favoritesOn = useFeature('favorites')
  const favorites = useLoad(favoritesOn ? accountApi.favorites : noFavorites)
  const last = orders.data?.find((o) => o.status !== 'Cancelled')
  const [pending, setPending] = useState<Restored | null>(null)

  const request = (restored: Restored) => (hasOrder ? setPending(restored) : onApply(restored))

  return (
    <section className="quick-fill" aria-label={t('order.quick.title')}>
      <button type="button" className="button-quiet" disabled={!last} onClick={() => last && request(selectionsFromHistory(last, menu))}>
        {t('order.quick.last')}
      </button>
      {favoritesOn && (
        <details className="quick-fill__favorites">
          <summary className="button-quiet">{t('order.quick.favorites')}</summary>
          {favorites.data?.length ? (
            <ul className="list">
              {favorites.data.map((favorite) => (
                <li key={favorite.id} className="list__row">
                  <button type="button" className="button-quiet" onClick={() => request(selectionsFromFavorite(favorite, menu))}>
                    {favorite.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t('order.quick.noFavorites')}</p>
          )}
        </details>
      )}
      {pending && (
        <Modal title={t('order.quick.replaceTitle')} onClose={() => setPending(null)} wide>
          <p>{t('order.quick.replaceText')}</p>
          <div className="row modal__actions modal__actions--inline">
            <button
              type="button"
              onClick={() => {
                onApply(pending)
                setPending(null)
              }}
            >
              {t('order.quick.replace')}
            </button>
            <button type="button" className="button-quiet" onClick={() => setPending(null)}>
              {t('order.quick.keep')}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
