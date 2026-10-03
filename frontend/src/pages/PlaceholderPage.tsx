import { useTranslation } from 'react-i18next'

/** An empty page with its title, until the page is built in a later phase. */
export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  return (
    <section>
      <h1>{t(titleKey)}</h1>
      <p>{t('pages.comingSoon')}</p>
    </section>
  )
}
