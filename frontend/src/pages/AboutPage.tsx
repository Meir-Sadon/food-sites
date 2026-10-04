import { useTranslation } from 'react-i18next'
import { useSite } from '../site/useSite'

/** About the kitchen, with the kashrut details when the admin filled them in. */
export function AboutPage() {
  const { t } = useTranslation()
  const kashrut = useSite()?.kashrutText

  return (
    <section className="about-page">
      <h1>{t('pages.about.title')}</h1>
      {kashrut ? (
        <section className="kashrut" aria-labelledby="about-kashrut">
          <h2 id="about-kashrut">{t('pages.about.kashrut')}</h2>
          <p>{kashrut}</p>
        </section>
      ) : (
        <p>{t('pages.comingSoon')}</p>
      )}
    </section>
  )
}
