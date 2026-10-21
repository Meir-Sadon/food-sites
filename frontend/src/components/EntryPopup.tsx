import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Popup } from '../api/popup'
import { Modal } from './Modal'
import { useExitIntent } from './exitIntent'
import { useSite } from '../site/useSite'

const SEEN_KEY = 'entry-popup-seen'

/** A page of this site ("/about") opens in place; anything else is an https address and opens in a new tab. */
const isInternal = (url: string) => url.startsWith('/')

/**
 * The window the business shows when its site opens: a picture, a title, some text and an optional button.
 * Also used by the admin to preview it, with what is typed so far.
 */
export function PopupView({ popup, onClose }: { popup: Popup; onClose: () => void }) {
  const { t } = useTranslation()
  const hasButton = Boolean(popup.buttonText && popup.buttonUrl)
  return (
    <Modal
      title={popup.title ?? ''}
      onClose={onClose}
      closeButton
      className={`entry-popup entry-popup--${popup.size}${popup.imageUrl ? ' entry-popup--picture' : ''}`}
      top={popup.imageUrl ? <img className="entry-popup__image" src={popup.imageUrl} alt="" /> : undefined}
    >
      {popup.body && <p className="entry-popup__body">{popup.body}</p>}
      {hasButton &&
        (isInternal(popup.buttonUrl!) ? (
          <Link className="button-link entry-popup__button" to={popup.buttonUrl!} onClick={onClose}>
            {popup.buttonText}
          </Link>
        ) : (
          <a className="button-link entry-popup__button" href={popup.buttonUrl!} target="_blank" rel="noopener noreferrer" onClick={onClose}>
            {popup.buttonText}
          </a>
        ))}
      <button type="button" className="button-quiet entry-popup__dismiss" onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}

const readSeen = () => {
  try {
    return sessionStorage.getItem(SEEN_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Opens the admin's pop-up on the home page only: once the delay has passed after the page loaded, or, when the admin
 * chose that, only when the visitor seems about to leave (the delay is then how long to wait before watching for it).
 * It opens on every page load, or once per browser tab when the admin chose that. Moving between pages of the site does
 * not open it again (the layout stays mounted).
 */
export function EntryPopup() {
  const popup = useSite()?.popup
  const isHome = useLocation().pathname === '/'
  const [loadedAt] = useState(() => Date.now())
  // Whether this tab had already seen it when the page loaded; the mark is written only after it is shown.
  const [seenBefore] = useState(readSeen)
  const [triggered, setTriggered] = useState(false)
  const [closed, setClosed] = useState(false)
  const [armed, setArmed] = useState(false)
  const waiting = Boolean(popup) && isHome && !closed && !triggered && !(popup?.frequency === 'session' && seenBefore)
  const trigger = popup?.trigger ?? 'load'
  const delay = popup?.delaySeconds ?? 0
  const show = Boolean(popup) && isHome && triggered && !closed

  useEffect(() => {
    if (!waiting) return
    const wait = Math.max(0, delay * 1000 - (Date.now() - loadedAt))
    const timer = setTimeout(() => (trigger === 'exit' ? setArmed(true) : setTriggered(true)), wait)
    return () => clearTimeout(timer)
  }, [waiting, trigger, delay, loadedAt])

  const open = useCallback(() => setTriggered(true), [])
  useExitIntent(waiting && trigger === 'exit' && armed, open)

  useEffect(() => {
    if (!show || popup?.frequency !== 'session') return
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Storage can be blocked; the pop-up then shows on each load.
    }
  }, [show, popup?.frequency])

  if (!popup || !show) return null
  return <PopupView popup={popup} onClose={() => setClosed(true)} />
}
