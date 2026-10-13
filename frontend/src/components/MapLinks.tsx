import { useTranslation } from 'react-i18next'

/** Links that open the business address in Google Maps and Waze, in a new tab. Nothing when there is no address. */
export function MapLinks({ address }: { address: string | null | undefined }) {
  const { t } = useTranslation()
  const query = address?.trim()
  if (!query) return null
  const encoded = encodeURIComponent(query)
  return (
    <div className="map-links">
      <a
        className="button-link"
        href={`https://www.google.com/maps/search/?api=1&query=${encoded}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('map.show')}
      </a>
      <a className="button-quiet" href={`https://waze.com/ul?q=${encoded}&navigate=yes`} target="_blank" rel="noopener noreferrer">
        {t('map.waze')}
      </a>
    </div>
  )
}
