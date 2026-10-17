import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasMarketingTools } from '../tracking/marketing'
import { postponeConsent, setConsent, useConsent, usePostponed } from '../tracking/consent'
import { useSite } from '../site/useSite'
import { TermsDialog } from './TermsDialog'

/**
 * Asks the visitor whether the site may use the owner's marketing tools (they keep cookies). Shown only when a tool is
 * connected and the visitor has not answered. Three equal buttons: agree, necessary only (remembered, not asked again) and
 * not now (asked again next visit). The sentence is general; the privacy policy names the tools. Nothing is loaded before a "yes".
 */
export function ConsentBanner() {
  const { t } = useTranslation()
  const tracking = useSite()?.tracking
  const consent = useConsent()
  const postponed = usePostponed()
  const [policyOpen, setPolicyOpen] = useState(false)
  if (!hasMarketingTools(tracking) || consent !== null || postponed) return null
  return (
    <>
      <div className="consent-banner" role="region" aria-label={t('consent.title')}>
        <p>
          <strong>{t('consent.title')}</strong> {t('consent.text')}{' '}
          <button type="button" className="link-button" onClick={() => setPolicyOpen(true)}>
            {t('consent.policy')}
          </button>
        </p>
        <div className="consent-banner__actions">
          <button type="button" onClick={() => setConsent('granted')}>
            {t('consent.accept')}
          </button>
          <button type="button" onClick={() => setConsent('denied')}>
            {t('consent.necessary')}
          </button>
          <button type="button" onClick={postponeConsent}>
            {t('consent.later')}
          </button>
        </div>
      </div>
      {policyOpen && <TermsDialog onClose={() => setPolicyOpen(false)} />}
    </>
  )
}
