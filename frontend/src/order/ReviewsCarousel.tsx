import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reviewsApi, type Review } from '../api/reviews'
import { Stars } from '../components/Stars'
import { prefersReducedMotion, scrollBehavior } from '../components/motion'

const INTERVAL_MS = 6000

/** How many of the newest approved reviews the home page carousel shows; the recommendations page shows them all. */
const CAROUSEL_SIZE = 12

/** One approved review: stars, words, pictures and who wrote it. */
export function ReviewCard({ review, label }: { review: Review; label?: string }) {
  const { t } = useTranslation()
  const name = review.name ?? t('reviews.client')
  return (
    <li className="review-card" aria-label={label}>
      <Stars rating={review.rating} />
      {review.comment && <blockquote className="review-card__comment">{review.comment}</blockquote>}
      {review.images.length > 0 && (
        <div className={`review-card__images review-card__images--${review.images.length}`}>
          {review.images.map((url, n) => (
            <img key={url} src={url} alt={t('reviews.imageOf', { name, n: n + 1 })} loading="lazy" />
          ))}
        </div>
      )}
      <p className="review-card__by">
        <span className="review-card__avatar" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <span>{name}</span>
      </p>
    </li>
  )
}

/**
 * The approved reviews, as a row of cards to swipe through. It moves on by itself every few seconds until the
 * visitor touches it (never for people who asked for less motion), and shows nothing while there are no reviews.
 */
export function ReviewsCarousel() {
  const { t } = useTranslation()
  const [reviews, setReviews] = useState<Review[]>([])
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const track = useRef<HTMLUListElement>(null)

  useEffect(() => {
    let current = true
    reviewsApi
      .approved()
      .then((list) => current && setReviews(list.slice(0, CAROUSEL_SIZE)))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])

  /** Brings card `index` to the start of the row (the right side in Hebrew), whatever the direction. */
  function go(index: number) {
    const list = track.current
    const card = list?.children[index] as HTMLElement | undefined
    if (!list || !card) return
    // offsetLeft is measured from the track (position: relative) and ignores its scroll; in RTL scrollLeft runs from 0 down.
    const left = getComputedStyle(list).direction === 'rtl' ? card.offsetLeft + card.offsetWidth - list.clientWidth : card.offsetLeft
    list.scrollTo?.({ left, behavior: scrollBehavior() })
    setActive(index)
  }

  // Which card is first in view, as the visitor swipes.
  function handleScroll() {
    const list = track.current
    const first = list?.children[0] as HTMLElement | undefined
    if (!list || !first) return
    const step = first.offsetWidth + parseFloat(getComputedStyle(list).columnGap || '0')
    setActive(Math.min(reviews.length - 1, Math.round(Math.abs(list.scrollLeft) / step)))
  }

  const many = reviews.length > 1
  useEffect(() => {
    if (!many || paused || prefersReducedMotion()) return
    const timer = setInterval(() => go((active + 1) % reviews.length), INTERVAL_MS)
    return () => clearInterval(timer)
    // go() reads the track; the timer restarts whenever the card or the pause changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [many, paused, active, reviews.length])

  if (reviews.length === 0) return null

  return (
    <section
      className="reviews"
      aria-labelledby="reviews-title"
      aria-roledescription={t('reviews.carousel')}
      onPointerDown={() => setPaused(true)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="reviews__head">
        <h2 id="reviews-title">{t('reviews.title')}</h2>
        {many && (
          <div className="reviews__arrows">
            <button
              type="button"
              className="button-icon"
              aria-label={t('reviews.previous')}
              onClick={() => go((active - 1 + reviews.length) % reviews.length)}
            >
              <span aria-hidden="true">›</span>
            </button>
            <button type="button" className="button-icon" aria-label={t('reviews.next')} onClick={() => go((active + 1) % reviews.length)}>
              <span aria-hidden="true">‹</span>
            </button>
          </div>
        )}
      </div>
      <ul className="reviews__track" ref={track} onScroll={handleScroll}>
        {reviews.map((review, index) => (
          <ReviewCard key={review.id} review={review} label={t('reviews.cardN', { n: index + 1, count: reviews.length })} />
        ))}
      </ul>
      {many && (
        <div className="reviews__dots" aria-hidden="true">
          {reviews.map((review, index) => (
            <span key={review.id} className={`reviews__dot${index === active ? ' reviews__dot--on' : ''}`} />
          ))}
        </div>
      )}
    </section>
  )
}
