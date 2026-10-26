import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { connectedTools } from '../tracking/tools'
import { useSite } from '../site/useSite'

/**
 * The terms and policy. Its privacy section follows what the owner connected: with no marketing tool it says there is
 * none, with some it names them, says what they receive and how to change the choice, without the owner writing it.
 */
export function TermsSections() {
  const { t } = useTranslation()
  const site = useSite()
  const tracking = site?.tracking
  const sections = t('footer.terms.sections', { returnObjects: true }) as { title: string; text: string }[]
  const tools = connectedTools(tracking, t)
  const privacy =
    tools.length === 0
      ? t('footer.terms.privacyNoTools')
      : [
          t('footer.terms.privacyTools', { tools: tools.join(', ') }),
          tracking?.metaServerEvents && tracking.metaPixelId ? t('footer.terms.privacyServerEvents') : null,
        ]
          .filter(Boolean)
          .join(' ')
  const google = site?.googleClientId ? ` ${t('footer.terms.privacyGoogle')}` : ''

  return (
    <>
      {sections.map((s) => (
        <section key={s.title} className="terms-section">
          <h3>{s.title}</h3>
          <p>
            {s.text}
            {s.title === t('footer.terms.privacyTitle') && ` ${privacy}${google}`}
          </p>
        </section>
      ))}
    </>
  )
}

/** The terms as a dialog, opened from the footer. */
export function TermsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal title={t('footer.terms.title')} onClose={onClose}>
      <TermsSections />
      <button type="button" onClick={onClose}>
        {t('footer.terms.close')}
      </button>
    </Modal>
  )
}
