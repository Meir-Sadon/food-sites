import { Fragment, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { accountApi } from '../api/account'
import type { Menu } from '../api/site'
import { useLoad } from '../admin/hooks'
import { Modal } from '../components/Modal'
import { NavIcon, type NavIconName } from '../components/NavIcons'
import { useFeature } from '../site/useSite'
import { formatMoney, formatSupplyDate } from './format'
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
  const dishNames = useMemo(() => new Map(menu.dishes.map((d) => [d.id, d.name])), [menu])
  const [pending, setPending] = useState<Restored | null>(null)

  const request = (restored: Restored) => (hasOrder ? setPending(restored) : onApply(restored))

  // Nothing to fill from yet (a new client, or still loading): the order page starts with the menu.
  const favoriteList = favoritesOn ? (favorites.data ?? []) : []
  if (!last && favoriteList.length === 0) return null

  return (
    <section className="quick-fill" aria-labelledby="quick-fill-title">
      <h2 id="quick-fill-title" className="quick-fill__title">
        {t('order.quick.title')}
      </h2>
      <ul className="quick-fill__tiles">
        {last && (
          <li>
            <QuickTile
              icon="history"
              title={t('order.quick.last')}
              meta={[formatSupplyDate(last.supplyDate, t), formatMoney(last.total)]}
              dishes={last.items.filter((i) => i.parentItemId === null).map((i) => i.dishName)}
              onClick={() => request(selectionsFromHistory(last, menu))}
            />
          </li>
        )}
        {favoriteList.map((favorite) => (
          <li key={favorite.id}>
            <QuickTile
              icon="favorite"
              title={favorite.name}
              dishes={favorite.items.map((i) => dishNames.get(i.dishId)).filter((name): name is string => !!name)}
              onClick={() => request(selectionsFromFavorite(favorite, menu))}
            />
          </li>
        ))}
        {favoritesOn && favorites.data && favoriteList.length === 0 && (
          <li className="quick-fill__hint">{t('order.quick.noFavorites')}</li>
        )}
      </ul>
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

/** One way to fill the order: its name is the button's label, and what it holds describes it. */
function QuickTile({ icon, title, meta, dishes, onClick }: {
  icon: NavIconName
  title: string
  /** Short facts (a date, a total) shown on one line when they fit. */
  meta?: string[]
  dishes: string[]
  onClick: () => void
}) {
  const id = useId()
  return (
    <button type="button" className="quick-tile" aria-labelledby={`${id}-title`} aria-describedby={`${id}-details`} onClick={onClick}>
      <span className="quick-tile__icon">
        <NavIcon name={icon} />
      </span>
      <span className="quick-tile__text">
        <span id={`${id}-title`} className="quick-tile__title">
          {title}
        </span>
        <span id={`${id}-details`} className="quick-tile__details">
          {meta && (
            <span className="quick-tile__meta">
              {meta.map((fact, i) => (
                // The dot stays with the fact after it, so a wrapped line never starts or ends with it alone.
                <Fragment key={i}>
                  {i > 0 && ' '}
                  <span>{i > 0 ? `·\u00a0${fact}` : fact}</span>
                </Fragment>
              ))}
            </span>
          )}{' '}
          <span className="quick-tile__dishes">{dishes.join(', ')}</span>
        </span>
      </span>
    </button>
  )
}
