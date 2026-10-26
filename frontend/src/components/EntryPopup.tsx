import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { accountApi } from '../api/account'
import { POPUP_SLOTS, type Popup } from '../api/popup'
import { useAccount } from '../account/useAccount'
import { useOrderSignals } from '../order/orderSignals'
import { conditionsMatch, isActive, needsActivity, type Visitor } from './popupConditions'
import { Modal } from './Modal'
import { useExitIntent } from './exitIntent'
import { useSite } from '../site/useSite'

const seenKey = (slot: number) => `entry-popup-seen-${slot}`
const DEFAULT_INACTIVE_AFTER = { amount: 3, unit: 'month' } as const

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

/** The pop-ups (by slot) this browser tab has already been shown. */
const readSeen = (): ReadonlySet<number> => {
  const seen = new Set<number>()
  for (const slot of POPUP_SLOTS) {
    try {
      if (sessionStorage.getItem(seenKey(slot)) !== null) seen.add(slot)
    } catch {
      // Storage can be blocked: nothing counts as seen.
    }
  }
  return seen
}

const withSlot = (slots: ReadonlySet<number>, slot: number): ReadonlySet<number> => (slots.has(slot) ? slots : new Set(slots).add(slot))

/** The time of the client's latest order that was not cancelled; null when there is none. */
async function lastOrderTime(): Promise<Date | null> {
  const orders = await accountApi.orders()
  const times = orders.filter((o) => o.status !== 'Cancelled').map((o) => new Date(o.createdAt))
  return times.length > 0 ? new Date(Math.max(...times.map((t) => t.getTime()))) : null
}

/**
 * Opens the admin's pop-ups on the home page only. Each one opens once the visitor meets every condition the admin set
 * for it (logged in or not, active or inactive, an order restored or filled from the last or a favorite order, an order
 * total) and its own timing has come: the delay since the page loaded has passed, or, when the admin chose that, the
 * visitor seems about to leave (the delay is then how long to wait before watching for it, and the conditions are
 * checked at that moment). It opens on every page load, or once per browser tab when the admin chose that. Moving
 * between pages of the site does not open it again (the layout stays mounted). One window is open at a time: when
 * several are due, the one in the lowest slot shows first and the next one after it is closed.
 */
export function EntryPopup() {
  const site = useSite()
  const popups = site?.popups
  const inactiveAfter = site?.inactiveAfter ?? DEFAULT_INACTIVE_AFTER
  const isHome = useLocation().pathname === '/'
  const { user, loading } = useAccount()
  const order = useOrderSignals()
  const [loadedAt] = useState(() => Date.now())
  // The moment the client's last order is measured against: when the page opened.
  const [openedAt] = useState(() => new Date(loadedAt))
  // What this tab had already seen when the page loaded; a mark is written only after a pop-up is shown.
  const [seenBefore] = useState(readSeen)
  // Pop-ups whose delay has passed, those an exit intent opened, those closed, and the one on screen.
  const [elapsed, setElapsed] = useState<ReadonlySet<number>>(new Set())
  const [exited, setExited] = useState<ReadonlySet<number>>(new Set())
  const [closed, setClosed] = useState<ReadonlySet<number>>(new Set())
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  // undefined until the client's orders are in; only asked for when a pop-up has an activity condition.
  const [lastOrderAt, setLastOrderAt] = useState<Date | null | undefined>(undefined)

  const waiting = (popups ?? []).filter((p) => isHome && !closed.has(p.slot) && !(p.frequency === 'session' && seenBefore.has(p.slot)))
  const judgeActivity = Boolean(user) && (popups ?? []).some(needsActivity)
  const visitor: Visitor = {
    loggedIn: loading ? null : Boolean(user),
    active: user && lastOrderAt !== undefined ? isActive(lastOrderAt, inactiveAfter, openedAt) : null,
    order,
  }

  useEffect(() => {
    if (!judgeActivity) return
    let current = true
    lastOrderTime().then(
      (time) => current && setLastOrderAt(time),
      // The orders did not load: the pop-ups with an activity condition stay closed.
      () => {},
    )
    return () => {
      current = false
    }
  }, [judgeActivity, user?.id])

  // One timer per waiting pop-up, for what is left of its delay.
  const timers = waiting.map((p) => `${p.slot}:${p.delaySeconds}`).join(',')
  useEffect(() => {
    const handles = timers
      .split(',')
      .filter(Boolean)
      .map((entry) => {
        const [slot, delay] = entry.split(':').map(Number)
        return setTimeout(() => setElapsed((current) => withSlot(current, slot)), Math.max(0, delay * 1000 - (Date.now() - loadedAt)))
      })
    return () => handles.forEach(clearTimeout)
  }, [timers, loadedAt])

  // The pop-ups an exit intent would open right now: watched for once one of them has waited out its delay.
  const dueOnExit = waiting.filter((p) => p.trigger === 'exit' && elapsed.has(p.slot) && conditionsMatch(p, visitor)).map((p) => p.slot)
  const watchingExit = waiting.some((p) => p.trigger === 'exit' && elapsed.has(p.slot))
  const dueOnExitRef = useRef(dueOnExit)
  useEffect(() => {
    dueOnExitRef.current = dueOnExit
  })
  const exitIntent = useCallback(() => setExited((current) => dueOnExitRef.current.reduce(withSlot, current)), [])
  useExitIntent(watchingExit, exitIntent)

  const due = waiting.find((p) => (p.trigger === 'exit' ? exited.has(p.slot) : elapsed.has(p.slot) && conditionsMatch(p, visitor)))
  // The next due pop-up opens once none is on screen (adjusting state during render, as the order page does).
  if (openSlot === null && due) setOpenSlot(due.slot)

  const open = popups?.find((p) => p.slot === openSlot)
  const show = Boolean(open) && isHome && !closed.has(openSlot ?? 0)
  const openFrequency = open?.frequency
  useEffect(() => {
    if (!show || openFrequency !== 'session' || openSlot === null) return
    try {
      sessionStorage.setItem(seenKey(openSlot), '1')
    } catch {
      // Storage can be blocked; the pop-up then shows on each load.
    }
  }, [show, openFrequency, openSlot])

  if (!open || !show) return null
  return (
    <PopupView
      key={open.slot}
      popup={open}
      onClose={() => {
        setClosed((current) => withSlot(current, open.slot))
        setOpenSlot(null)
      }}
    />
  )
}
