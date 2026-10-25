import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import { ordersAdminApi, type AdminOrder } from '../../api/operations'
import { fieldErrorsOf, useFormErrorMessage } from '../hooks'
import { FieldError, Status } from '../ui'

/** Cancels an order: the reason is required, since the business pays no sales commission on a cancelled order. */
export function CancelForm({
  order,
  onSaved,
  onClose,
}: {
  order: AdminOrder
  onSaved: (change: Pick<AdminOrder, 'status' | 'cancelReason' | 'cancelledAt'>) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useFormErrorMessage()
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reasonId = `order-${order.id}-cancelReason`

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!reason.trim()) {
      setErrors({ cancelReason: ['required'] })
      return
    }
    setSaving(true)
    setErrors({})
    setError(null)
    try {
      await ordersAdminApi.cancel(order.id, reason)
      onSaved({ status: 'Cancelled', cancelReason: reason.trim(), cancelledAt: new Date().toISOString() })
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack order-editor no-print" noValidate aria-label={t('admin.orders.cancelFor', { id: order.id })}>
      <p>{t('admin.orders.confirmCancel', { id: order.id })}</p>
      <span className="field">
        <label htmlFor={reasonId}>{t('admin.orders.cancelReason')}</label>
        <input
          id={reasonId}
          value={reason}
          maxLength={300}
          required
          aria-required="true"
          aria-describedby={`${reasonId}-error`}
          onChange={(e) => setReason(e.target.value)}
        />
        <FieldError errors={errors} field="cancelReason" id={`${reasonId}-error`} />
      </span>
      <div className="row">
        <button type="submit" disabled={saving}>
          {saving ? t('admin.saving') : t('admin.orders.yesCancel')}
        </button>
        <button type="button" className="button-quiet" onClick={onClose}>
          {t('admin.orders.keepOrder')}
        </button>
      </div>
      {error && <Status message={error} error />}
    </form>
  )
}
