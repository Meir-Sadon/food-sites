import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reviewStatuses, reviewsAdminApi, type AdminReview, type ReviewStatus } from '../../api/reviews'
import { Stars } from '../../components/Stars'
import { useErrorMessage } from '../hooks'
import { Loading, Status } from '../ui'

/** The reviews clients sent: new ones wait here until the admin approves them for the home page or blocks them. */
export function ReviewsPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<ReviewStatus | ''>('Pending')
  const [reviews, setReviews] = useState<AdminReview[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    reviewsAdminApi
      .list(status)
      .then((list) => {
        if (!current) return
        setReviews(list)
        setFailed(false)
      })
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [status])

  const replace = (review: AdminReview) =>
    setReviews((list) =>
      list && (status && review.status !== status ? list.filter((r) => r.id !== review.id) : list.map((r) => (r.id === review.id ? review : r))),
    )

  return (
    <>
      <h1>{t('admin.reviews.title')}</h1>
      <p className="hint">{t('admin.reviews.intro')}</p>
      <div className="row row--end">
        <span className="field field--narrow">
          <label htmlFor="reviews-status">{t('admin.reviews.show')}</label>
          <select id="reviews-status" value={status} onChange={(e) => {
              setReviews(null)
              setStatus(e.target.value as ReviewStatus | '')
            }}
          >
            {reviewStatuses.map((s) => (
              <option key={s} value={s}>
                {t(`admin.reviews.statuses.${s}`)}
              </option>
            ))}
            <option value="">{t('admin.reviews.all')}</option>
          </select>
        </span>
      </div>
      {!reviews ? (
        <Loading failed={failed} />
      ) : reviews.length === 0 ? (
        <p>{t('admin.reviews.empty')}</p>
      ) : (
        <div className="stack">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} onChange={replace} />
          ))}
        </div>
      )}
    </>
  )
}

function ReviewCard({ review, onChange }: { review: AdminReview; onChange: (review: AdminReview) => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [error, setError] = useState<string | null>(null)
  const label = t('admin.reviews.reviewOf', { name: review.name ?? review.orderName, id: review.orderId })

  async function setStatus(status: ReviewStatus) {
    setError(null)
    try {
      await reviewsAdminApi.setStatus(review.id, status)
      onChange({ ...review, status })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <article className={`review-admin review-admin--${review.status.toLowerCase()}`} aria-label={label}>
      <header className="row row--between">
        <Stars rating={review.rating} />
        <span className="badge review-admin__status">{t(`admin.reviews.statuses.${review.status}`)}</span>
      </header>
      {review.comment && <p className="review-admin__comment">{review.comment}</p>}
      {review.images.length > 0 && (
        <ul className="review-admin__images">
          {review.images.map((image, index) => (
            <li key={image.id}>
              <a href={image.url} target="_blank" rel="noopener noreferrer">
                <img src={image.url} alt={t('admin.reviews.imageN', { n: index + 1 })} loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        {review.name ?? '—'} · {t('admin.orders.orderN', { id: review.orderId })} ({review.orderName},{' '}
        <bdi className="numeric">{review.phone}</bdi>) · {new Date(review.submittedAt).toLocaleDateString('he-IL')}
      </p>
      <div className="row">
        {review.status !== 'Approved' && (
          <button type="button" onClick={() => void setStatus('Approved')}>
            {t('admin.reviews.approve')}
            <span className="visually-hidden"> {label}</span>
          </button>
        )}
        {review.status !== 'Blocked' && (
          <button type="button" className="button-danger" onClick={() => void setStatus('Blocked')}>
            {t('admin.reviews.block')}
            <span className="visually-hidden"> {label}</span>
          </button>
        )}
      </div>
      {error && <Status message={error} error />}
    </article>
  )
}
