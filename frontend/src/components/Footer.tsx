import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { IosInstallDialog } from '../pwa/IosInstallDialog'
import { useInstallApp } from '../pwa/install'
import { TermsDialog } from './TermsDialog'

/** A link to the About page and the terms and policy, on every client page. */
export function Footer() {
  const { t } = useTranslation()
  const [termsOpen, setTermsOpen] = useState(false)
  const [iosOpen, setIosOpen] = useState(false)
  const { mode, install } = useInstallApp()

  return (
    <footer className="site-footer">
      <div className="site-footer__links">
        <Link to="/about">{t('footer.about')}</Link>
        <Link to="/accessibility">{t('footer.accessibility')}</Link>
        <button type="button" className="link-button" onClick={() => setTermsOpen(true)}>
          {t('footer.terms.button')}
        </button>
        {mode !== 'none' && (
          <button type="button" className="link-button" onClick={() => (mode === 'native' ? void install() : setIosOpen(true))}>
            {t('pwa.install')}
          </button>
        )}
      </div>
      {iosOpen && <IosInstallDialog onClose={() => setIosOpen(false)} />}
      {termsOpen && <TermsDialog onClose={() => setTermsOpen(false)} />}
    </footer>
  )
}
