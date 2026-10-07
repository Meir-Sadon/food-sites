import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { accountApi, type HistoryOrder, type Profile } from '../api/account'
import { siteApi } from '../api/site'
import { Loading } from '../admin/ui'
import { useLoad } from '../admin/hooks'
import { useAccount } from '../account/useAccount'
import { loadDraft, saveDraft } from '../order/draft'
import { emptyOrder, selectionsFromHistory } from '../order/model'
import { DetailsSection } from '../profile/DetailsSection'
import { FavoritesSection, RecommendationsSection } from '../profile/FavoritesSection'
import { HistorySection } from '../profile/HistorySection'

export function ProfilePage() {
  const { t } = useTranslation()
  const { user, loading, setUser } = useAccount()

  return (
    <section className="stack">
      <h1>{t('pages.profile.title')}</h1>
      {loading ? (
        <Loading />
      ) : !user ? (
        <p>
          {t('profile.loginPrompt')} <Link to="/login">{t('profile.loginLink')}</Link>
        </p>
      ) : (
        <ProfileContent user={user} onSaved={setUser} />
      )}
    </section>
  )
}

function ProfileContent({ user, onSaved }: { user: Profile; onSaved: (profile: Profile) => void }) {
  const navigate = useNavigate()
  const orders = useLoad(accountApi.orders)
  const favorites = useLoad(accountApi.favorites)
  const recommendations = useLoad(accountApi.recommendations)
  const [dishNames, setDishNames] = useState(() => new Map<number, string>())

  // Dish names for the favorites' descriptions come from the current menu.
  useEffect(() => {
    siteApi
      .menu()
      .then((menu) => setDishNames(new Map(menu.dishes.map((d) => [d.id, d.name]))))
      .catch(() => {})
  }, [])

  /** Puts the past order in the order page as it is today: gone dishes skipped, current prices. */
  async function reorder(order: HistoryOrder) {
    const menu = await siteApi.menu()
    const { selections, skipped } = selectionsFromHistory(order, menu)
    if (Object.keys(selections).length === 0) throw new Error('empty')
    saveDraft({ ...(loadDraft() ?? emptyOrder()), selections })
    navigate('/', { state: { filled: { skipped } } })
  }

  async function saveFavorite(order: HistoryOrder, name: string) {
    const favorite = await accountApi.addFavorite(name, order.id)
    favorites.setData((current) => [...(current ?? []), favorite])
  }

  async function removeFavorite(favorite: { id: number }) {
    await accountApi.removeFavorite(favorite.id)
    favorites.setData((current) => (current ?? []).filter((f) => f.id !== favorite.id))
  }

  return (
    <>
      <DetailsSection user={user} onSaved={onSaved} />
      {orders.data ? (
        <HistorySection orders={orders.data} onReorder={reorder} onSaveFavorite={saveFavorite} />
      ) : (
        <Loading failed={orders.failed} />
      )}
      {favorites.data && <FavoritesSection favorites={favorites.data} dishNames={dishNames} onRemove={removeFavorite} />}
      {recommendations.data && <RecommendationsSection recommendations={recommendations.data} />}
    </>
  )
}
