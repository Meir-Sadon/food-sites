import { useTranslation } from 'react-i18next'
import { useSite } from '../site/useSite'

/** About the kitchen: the contact details and, when the admin filled them in, the kashrut details. */
export function AboutPage() {
  const { t } = useTranslation()
  const site = useSite()
  const kashrut = site?.kashrutText
  const contact = site?.contact
  const hasContact = contact && (contact.name || contact.phone || contact.address || contact.email || contact.openingHours)

  return (
    <section className="about-page">
      <h1>{t('pages.about.title')}</h1>
      {hasContact && (
        <address className="about-contact">
          {contact.name && <strong>{contact.name}</strong>}
          {contact.phone && (
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} dir="ltr">
              {contact.phone}
            </a>
          )}
          {contact.address && <span>{contact.address}</span>}
          {contact.email && (
            <a href={`mailto:${contact.email}`} dir="ltr">
              {contact.email}
            </a>
          )}
          {contact.openingHours && (
            <span>
              {t('footer.openingHours')}: {contact.openingHours}
            </span>
          )}
        </address>
      )}
      {kashrut && (
        <section className="kashrut" aria-labelledby="about-kashrut">
          <h2 id="about-kashrut">{t('pages.about.kashrut')}</h2>
          <p>{kashrut}</p>
        </section>
      )}
      {!hasContact && !kashrut && <p>{t('pages.comingSoon')}</p>}
    </section>
  )
}
