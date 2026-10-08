import { useTranslation } from 'react-i18next'
import type { MyReview } from '../api/account'
import { Stars } from '../components/Stars'
import { formatSupplyDate } from '../order/format'

/** The reviews the client sent on their orders, and whether each is shown on the site. */
export function ReviewsSection({ reviews }: { reviews: MyReview[] }) {
  const { t } = useTranslation()
  return (
    <section className="account-section" aria-labelledby="profile-reviews-title">
      <h2 id="profile-reviews-title">{t('profile.reviews')}</h2>
      {reviews.length === 0 ? (
        <p>{t('profile.noReviews')}</p>
      ) : (
        <ul className="my-reviews">
          {reviews.map((review) => (
            <li key={review.id} className="my-review">
              <div className="row row--between">
                <Stars rating={review.rating} />
                <span className={`badge my-review__status my-review__status--${review.status.toLowerCase()}`}>
                  {t(`profile.reviewStatus.${review.status}`)}
                </span>
              </div>
              {review.comment && <p className="my-review__comment">{review.comment}</p>}
              {review.images.length > 0 && (
                <div className="my-review__images">
                  {review.images.map((url, n) => (
                    <img key={url} src={url} alt={t('reviews.page.imageN', { n: n + 1 })} loading="lazy" />
                  ))}
                </div>
              )}
              <p className="muted">
                {t('profile.reviewOf', { id: review.orderId, date: formatSupplyDate(review.supplyDate, t) })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
