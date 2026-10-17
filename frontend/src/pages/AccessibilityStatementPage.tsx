import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accessibilityApi, type AccessibilityInfo } from '../api/site'
import { MapLinks } from '../components/MapLinks'
import { useSite } from '../site/useSite'

const list = (items: unknown): string[] => (Array.isArray(items) ? (items as string[]) : [])

/**
 * The accessibility statement (הצהרת נגישות) the regulations require: the level aimed for, what was done, the known
 * limits and who to contact. The contact is the accessibility coordinator the admin set, else the main contact.
 */
export function AccessibilityStatementPage() {
  const { t, i18n } = useTranslation()
  const site = useSite()
  const [info, setInfo] = useState<AccessibilityInfo | null>(null)
  useEffect(() => {
    accessibilityApi.get().then(setInfo).catch(() => setInfo(null))
  }, [])

  const business = site?.contact
  const coordinator = info?.name || info?.phone || info?.email ? info : null
  const name = coordinator ? coordinator.name : business?.name
  const phone = coordinator ? coordinator.phone : business?.phone
  const email = coordinator ? coordinator.email : business?.email
  const updated = info?.updatedAt ? new Date(info.updatedAt).toLocaleDateString(i18n.language) : null
  const bulleted = (key: string) => list(t(key, { returnObjects: true })).map((text) => <li key={text}>{text}</li>)

  return (
    <section className="about-page statement-page">
      <h1>{t('accessibility.statement.title')}</h1>
      <p>{t('accessibility.statement.intro')}</p>
      {updated && <p>{t('accessibility.statement.updated', { date: updated })}</p>}

      <section className="about-card" aria-labelledby="a11y-level">
        <h2 id="a11y-level">{t('accessibility.statement.levelTitle')}</h2>
        <p>{t('accessibility.statement.level')}</p>
      </section>

      <section className="about-card" aria-labelledby="a11y-done">
        <h2 id="a11y-done">{t('accessibility.statement.doneTitle')}</h2>
        <ul>{bulleted('accessibility.statement.done')}</ul>
        <p>{t('accessibility.statement.menuNote')}</p>
      </section>

      <section className="about-card" aria-labelledby="a11y-limits">
        <h2 id="a11y-limits">{t('accessibility.statement.limitsTitle')}</h2>
        <ul>
          {bulleted('accessibility.statement.limits')}
          {info?.notes && <li className="statement-notes">{info.notes}</li>}
        </ul>
      </section>

      <section className="about-card" aria-labelledby="a11y-physical">
        <h2 id="a11y-physical">{t('accessibility.statement.physicalTitle')}</h2>
        <p>{t('accessibility.statement.physical')}</p>
      </section>

      <section className="about-card" aria-labelledby="a11y-contact">
        <h2 id="a11y-contact">{t('accessibility.statement.contactTitle')}</h2>
        <p>{t('accessibility.statement.contactIntro')}</p>
        <address className="about-contact">
          <strong>{coordinator ? t('accessibility.statement.coordinator') : t('accessibility.statement.businessContact')}</strong>
          {name && <span>{name}</span>}
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} dir="ltr" aria-label={`${t('accessibility.statement.phone')}: ${phone}`}>
              {phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} dir="ltr" aria-label={`${t('accessibility.statement.email')}: ${email}`}>
              {email}
            </a>
          )}
          {!coordinator && business?.address && (
            <>
              <span>{business.address}</span>
              <MapLinks address={business.address} />
            </>
          )}
        </address>
      </section>

      <p>
        <Link to="/">{t('accessibility.statement.back')}</Link>
      </p>
    </section>
  )
}
