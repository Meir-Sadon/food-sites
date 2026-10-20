import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Popup } from '../api/popup'
import { Modal } from './Modal'
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
 * Opens the admin's pop-up once the site is loaded: on every page load, or once per browser tab when the admin chose
 * that. Moving between pages of the site does not open it again (the layout stays mounted).
 */
export function EntryPopup() {
  const popup = useSite()?.popup
  // Whether this tab had already seen it when the page loaded; the mark is written only after it is shown.
  const [seenBefore] = useState(readSeen)
  const [closed, setClosed] = useState(false)
  const show = Boolean(popup) && !closed && !(popup?.frequency === 'session' && seenBefore)

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
