import { useTranslation } from 'react-i18next'

/** A 1-5 rating as five stars, read out as "4 of 5 stars". */
export function Stars({ rating }: { rating: number }) {
  const { t } = useTranslation()
  return (
    <span className="stars" role="img" aria-label={t('reviews.stars', { rating })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= rating ? 'stars__on' : 'stars__off'}>
          ★
        </span>
      ))}
    </span>
  )
}
