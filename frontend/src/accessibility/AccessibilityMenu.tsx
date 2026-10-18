import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { applyPrefs, clearApplied, DEFAULT_PREFS, isDefault, loadPrefs, savePrefs, TEXT_SIZES, type A11yPrefs } from './prefs'

type Toggle = Exclude<keyof A11yPrefs, 'textSize'>

const TOGGLES: readonly Toggle[] = ['highContrast', 'grayscale', 'highlightLinks', 'readableFont', 'stopMotion', 'bigCursor']

/** The "universal access" figure: a head, outstretched arms, a body and legs. */
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4.5" r="1.6" fill="currentColor" />
      <path d="M5 8.5h14M12 8.5v5M12 13.5l-3 6M12 13.5l3 6" />
    </svg>
  )
}

/**
 * A small floating button that opens a compact accessibility menu: text size, contrast, grayscale, links, a readable
 * font, no animation and a big cursor. The choices stay in this browser (`prefs.ts`) and are applied to `<html>`.
 */
export function AccessibilityMenu() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<A11yPrefs>(loadPrefs)
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useLayoutEffect(() => {
    applyPrefs(prefs)
  }, [prefs])
  // Leaving the client pages (the admin) takes the choices off the document again.
  useEffect(() => clearApplied, [])

  function change(patch: Partial<A11yPrefs>) {
    setPrefs((current) => {
      const next = { ...current, ...patch }
      savePrefs(next)
      return next
    })
  }

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) toggle.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLElement>('.a11y__panel button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true)
    }
    const onPress = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPress)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [open])

  const last = TEXT_SIZES.length - 1

  return (
    <div className="a11y" ref={root}>
      <button
        type="button"
        ref={toggle}
        className="a11y__toggle"
        aria-label={t('accessibility.button')}
        title={t('accessibility.button')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <PersonIcon />
      </button>
      {open && (
        <div id={panelId} className="a11y__panel" role="dialog" aria-label={t('accessibility.title')}>
          <div className="a11y__head">
            <strong>{t('accessibility.title')}</strong>
            <button type="button" className="a11y__close" aria-label={t('accessibility.close')} title={t('accessibility.close')} onClick={() => close(true)}>
              ×
            </button>
          </div>
          <div className="a11y__size" role="group" aria-label={t('accessibility.textSize')}>
            <button
              type="button"
              aria-label={t('accessibility.smaller')}
              title={t('accessibility.smaller')}
              disabled={prefs.textSize === 0}
              onClick={() => change({ textSize: prefs.textSize - 1 })}
            >
              <span aria-hidden="true">א−</span>
            </button>
            <span className="a11y__level" role="status">
              {t('accessibility.sizeLevel', { percent: TEXT_SIZES[prefs.textSize] })}
            </span>
            <button
              type="button"
              aria-label={t('accessibility.larger')}
              title={t('accessibility.larger')}
              disabled={prefs.textSize === last}
              onClick={() => change({ textSize: prefs.textSize + 1 })}
            >
              <span aria-hidden="true">א+</span>
            </button>
          </div>
          <div className="a11y__options">
            {TOGGLES.map((key) => (
              <button key={key} type="button" className="a11y__option" aria-pressed={prefs[key]} onClick={() => change({ [key]: !prefs[key] })}>
                {t(`accessibility.options.${key}`)}
              </button>
            ))}
          </div>
          <div className="a11y__foot">
            <button type="button" className="a11y__reset" disabled={isDefault(prefs)} onClick={() => change(DEFAULT_PREFS)}>
              {t('accessibility.reset')}
            </button>
            <Link to="/accessibility" onClick={() => setOpen(false)}>
              {t('accessibility.statementLink')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
