import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IosInstallDialog } from './IosInstallDialog'
import { useInstallApp } from './install'

/**
 * The top bar's download button, in its own colour, with a small "!" on its top corner that opens a tooltip saying what it does.
 * Tapping the button installs the site as an app at once (the browser's install question); on an iPhone, which has no such
 * question, it opens the steps instead. Hidden when the site already runs as an app or the browser cannot install it.
 */
export function InstallButton() {
  const { t } = useTranslation()
  const { mode, install } = useInstallApp()
  const [hint, setHint] = useState(false)
  const [steps, setSteps] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const hintId = useId()

  useEffect(() => {
    if (!hint) return
    const onPress = (event: Event) => {
      if (!wrap.current?.contains(event.target as Node)) setHint(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHint(false)
    }
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey)
    }
  }, [hint])

  if (mode === 'none') return null
  return (
    <span className="install-button" ref={wrap}>
      <button
        type="button"
        className="install-button__main"
        aria-label={t('pwa.buttonLabel')}
        title={t('pwa.buttonLabel')}
        onClick={() => (mode === 'native' ? void install() : setSteps(true))}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" />
        </svg>
      </button>
      <button
        type="button"
        className="install-button__hint"
        aria-label={t('pwa.hintLabel')}
        aria-expanded={hint}
        aria-controls={hint ? hintId : undefined}
        onClick={() => setHint((open) => !open)}
      >
        !
      </button>
      {hint && (
        <span id={hintId} role="tooltip" className="install-button__tip">
          {t('pwa.hintText')}
        </span>
      )}
      {steps && <IosInstallDialog onClose={() => setSteps(false)} />}
    </span>
  )
}
