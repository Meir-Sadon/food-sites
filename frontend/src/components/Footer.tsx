import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Modal } from './Modal'

/** A link to the About page and the terms and policy, on every client page. */
export function Footer() {
  const { t } = useTranslation()
  const [termsOpen, setTermsOpen] = useState(false)
  const sections = t('footer.terms.sections', { returnObjects: true }) as { title: string; text: string }[]

  return (
    <footer className="site-footer">
      <div className="site-footer__links">
        <Link to="/about">{t('footer.about')}</Link>
        <button type="button" className="link-button" onClick={() => setTermsOpen(true)}>
          {t('footer.terms.button')}
        </button>
      </div>
      {termsOpen && (
        <Modal title={t('footer.terms.title')} onClose={() => setTermsOpen(false)}>
          {sections.map((s) => (
            <section key={s.title} className="terms-section">
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </section>
          ))}
          <button type="button" onClick={() => setTermsOpen(false)}>
            {t('footer.terms.close')}
          </button>
        </Modal>
      )}
    </footer>
  )
}
