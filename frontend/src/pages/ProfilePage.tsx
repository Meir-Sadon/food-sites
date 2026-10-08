import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { accountApi, type HistoryOrder, type Profile } from '../api/account'
import { siteApi } from '../api/site'
import { Loading } from '../admin/ui'
import { useLoad } from '../admin/hooks'
import { useAccount } from '../account/useAccount'
import { useFeature, useSiteSettled } from '../site/useSite'
import { loadDraft, saveDraft } from '../order/draft'
import { emptyOrder, selectionsFromHistory } from '../order/model'
import { DetailsSection } from '../profile/DetailsSection'
import { FavoritesSection, RecommendationsSection } from '../profile/FavoritesSection'
import { HistorySection } from '../profile/HistorySection'
import { ReviewsSection } from '../profile/ReviewsSection'

/** Stands in for a list the site's features leave out. */
const nothing = () => Promise.resolve([])

export function ProfilePage() {
  const { t } = useTranslation()
  const { user, loading, setUser } = useAccount()
  // Which sections to show depends on the site's features, so wait for them.
  const siteSettled = useSiteSettled()

  return (
    <section className="stack">
      <h1>{t('pages.profile.title')}</h1>
      {loading || !siteSettled ? (
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
  const favoritesOn = useFeature('favorites')
  const recommendationsOn = useFeature('recommendations')
  const favorites = useLoad(favoritesOn ? accountApi.favorites : nothing)
  const recommendations = useLoad(recommendationsOn ? accountApi.recommendations : nothing)
  const reviewsOn = useFeature('reviews')
  const reviews = useLoad(reviewsOn ? accountApi.reviews : nothing)
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
        <HistorySection orders={orders.data} onReorder={reorder} onSaveFavorite={favoritesOn ? saveFavorite : undefined} />
      ) : (
        <Loading failed={orders.failed} />
      )}
      {favoritesOn && favorites.data && <FavoritesSection favorites={favorites.data} dishNames={dishNames} onRemove={removeFavorite} />}
      {reviewsOn && reviews.data && <ReviewsSection reviews={reviews.data} />}
      {recommendationsOn && recommendations.data && <RecommendationsSection recommendations={recommendations.data} />}
    </>
  )
}
