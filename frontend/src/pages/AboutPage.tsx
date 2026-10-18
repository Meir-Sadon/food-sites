import { useTranslation } from 'react-i18next'
import { MapLinks } from '../components/MapLinks'
import { SocialLinks } from '../components/SocialLinks'
import { useSite } from '../site/useSite'

/** About the kitchen: the contact details, the links to the business's pages elsewhere and, when the admin filled them in, the kashrut details. */
export function AboutPage() {
  const { t } = useTranslation()
  const site = useSite()
  const kashrut = site?.kashrutText
  const contact = site?.contact
  const socialLinks = site?.socialLinks
  const hasContact = contact && (contact.name || contact.phone || contact.address || contact.email || contact.openingHours)

  return (
    <section className="about-page">
      <h1>{t('pages.about.title')}</h1>
      {hasContact && (
        <address className="about-contact about-card">
          {contact.name && <strong>{contact.name}</strong>}
          {contact.phone && (
            <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} dir="ltr">
              {contact.phone}
            </a>
          )}
          {contact.address && <span>{contact.address}</span>}
          <MapLinks address={contact.address} />
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
      {!!socialLinks?.length && (
        <section className="social-card about-card" aria-labelledby="about-social">
          <h2 id="about-social">{t('socialLinks.title')}</h2>
          <SocialLinks links={socialLinks} />
        </section>
      )}
      {kashrut && (
        <section className="kashrut about-card" aria-labelledby="about-kashrut">
          <h2 id="about-kashrut">{t('pages.about.kashrut')}</h2>
          <p>{kashrut}</p>
        </section>
      )}
      {!hasContact && !kashrut && !socialLinks?.length && <p>{t('pages.comingSoon')}</p>}
    </section>
  )
}
