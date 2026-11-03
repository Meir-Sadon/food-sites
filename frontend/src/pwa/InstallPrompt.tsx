import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import { site } from '../site/config'
import { isIosSafari, useInstallApp } from './install'
import { usePopupGate } from './promptGate'

/** One key per site, so two sites on the same origin (localhost) each ask once. */
export const INSTALL_PROMPT_KEY = `${site.id}.installPrompted`

/** How long after the business's own pop-up closed the install window waits; without a pop-up it waits a little for the page to settle. */
export const AFTER_POPUP_MS = 10_000
export const FIRST_VISIT_MS = 3_000

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
 * is closed, and never when the site already runs as an app). It waits for the browser's install offer (or an iPhone)
 * and for the business's entry pop-up: it opens 10 seconds after the pop-up closed, or soon after the page opens
 * when there is none. The X, the "not now" button and a tap on the background all close it.
 */
export function InstallPrompt() {
  const { t } = useTranslation()
  const { mode, install } = useInstallApp()
  const gate = usePopupGate()
  const [open, setOpen] = useState(false)
  const idleSince = gate.idleSince

  useEffect(() => {
    if (mode === 'none' || open || read() || gate.busy || idleSince === null) return
    const wait = gate.hadPopup ? AFTER_POPUP_MS : FIRST_VISIT_MS
    const timer = setTimeout(
      () => {
        remember()
        setOpen(true)
      },
      Math.max(0, wait - (Date.now() - idleSince)),
    )
    return () => clearTimeout(timer)
  }, [mode, open, gate.busy, gate.hadPopup, idleSince])

  if (!open || mode === 'none') return null
  const close = () => setOpen(false)
  return (
    <Modal
      title={t('pwa.promptTitle')}
      onClose={close}
      closeButton
      className="install-prompt"
      top={
        <div className="install-prompt__top" aria-hidden="true">
          <img className="install-prompt__icon" src="/icon-192.png" alt="" />
        </div>
      }
    >
      <p className="install-prompt__text">{t('pwa.promptIntro')}</p>
      {mode === 'ios' &&
        (isIosSafari() ? (
          <ol className="install-prompt__steps">
            <li>{t('pwa.installIosStep1')}</li>
            <li>{t('pwa.installIosStep2')}</li>
            <li>{t('pwa.installIosStep3')}</li>
          </ol>
        ) : (
          <p className="install-prompt__text">{t('pwa.installIosNotSafari')}</p>
        ))}
      {mode === 'native' && (
        <button
          type="button"
          className="install-prompt__button"
          onClick={() => {
            close()
            void install()
          }}
        >
          {t('pwa.installNow')}
        </button>
      )}
      <button type="button" className="button-quiet install-prompt__dismiss" onClick={close}>
        {t(mode === 'native' ? 'pwa.notNow' : 'pwa.close')}
      </button>
    </Modal>
  )
}
