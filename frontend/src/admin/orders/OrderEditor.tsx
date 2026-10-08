import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import { ordersAdminApi, type AdminOrder } from '../../api/operations'
import type { Fulfillment, Payment } from '../../api/site'
import { fieldErrorsOf, useFormErrorMessage } from '../hooks'
import { FieldError, Status } from '../ui'

/** Edits an order after the client called: contact details, date, payment and quantities. */
export function OrderEditor({
  order,
  onSaved,
  onClose,
}: {
  order: AdminOrder
  onSaved: (order: AdminOrder) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const errorMessage = useFormErrorMessage()
  const [name, setName] = useState(order.name)
  const [phone, setPhone] = useState(order.phone)
  const [address, setAddress] = useState(order.address)
  const [supplyDate, setSupplyDate] = useState(order.supplyDate)
  const [deliveryHour, setDeliveryHour] = useState(order.deliveryHour?.slice(0, 5) ?? '')
  const [fulfillment, setFulfillment] = useState<Fulfillment>(order.fulfillmentMethod)
  const [payment, setPayment] = useState<Payment>(order.paymentMethod)
  const [notes, setNotes] = useState(order.notes ?? '')
  // Quantity per line; a removed line is dropped (its add-ons go with it).
  const [quantities, setQuantities] = useState<Record<number, string>>(
    Object.fromEntries(order.items.map((i) => [i.id, String(i.quantity)])),
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const id = (field: string) => `order-${order.id}-${field}`
  const fieldError = (field: string) => <FieldError errors={errors} field={field} id={`${id(field)}-error`} />
  const describedBy = (field: string) => ({ 'aria-describedby': `${id(field)}-error` })

  function remove(itemId: number) {
    setQuantities((current) => {
      const next = { ...current }
      delete next[itemId]
      for (const item of order.items) if (item.parentItemId === itemId) delete next[item.id]
      return next
    })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setError(null)
    try {
      const saved = await ordersAdminApi.update(order.id, {
        name,
        phone,
        address,
        supplyDate,
        deliveryHour: deliveryHour ? `${deliveryHour}:00` : null,
        fulfillmentMethod: fulfillment,
        paymentMethod: payment,
        notes,
        items: Object.entries(quantities).map(([itemId, quantity]) => ({ id: Number(itemId), quantity: Number(quantity) })),
      })
      onSaved(saved)
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack order-editor" noValidate aria-label={t('admin.orders.editOrder', { id: order.id })}>
      <span className="field">
        <label htmlFor={id('name')}>{t('admin.orders.name')}</label>
        <input id={id('name')} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} {...describedBy('name')} />
        {fieldError('name')}
      </span>
      <span className="field">
        <label htmlFor={id('phone')}>{t('admin.orders.phone')}</label>
        <input id={id('phone')} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} {...describedBy('phone')} />
        {fieldError('phone')}
      </span>
      <span className="field">
        <label htmlFor={id('address')}>{t('admin.orders.address')}</label>
        <input id={id('address')} value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} {...describedBy('address')} />
        {fieldError('address')}
      </span>
      <span className="field">
        <label htmlFor={id('supplyDate')}>{t('admin.orders.supplyDate')}</label>
        <input id={id('supplyDate')} type="date" value={supplyDate} onChange={(e) => setSupplyDate(e.target.value)} />
      </span>
      <span className="field">
        <label htmlFor={id('deliveryHour')}>{t('admin.orders.deliveryHour')}</label>
        <input id={id('deliveryHour')} type="time" value={deliveryHour} onChange={(e) => setDeliveryHour(e.target.value)} />
      </span>
      <span className="field">
        <label htmlFor={id('fulfillment')}>{t('admin.orders.fulfillment')}</label>
        <select id={id('fulfillment')} value={fulfillment} onChange={(e) => setFulfillment(e.target.value as Fulfillment)}>
          <option value="Delivery">{t('admin.orders.delivery')}</option>
          <option value="Pickup">{t('admin.orders.pickup')}</option>
        </select>
      </span>
      <span className="field">
        <label htmlFor={id('payment')}>{t('admin.orders.payment')}</label>
        <select id={id('payment')} value={payment} onChange={(e) => setPayment(e.target.value as Payment)}>
          <option value="OnDelivery">{t('admin.orders.onDelivery')}</option>
          <option value="Transfer">{t('admin.orders.transfer')}</option>
        </select>
      </span>
      <span className="field">
        <label htmlFor={id('notes')}>{t('admin.orders.notes')}</label>
        <textarea id={id('notes')} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </span>

      <fieldset className="stack" aria-describedby={`${id('items')}-error`}>
        <legend>{t('admin.orders.items')}</legend>
        {order.items
          .filter((i) => i.id in quantities)
          .map((item) => (
            <div key={item.id} className="row">
              <span className="list__main">
                {item.parentItemId !== null && <span aria-hidden="true">+</span>}
                {item.dishName}
                {item.optionLabel && <span className="muted">({item.optionLabel})</span>}
              </span>
              <input
                aria-label={t('admin.orders.quantityOf', { name: item.dishName })}
                className="input-narrow"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={quantities[item.id]}
                onChange={(e) => setQuantities({ ...quantities, [item.id]: e.target.value })}
              />
              <button type="button" className="button-quiet" aria-label={t('admin.orders.removeLine', { name: item.dishName })} onClick={() => remove(item.id)}>
                {t('admin.remove')}
              </button>
            </div>
          ))}
        {fieldError('items')}
        <p className="hint">{t('admin.orders.editHint')}</p>
      </fieldset>

      <div className="row form-actions">
        <button type="submit" disabled={saving}>
          {saving ? t('admin.saving') : t('admin.save')}
        </button>
        <button type="button" className="button-quiet" onClick={onClose}>
          {t('admin.cancel')}
        </button>
        {error && <Status message={error} error />}
      </div>
    </form>
  )
}
