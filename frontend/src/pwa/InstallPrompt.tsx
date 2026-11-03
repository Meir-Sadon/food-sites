import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import { site } from '../site/config'
import { isIosSafari, useInstallApp } from './install'

/** One key per site, so two sites on the same origin (localhost) each ask once. */
export const INSTALL_PROMPT_KEY = `${site.id}.installPrompted`

const read = () => {
  try {
    return localStorage.getItem(INSTALL_PROMPT_KEY) !== null
  } catch {
    return false
  }
}
const remember = () => {
  try {
    localStorage.setItem(INSTALL_PROMPT_KEY, '1')
  } catch {
    // Storage can be blocked: the window may then show again on a later visit.
  }
}

/**
 * The window that offers to install the site as an app, shown once on a browser's first visit (not again after it
 * is closed, and never when the site already runs as an app). It waits for the browser's install offer (or an iPhone),
 * and for any other window, such as the business's entry pop-up, to be closed first.
 */
export function InstallPrompt() {
  const { t } = useTranslation()
  const { mode, install } = useInstallApp()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (mode === 'none' || open || read()) return
    const timer = setInterval(() => {
      if (document.querySelector('[role="dialog"]')) return
      clearInterval(timer)
      remember()
      setOpen(true)
    }, 1500)
    return () => clearInterval(timer)
  }, [mode, open])

  if (!open || mode === 'none') return null
  const close = () => setOpen(false)
  return (
    <Modal title={t('pwa.installTitle')} onClose={close}>
      <p>{t(mode === 'native' ? 'pwa.promptIntro' : 'pwa.installIosIntro')}</p>
      {mode === 'ios' &&
        (isIosSafari() ? (
          <ol>
            <li>{t('pwa.installIosStep1')}</li>
            <li>{t('pwa.installIosStep2')}</li>
            <li>{t('pwa.installIosStep3')}</li>
          </ol>
        ) : (
          <p>{t('pwa.installIosNotSafari')}</p>
        ))}
      {mode === 'native' && (
        <button
          type="button"
          onClick={() => {
            close()
            void install()
          }}
        >
          {t('pwa.installNow')}
        </button>
      )}{' '}
      <button type="button" className="button-quiet" onClick={close}>
        {t(mode === 'native' ? 'pwa.notNow' : 'pwa.close')}
      </button>
    </Modal>
  )
}
