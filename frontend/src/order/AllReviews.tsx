import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reviewsApi, type Review } from '../api/reviews'
import { Loading } from '../admin/ui'
import { ReviewCard } from './ReviewsCarousel'

/** Every approved review, newest first, as a grid of cards (the recommendations page). */
export function AllReviews() {
  const { t } = useTranslation()
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    reviewsApi
      .approved()
      .then((list) => current && setReviews(list))
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [])

  return (
    <section className="all-reviews stack" aria-labelledby="all-reviews-title">
      <h2 id="all-reviews-title">{t('reviews.title')}</h2>
      {!reviews ? (
        <Loading failed={failed} />
      ) : reviews.length === 0 ? (
        <p>{t('reviews.none')}</p>
      ) : (
        <ul className="all-reviews__grid">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </ul>
      )}
    </section>
  )
}
