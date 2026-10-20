import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

/**
 * A dialog over the page. Focus moves into it, Escape closes it and focus returns to where it was.
 * Tab stays inside it. Tapping the dimmed area behind it closes it like Escape and the dialog's own buttons do
 * (a press that starts inside the dialog and ends outside, such as selecting text, does not).
 */
export function Modal({
  title,
  onClose,
  wide,
  closeButton,
  className,
  top,
  children,
}: {
  title: string
  onClose: () => void
  /** A wider dialog, for when its buttons should sit on one line. */
  wide?: boolean
  /** An X in the corner that closes the dialog, for ones with a lot in them (a dish's choices). */
  closeButton?: boolean
  /** Extra classes on the dialog, for one that has a look of its own (the entry pop-up). */
  className?: string
  /** Shown above the title, edge to edge (a picture). */
  top?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => previous?.focus?.()
  }, [])

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !ref.current) return
    const focusable = ref.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]')
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // Rendered at the end of <body>, so pressing inside it never counts as pressing the card or tile it was opened from.
  return createPortal(
    <div
      className={className ? `modal-backdrop ${className}__backdrop` : 'modal-backdrop'}
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedBackdrop.current) onClose()
        pressedBackdrop.current = false
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[wide ? 'modal modal--wide' : 'modal', className].filter(Boolean).join(' ')}
        onKeyDown={handleKeyDown}
      >
        {closeButton && (
          <button type="button" className="modal__close" aria-label={t('dialog.close')} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {top}
        <h2 id={titleId} className={closeButton ? 'modal__title--with-close' : undefined}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}
