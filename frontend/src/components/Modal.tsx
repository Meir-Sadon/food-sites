import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * A dialog over the page. Focus moves into it, Escape closes it and focus returns to where it was.
 * Tab stays inside it. Tapping the dimmed area behind it closes it like Escape and the dialog's own buttons do
 * (a press that starts inside the dialog and ends outside, such as selecting text, does not).
 */
export function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string
  onClose: () => void
  /** A wider dialog, for when its buttons should sit on one line. */
  wide?: boolean
  children: ReactNode
}) {
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

  return (
    <div
      className="modal-backdrop"
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
        className={wide ? 'modal modal--wide' : 'modal'}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
