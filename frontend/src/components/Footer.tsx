import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { setConsent, useConsent } from '../tracking/consent'
import { hasMarketingTools } from '../tracking/marketing'
import { useSite } from '../site/useSite'
import { TermsDialog } from './TermsDialog'

/** A link to the About page and the terms and policy, on every client page. */
export function Footer() {
  const { t } = useTranslation()
  const [termsOpen, setTermsOpen] = useState(false)
  const consent = useConsent()
  const tools = hasMarketingTools(useSite()?.tracking)

  return (
    <footer className="site-footer">
      <div className="site-footer__links">
        <Link to="/about">{t('footer.about')}</Link>
        <button type="button" className="link-button" onClick={() => setTermsOpen(true)}>
          {t('footer.terms.button')}
        </button>
        {tools && consent !== null && (
          <button type="button" className="link-button" onClick={() => setConsent(null)}>
            {t('consent.change')}
          </button>
        )}
      </div>
      {termsOpen && <TermsDialog onClose={() => setTermsOpen(false)} />}
    </footer>
  )
}
