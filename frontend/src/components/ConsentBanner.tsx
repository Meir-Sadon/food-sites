import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasMarketingTools } from '../tracking/marketing'
import { setConsent, useConsent } from '../tracking/consent'
import { useSite } from '../site/useSite'
import { connectedTools } from '../tracking/tools'
import { TermsDialog } from './TermsDialog'

/**
 * Asks the visitor whether the site may use the owner's marketing tools (they keep cookies). Shown only when a tool is
 * connected and the visitor has not answered; "yes" and "no" look the same. Nothing is loaded before a "yes".
 */
export function ConsentBanner() {
  const { t } = useTranslation()
  const tracking = useSite()?.tracking
  const consent = useConsent()
  const [policyOpen, setPolicyOpen] = useState(false)
  if (!hasMarketingTools(tracking) || consent !== null) return null
  return (
    <>
      <div className="consent-banner" role="region" aria-label={t('consent.title')}>
        <p>
          <strong>{t('consent.title')}</strong> {t('consent.text', { tools: connectedTools(tracking, t).join(', ') })}{' '}
          <button type="button" className="link-button" onClick={() => setPolicyOpen(true)}>
            {t('consent.policy')}
          </button>
        </p>
        <div className="consent-banner__actions">
          <button type="button" onClick={() => setConsent('granted')}>
            {t('consent.accept')}
          </button>
          <button type="button" onClick={() => setConsent('denied')}>
            {t('consent.decline')}
          </button>
        </div>
      </div>
      {policyOpen && <TermsDialog onClose={() => setPolicyOpen(false)} />}
    </>
  )
}
