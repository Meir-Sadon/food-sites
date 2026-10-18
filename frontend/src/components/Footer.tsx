import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { TermsDialog } from './TermsDialog'

/** A link to the About page and the terms and policy, on every client page. */
export function Footer() {
  const { t } = useTranslation()
  const [termsOpen, setTermsOpen] = useState(false)

  return (
    <footer className="site-footer">
      <div className="site-footer__links">
        <Link to="/about">{t('footer.about')}</Link>
        <Link to="/accessibility">{t('footer.accessibility')}</Link>
        <button type="button" className="link-button" onClick={() => setTermsOpen(true)}>
          {t('footer.terms.button')}
        </button>
      </div>
      {termsOpen && <TermsDialog onClose={() => setTermsOpen(false)} />}
    </footer>
  )
}
