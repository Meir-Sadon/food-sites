import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

/**
 * A dish picture over the whole screen, shown whole on a dark background. A press on the picture or behind it, the X
 * and Escape close it; with several pictures the arrows (or the arrow keys) move between them. It is rendered in its own
 * layer on top of the dialog it was opened from and keeps every key press to itself, so the dialog stays as it was.
 */
export function ImageViewer({ images, name, onClose }: { images: string[]; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const many = images.length > 1
  const rtl = document.documentElement.dir === 'rtl'
  const current = index % images.length

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  function step(delta: number) {
    setIndex((i) => (i + delta + images.length) % images.length)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    event.stopPropagation()
    if (event.key === 'Escape') {
      onClose()
    } else if (many && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      // Left shows the next picture in a left-to-right page and the previous one in a right-to-left page, like the arrows.
      step((event.key === 'ArrowLeft') !== rtl ? -1 : 1)
    } else if (event.key === 'Tab' && ref.current) {
      const focusable = ref.current.querySelectorAll<HTMLElement>('button')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return createPortal(
    <div
      ref={ref}
      className="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <img
        className="image-viewer__img"
        src={images[current]}
        alt={many ? t('order.imageOf', { name, n: current + 1, count: images.length }) : name}
      />
      <button
        ref={closeRef}
        type="button"
        className="image-viewer__close"
        aria-label={t('order.closeImage')}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {many && (
        <>
          <button
            type="button"
            className="image-viewer__nav image-viewer__nav--prev"
            aria-label={t('order.previousImage')}
            onClick={(event) => {
              event.stopPropagation()
              step(-1)
            }}
          >
            <span aria-hidden="true">{rtl ? '›' : '‹'}</span>
          </button>
          <button
            type="button"
            className="image-viewer__nav image-viewer__nav--next"
            aria-label={t('order.nextImage')}
            onClick={(event) => {
              event.stopPropagation()
              step(1)
            }}
          >
            <span aria-hidden="true">{rtl ? '‹' : '›'}</span>
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
