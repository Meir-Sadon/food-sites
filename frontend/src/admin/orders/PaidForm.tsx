import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import { ordersAdminApi, paidWithChoices, type AdminOrder, type PaidWith } from '../../api/operations'
import { fieldErrorsOf, useFormErrorMessage } from '../hooks'
import { FieldError, Status } from '../ui'

/** A transfer was asked to go by Bit or PayBox, so Bit is the likelier guess; otherwise cash at the door. */
const suggested = (order: AdminOrder): PaidWith => (order.paymentMethod === 'Transfer' ? 'Bit' : 'Cash')

/** Marks an order paid: how it was paid is required, a comment is optional. */
export function PaidForm({
  order,
  onSaved,
  onClose,
}: {
  order: AdminOrder
  onSaved: (change: Pick<AdminOrder, 'isPaid' | 'paidWith' | 'paymentComment'>) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useFormErrorMessage()
  const [paidWith, setPaidWith] = useState<PaidWith>(suggested(order))
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const id = (field: string) => `order-${order.id}-${field}`

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setError(null)
    try {
      await ordersAdminApi.setPaid(order.id, { isPaid: true, paidWith, paymentComment: comment })
      onSaved({ isPaid: true, paidWith, paymentComment: comment.trim() || null })
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack order-editor no-print" noValidate aria-label={t('admin.orders.markPaidFor', { id: order.id })}>
      <div className="row">
        <span className="field field--narrow">
          <label htmlFor={id('paidWith')}>{t('admin.orders.paidWith')}</label>
          <select
            id={id('paidWith')}
            value={paidWith}
            onChange={(e) => setPaidWith(e.target.value as PaidWith)}
            aria-describedby={`${id('paidWith')}-error`}
          >
            {paidWithChoices.map((method) => (
              <option key={method} value={method}>
                {t(`admin.orders.paidMethods.${method}`)}
              </option>
            ))}
          </select>
          <FieldError errors={errors} field="paidWith" id={`${id('paidWith')}-error`} />
        </span>
        <span className="field">
          <label htmlFor={id('paymentComment')}>{t('admin.orders.paymentComment')}</label>
          <input
            id={id('paymentComment')}
            value={comment}
            maxLength={200}
            onChange={(e) => setComment(e.target.value)}
            aria-describedby={`${id('paymentComment')}-error`}
          />
          <FieldError errors={errors} field="paymentComment" id={`${id('paymentComment')}-error`} />
        </span>
      </div>
      <div className="row">
        <button type="submit" disabled={saving}>
          {saving ? t('admin.saving') : t('admin.orders.markPaid')}
        </button>
        <button type="button" className="button-quiet" onClick={onClose}>
          {t('admin.cancel')}
        </button>
      </div>
      {error && <Status message={error} error />}
    </form>
  )
}
