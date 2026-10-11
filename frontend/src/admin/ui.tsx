import { useId, useState, type HTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../api/client'

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
  about: string
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
      <p id={`${id}-about`} className="hint form-block__about">
        {about}
      </p>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary aria-describedby={`${id}-about`}>
          <span id={`${id}-title`} className="form-block__title">
            {title}
          </span>
          {invalid && <span className="form-block__error">{t('admin.blockHasErrors')}</span>}
        </summary>
        <div className="stack form-block__body">{children}</div>
      </details>
    </section>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="admin-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  )
}
