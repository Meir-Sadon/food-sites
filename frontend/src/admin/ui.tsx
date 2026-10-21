import { useContext, useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../api/client'
import { useRegisterSection, useSectionGroup } from './sectionGroup'
import { SectionContext } from './unsaved'

/** Validation messages for one field. Give the input aria-describedby={id}. */
export function FieldError({ errors, field, id }: { errors: FieldErrors; field: string; id: string }) {
  const { t } = useTranslation()
  const codes = errors[field.toLowerCase()]
  if (!codes?.length) return null
  return (
    <p id={id} className="field-error">
      {codes.map((code) => t(`errors.${code}`, { defaultValue: t('errors.generic') })).join(' ')}
    </p>
  )
}

/**
 * A small "i" button that shows what a field (or a block, or a page) is for, so the explanations don't crowd the
 * screen. Its text opens under the line it sits on; another click, Escape or a click elsewhere closes it. Put it next
 * to the label (in a `.with-info` line), never inside one.
 */
export function Info({ text, about }: { text: ReactNode; about?: string }) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.parentElement?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="info-button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={about ? t('admin.infoAbout', { name: about }) : t('admin.info')}
        onClick={(e) => {
          // Inside a summary, a click would also fold the block.
          e.preventDefault()
          setOpen(!open)
        }}
      >
        i
      </button>
      {open && (
        <span id={id} role="note" className="info-text">
          {text}
        </span>
      )}
    </>
  )
}

export function Loading({ failed }: { failed?: boolean }) {
  const { t } = useTranslation()
  return failed ? (
    <p role="alert" className="form-error">
      {t('errors.generic')}
    </p>
  ) : (
    <p role="status">{t('admin.loading')}</p>
  )
}

/** A short message that tells screen readers when something saved or failed. */
export function Status({ message, error }: { message: string | null; error?: boolean }) {
  return (
    <p role={error ? 'alert' : 'status'} className={error ? 'form-error' : 'form-status'}>
      {message}
    </p>
  )
}

/** A remove button that asks "are you sure?" in place, since the viewer may block confirm(). */
export function ConfirmRemove({
  name,
  onConfirm,
  warn,
  label,
  question,
  confirmLabel,
}: {
  name: string
  onConfirm: () => void | Promise<void>
  /** Texts for something other than removing: the button, the question and the confirm button. */
  label?: string
  question?: string
  confirmLabel?: string
  /** Runs before asking. A returned text replaces the question, to warn about what the removal affects. */
  warn?: () => Promise<string | null>
}) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)

  if (!asking)
    return (
      <button
        type="button"
        className="button-quiet"
        onClick={async () => {
          setWarning(warn ? await warn().catch(() => null) : null)
          setAsking(true)
        }}
      >
        {label ?? t('admin.remove')}
      </button>
    )

  const text = warning ?? question ?? t('admin.confirmRemove', { name })
  return (
    <span className="confirm" role="group" aria-label={text}>
      <span>{text}</span>
      <button
        type="button"
        className="button-danger"
        onClick={async () => {
          await onConfirm()
          setAsking(false)
        }}
      >
        {confirmLabel ?? t('admin.yesRemove')}
      </button>
      <button type="button" className="button-quiet" onClick={() => setAsking(false)}>
        {t('admin.cancel')}
      </button>
    </span>
  )
}

export function MoveButtons({
  name,
  first,
  last,
  onMove,
}: {
  name: string
  first: boolean
  last: boolean
  onMove: (direction: 'Up' | 'Down') => void
}) {
  const { t } = useTranslation()
  return (
    <span className="move-buttons">
      <button type="button" className="button-icon" disabled={first} aria-label={t('admin.moveUp', { name })} onClick={() => onMove('Up')}>
        ▲
      </button>
      <button type="button" className="button-icon" disabled={last} aria-label={t('admin.moveDown', { name })} onClick={() => onMove('Down')}>
        ▼
      </button>
    </span>
  )
}

/** Grip to drag a row to a new place (see `useDragSort`); keyboard and screen-reader users have the move buttons. */
export function DragHandle(props: HTMLAttributes<HTMLSpanElement>) {
  const { t } = useTranslation()
  return (
    <span className="drag-handle" aria-hidden="true" title={t('admin.dragToMove')} {...props}>
      ⠿
    </span>
  )
}

/**
 * One topic of a long form, folded under its title. The line about it stays visible above the fold, so the admin can
 * tell what each block is for without opening it. A block opens by itself when a field in it fails validation.
 */
export function FormBlock({
  title,
  about,
  defaultOpen = false,
  invalid = false,
  children,
}: {
  title: string
  about: ReactNode
  defaultOpen?: boolean
  invalid?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const id = useId()
  const [open, setOpen] = useState(defaultOpen || invalid)
  const [wasInvalid, setWasInvalid] = useState(invalid)
  if (invalid !== wasInvalid) {
    setWasInvalid(invalid)
    if (invalid) setOpen(true)
  }
  return (
    <section className={invalid ? 'form-block form-block--invalid' : 'form-block'} aria-labelledby={`${id}-title`}>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span id={`${id}-title`} className="form-block__title">
            {title}
          </span>
          <Info text={about} about={title} />
          {invalid && <span className="form-block__error">{t('admin.blockHasErrors')}</span>}
        </summary>
        <div className="stack form-block__body">{children}</div>
      </details>
    </section>
  )
}

export function Section({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string
  hint?: string
  /** Inside a `SectionGroup` a section starts folded unless this is set. */
  defaultOpen?: boolean
  children: ReactNode
}) {
  const ownId = useId()
  const id = useContext(SectionContext)?.id ?? ownId
  const group = useSectionGroup()
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [heading, setHeading] = useState<HTMLElement | null>(null)
  useRegisterSection(id, title, el, heading)
  if (!group) {
    return (
      <section className="admin-section" aria-labelledby={id}>
        <div className="with-info">
          <h2 id={id}>{title}</h2>
          {hint && <Info text={hint} about={title} />}
        </div>
        {children}
      </section>
    )
  }
  const open = group.isOpen(id, defaultOpen)
  return (
    <section className="admin-section admin-section--fold" aria-labelledby={id} ref={setEl}>
      <div className="with-info">
        <h2 id={id}>
          <button
            type="button"
            className="admin-section__toggle"
            aria-expanded={open}
            aria-controls={`${id}-body`}
            onClick={() => group.toggle(id, defaultOpen)}
            ref={setHeading}
          >
            {title}
          </button>
        </h2>
        {hint && <Info text={hint} about={title} />}
      </div>
      <div id={`${id}-body`} className="admin-section__body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}
