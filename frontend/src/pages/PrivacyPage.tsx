import { useTranslation } from 'react-i18next'
import { TermsSections } from '../components/TermsDialog'

/** The terms and privacy policy on a page of its own, so it has an address to link to (Google's sign-in setup asks for one). */
export function PrivacyPage() {
  const { t } = useTranslation()
  return (
    <section className="stack">
      <h1>{t('footer.terms.title')}</h1>
      <TermsSections />
    </section>
  )
}
