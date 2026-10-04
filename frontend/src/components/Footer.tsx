import { useTranslation } from 'react-i18next'
import { useSite } from '../site/useSite'

/** The main contact details, on every client page. */
export function Footer() {
  const { t } = useTranslation()
  const contact = useSite()?.contact
  const hasContact = contact && (contact.name || contact.phone)

  return (
    <footer className="site-footer">
      {hasContact && (
        <address className="site-footer__contact">
          <strong>{contact.name}</strong>
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
    </footer>
  )
}
