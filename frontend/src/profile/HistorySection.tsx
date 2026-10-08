import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_FAVORITE_NAME_LENGTH, type HistoryItem, type HistoryOrder } from '../api/account'
import { FieldError, Status } from '../admin/ui'
import { fieldErrorsOf, useFormErrorMessage } from '../admin/hooks'
import { formatMoney, formatSupplyDate } from '../order/format'
import type { FieldErrors } from '../api/client'
import { useToast } from '../components/toast'

const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 3 })

const itemText = (item: HistoryItem) =>
  `${number.format(item.quantity)} × ${item.dishName}${item.optionLabel ? ` (${item.optionLabel})` : ''}`

interface EntryProps {
  order: HistoryOrder
  onReorder: (order: HistoryOrder) => Promise<void>
  /** Missing when the site has no favorites: then there's no button to save one. */
  onSaveFavorite?: (order: HistoryOrder, name: string) => Promise<void>
}

function HistoryEntry({ order, onReorder, onSaveFavorite }: EntryProps) {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const nameId = `favorite-name-${order.id}`

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!onSaveFavorite) return
    setErrors({})
    setError(null)
    setBusy(true)
    try {
      await onSaveFavorite(order, name.trim())
      setNaming(false)
      setName('')
      toast(t('profile.favoriteSaved'))
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
    } finally {
      setBusy(false)
    }
  }

  async function reorder() {
    setError(null)
    try {
      await onReorder(order)
    } catch (err) {
      setError(err instanceof Error && err.message === 'empty' ? t('profile.reorderEmpty') : t('errors.generic'))
    }
  }

  return (
    <li className="history__order">
      <article aria-label={t('profile.orderLabel', { id: order.id })}>
        <header className="row row--between">
          <strong>{t('profile.orderLabel', { id: order.id })}</strong>
          <span className="badge">{t(`profile.status.${order.status}`)}</span>
        </header>
        <p className="muted">
          {formatSupplyDate(order.supplyDate, t)} ·{' '}
          {order.fulfillmentMethod === 'Delivery' ? t('order.delivery') : t('order.pickup')} ·{' '}
          <span className="numeric">{formatMoney(order.total)}</span>
        </p>
        <ul className="summary">
          {order.items.map((item) => (
            <li key={item.id} className={item.parentItemId !== null ? 'summary__addon' : undefined}>
              <span>{itemText(item)}</span>
              <span className="numeric">{formatMoney(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        {naming ? (
          <form className="row row--end" onSubmit={save} noValidate>
            <span className="field field--grow">
              <label htmlFor={nameId}>{t('profile.favoriteName')}</label>
              <input
                id={nameId}
                maxLength={MAX_FAVORITE_NAME_LENGTH}
                value={name}
                aria-describedby={`${nameId}-error`}
                onChange={(e) => setName(e.target.value)}
              />
              <FieldError errors={errors} field="name" id={`${nameId}-error`} />
            </span>
            <button type="submit" disabled={busy || name.trim() === ''}>
              {t('profile.saveFavoriteConfirm')}
            </button>
            <button type="button" className="button-quiet" onClick={() => setNaming(false)}>
              {t('admin.cancel')}
            </button>
          </form>
        ) : (
          <div className="row">
            <button type="button" onClick={reorder}>
              {t('profile.reorder')}
            </button>
            {onSaveFavorite && (
              <button type="button" className="button-quiet" onClick={() => setNaming(true)}>
                {t('profile.saveFavorite')}
              </button>
            )}
          </div>
        )}
        {error && <Status message={error} error />}
      </article>
    </li>
  )
}

interface Props {
  orders: HistoryOrder[]
  onReorder: (order: HistoryOrder) => Promise<void>
  /** Missing when the site has no favorites: then there's no button to save one. */
  onSaveFavorite?: (order: HistoryOrder, name: string) => Promise<void>
}

export function HistorySection({ orders, onReorder, onSaveFavorite }: Props) {
  const { t } = useTranslation()
  return (
    <section className="account-section" aria-labelledby="profile-history-title">
      <h2 id="profile-history-title">{t('profile.history')}</h2>
      {orders.length === 0 ? (
        <p>{t('profile.noOrders')}</p>
      ) : (
        <ul className="history">
          {orders.map((order) => (
            <HistoryEntry key={order.id} order={order} onReorder={onReorder} onSaveFavorite={onSaveFavorite} />
          ))}
        </ul>
      )}
    </section>
  )
}
