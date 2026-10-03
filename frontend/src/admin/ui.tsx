import { useId, useState, type ReactNode } from 'react'
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
export function ConfirmRemove({ name, onConfirm }: { name: string; onConfirm: () => void | Promise<void> }) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)

  if (!asking)
    return (
      <button type="button" className="button-quiet" onClick={() => setAsking(true)}>
        {t('admin.remove')}
      </button>
    )

  return (
    <span className="confirm" role="group" aria-label={t('admin.confirmRemove', { name })}>
      <span>{t('admin.confirmRemove', { name })}</span>
      <button
        type="button"
        className="button-danger"
        onClick={async () => {
          await onConfirm()
          setAsking(false)
        }}
      >
        {t('admin.yesRemove')}
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
