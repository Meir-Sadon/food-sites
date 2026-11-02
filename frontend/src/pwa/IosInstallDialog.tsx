import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import { isIosSafari } from './install'

/** iPhone has no install offer: the steps for Share → Add to Home Screen (or "open in Safari" from another browser). */
export function IosInstallDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal title={t('pwa.installTitle')} onClose={onClose}>
      {isIosSafari() ? (
        <>
          <p>{t('pwa.installIosIntro')}</p>
          <ol>
            <li>{t('pwa.installIosStep1')}</li>
            <li>{t('pwa.installIosStep2')}</li>
            <li>{t('pwa.installIosStep3')}</li>
          </ol>
        </>
      ) : (
        <p>{t('pwa.installIosNotSafari')}</p>
      )}
      <button type="button" onClick={onClose}>
        {t('pwa.close')}
      </button>
    </Modal>
  )
}
