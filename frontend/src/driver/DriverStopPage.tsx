import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../api/catalog'
import type { FieldErrors } from '../api/client'
import {
  DELIVERY_NOTE_MAX_LENGTH,
  DRIVER_PAYMENT_COMMENT_MAX_LENGTH,
  driverApi,
  type DeliveryOutcome,
  type DriverStop,
} from '../api/driver'
import { paidWithChoices, type PaidWith } from '../api/operations'
import { FieldError, Status } from '../admin/ui'
import { formatNumber } from '../admin/format'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage } from '../admin/hooks'
import { firstName, whatsAppUrl } from '../admin/messages/compose'
import { navigationAddress, wazeUrl } from '../admin/route/plan'
import { shrinkImage } from '../components/shrinkImage'
import { useToast } from '../components/toast'
import { formatMoney } from '../order/format'
import { StopState, StopTimes } from './DriverPage'
import { toCollect, useDriver } from './stops'

/** "Not collected" in the payment choice. */
const NONE = 'None'
type PaymentChoice = PaidWith | typeof NONE

/** Notes a driver often needs, one tap each. */
const QUICK_NOTES: Record<DeliveryOutcome, string[]> = {
  Delivered: ['neighbour', 'door', 'guard'],
  NotDelivered: ['notHome', 'noAnswer', 'wrongAddress', 'refused'],
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })

/** One stop: the order to hand over, how to reach the client, what to collect, and the driver's report. */
export function DriverStopPage() {
  const { t } = useTranslation()
  const { orderId } = useParams()
  const { route } = useDriver()
  const index = route.stops.findIndex((s) => String(s.orderId) === orderId)
  const stop = route.stops[index]
  const [editing, setEditing] = useState(false)

  if (!stop)
    return (
      <>
        <p role="alert" className="notice notice--warning">
          {t('driver.stopNotFound')}
        </p>
        <BackLink />
      </>
    )

  const apartmentPrefix = t('address.apartmentShort', { apartment: '' }).trim()
  const whatsApp = whatsAppUrl(stop.phone, t('driver.whatsAppText', { name: firstName(stop.name) }))
  const collect = toCollect(stop)

  return (
    <article className="driver-stop-page stack" aria-labelledby="driver-stop-title">
      <BackLink />
      <header className="row row--between">
        <h2 id="driver-stop-title" className="route-stop__title">
          <span className="route-stop__number">{index + 1}</span> {stop.name}
        </h2>
        <StopState stop={stop} />
      </header>
      {stop.cancelled && (
        <p role="alert" className="notice notice--warning">
          {t('driver.cancelled')}
        </p>
      )}

      <section className="driver-card stack" aria-label={t('driver.contact')}>
        <p className="route-stop__times">
          <StopTimes stop={stop} />
        </p>
        <p className="driver-card__address">{stop.address}</p>
        <p dir="ltr" className="driver-card__phone">
          {stop.phone}
        </p>
        <p className="row driver-actions">
          <a className="button-link" href={wazeUrl(navigationAddress(stop.address, apartmentPrefix))} target="_blank" rel="noreferrer">
            {t('driver.waze')}
          </a>
          <a className="button-quiet" href={`tel:${stop.phone}`}>
            {t('driver.call')}
          </a>
          {whatsApp && (
            <a className="button-quiet" href={whatsApp} target="_blank" rel="noreferrer">
              {t('driver.whatsApp')}
            </a>
          )}
        </p>
      </section>

      {stop.notes && (
        <p className="notice driver-card__notes">
          <strong>{t('driver.clientNotes')}:</strong> {stop.notes}
        </p>
      )}

      <section className="driver-card" aria-labelledby="driver-items">
        <h3 id="driver-items">{t('driver.items')}</h3>
        <ul className="list">
          {stop.items.map((item) => (
            <li key={item.id}>
              {item.parentItemId !== null && <span aria-hidden="true">+ </span>}
              {formatNumber(item.quantity)} × {item.dishName}
              {item.optionLabel ? ` (${item.optionLabel})` : ''}
            </li>
          ))}
        </ul>
        <p className={collect > 0 && !stop.isPaid ? 'route-stop__collect' : 'muted'}>
          {stop.isPaid
            ? t(stop.paidByDriver ? 'driver.paidByYou' : 'driver.paidAlreadyTotal', {
                total: formatMoney(stop.total),
                method: t(`admin.orders.paidMethods.${stop.paidWith ?? 'Unknown'}`),
              })
            : t(stop.paymentMethod === 'Transfer' ? 'driver.collectTransfer' : 'driver.collect', { amount: formatMoney(stop.total) })}
        </p>
      </section>

      <ProofPhoto stop={stop} />

      {!stop.cancelled &&
        (stop.outcome && !editing ? (
          <ReportSummary stop={stop} onEdit={() => setEditing(true)} />
        ) : (
          <ReportForm stop={stop} onCancel={stop.outcome ? () => setEditing(false) : undefined} />
        ))}
    </article>
  )
}

function BackLink() {
  const { t } = useTranslation()
  return (
    <p>
      <Link to=".." relative="path" className="button-quiet">
        {t('driver.back')}
      </Link>
    </p>
  )
}

function ReportSummary({ stop, onEdit }: { stop: DriverStop; onEdit: () => void }) {
  const { t } = useTranslation()
  const { token, updateStop } = useDriver()
  const errorMessage = useErrorMessage()
  const [error, setError] = useState<string | null>(null)

  async function undo() {
    setError(null)
    try {
      updateStop(await driverApi.undo(token, stop.orderId))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className={`driver-card driver-report driver-report--${stop.outcome === 'Delivered' ? 'ok' : 'warn'}`} aria-label={t('driver.report')}>
      <p className="driver-report__title">
        {t(stop.outcome === 'Delivered' ? 'driver.deliveredAt' : 'driver.notDeliveredAt', { time: stop.reportedAt ? timeOf(stop.reportedAt) : '' })}
      </p>
      {stop.paidByDriver && stop.paidWith && (
        <p>
          {t('admin.orders.paidVia', { method: t(`admin.orders.paidMethods.${stop.paidWith}`) })}
          {stop.paymentComment ? ` · ${stop.paymentComment}` : ''}
        </p>
      )}
      {stop.deliveryNote && (
        <p>
          {t('driver.note')}: {stop.deliveryNote}
        </p>
      )}
      <p className="row">
        <button type="button" className="button-quiet" onClick={onEdit}>
          {t('driver.changeReport')}
        </button>
        <button type="button" className="button-quiet" onClick={() => void undo()}>
          {t('driver.undoReport')}
        </button>
      </p>
      {error && <Status message={error} error />}
    </section>
  )
}

function ReportForm({ stop, onCancel }: { stop: DriverStop; onCancel?: () => void }) {
  const { t } = useTranslation()
  const { token, updateStop } = useDriver()
  const navigate = useNavigate()
  const toast = useToast()
  const formError = useFormErrorMessage()
  const [outcome, setOutcome] = useState<DeliveryOutcome | null>(stop.outcome)
  // The driver says how it was paid every time, so a guess is never recorded.
  const [payment, setPayment] = useState<PaymentChoice | null>(stop.paidByDriver ? stop.paidWith : stop.outcome ? NONE : null)
  const [comment, setComment] = useState(stop.paidByDriver ? (stop.paymentComment ?? '') : '')
  const [note, setNote] = useState(stop.deliveryNote ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // A payment the admin recorded stays theirs; the driver only records one collected at the door.
  const asksPayment = outcome === 'Delivered' && (!stop.isPaid || stop.paidByDriver)

  function addNote(key: string) {
    const text = t(`driver.quickNotes.${key}`)
    setNote((current) => (current.includes(text) ? current : current.trim() ? `${current.trim()}, ${text}` : text))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setError(null)
    const missing: FieldErrors = {}
    if (!outcome) missing.outcome = ['required']
    if (asksPayment && !payment) missing.paidwith = ['required']
    if (outcome === 'NotDelivered' && !note.trim()) missing.note = ['required']
    if (!outcome || Object.keys(missing).length) {
      setErrors(missing)
      setError(t('errors.checkFields'))
      return
    }
    setSaving(true)
    try {
      const paidWith = asksPayment && payment !== NONE ? payment : null
      updateStop(
        await driverApi.report(token, stop.orderId, {
          outcome,
          paidWith,
          paymentComment: paidWith ? comment.trim() : '',
          note: note.trim(),
        }),
      )
      toast(t('driver.saved'))
      navigate('..', { relative: 'path' })
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
      setSaving(false)
    }
  }

  return (
    <form className="driver-card stack" onSubmit={handleSubmit} noValidate aria-label={t('driver.report')}>
      <fieldset className="driver-choice" aria-describedby="driver-outcome-error">
        <legend>{t('driver.outcome')}</legend>
        {(['Delivered', 'NotDelivered'] as const).map((value) => (
          <label key={value} className={`driver-choice__option driver-choice__option--${value}`}>
            <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
            {t(`driver.outcomes.${value}`)}
          </label>
        ))}
        <FieldError errors={errors} field="outcome" id="driver-outcome-error" />
      </fieldset>

      {asksPayment && (
        <fieldset className="driver-choice" aria-describedby="driver-paidwith-error">
          <legend>{t('driver.howPaid', { amount: formatMoney(stop.total) })}</legend>
          {[...paidWithChoices, NONE].map((value) => (
            <label key={value} className="driver-choice__option">
              <input type="radio" name="paidWith" value={value} checked={payment === value} onChange={() => setPayment(value as PaymentChoice)} />
              {value === NONE ? t('driver.notPaid') : t(`admin.orders.paidMethods.${value}`)}
            </label>
          ))}
          <FieldError errors={errors} field="paidWith" id="driver-paidwith-error" />
          {payment && payment !== NONE && (
            <span className="field">
              <label htmlFor="driver-payment-comment">{t('driver.paymentComment')}</label>
              <input
                id="driver-payment-comment"
                value={comment}
                maxLength={DRIVER_PAYMENT_COMMENT_MAX_LENGTH}
                onChange={(e) => setComment(e.target.value)}
                aria-describedby="driver-payment-comment-error"
              />
              <FieldError errors={errors} field="paymentComment" id="driver-payment-comment-error" />
            </span>
          )}
        </fieldset>
      )}

      <span className="field">
        <label htmlFor="driver-note">{t(outcome === 'NotDelivered' ? 'driver.noteWhy' : 'driver.noteOptional')}</label>
        {outcome && (
          <span className="row driver-quick-notes">
            {QUICK_NOTES[outcome].map((key) => (
              <button key={key} type="button" className="button-quiet" onClick={() => addNote(key)}>
                {t(`driver.quickNotes.${key}`)}
              </button>
            ))}
          </span>
        )}
        <textarea
          id="driver-note"
          rows={3}
          maxLength={DELIVERY_NOTE_MAX_LENGTH}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby="driver-note-error"
        />
        <FieldError errors={errors} field="note" id="driver-note-error" />
      </span>

      {error && <Status message={error} error />}
      <p className="row">
        <button type="submit" disabled={saving}>
          {saving ? t('admin.saving') : t('driver.save')}
        </button>
        {onCancel && (
          <button type="button" className="button-quiet" onClick={onCancel}>
            {t('admin.cancel')}
          </button>
        )}
      </p>
    </form>
  )
}

/** The photo of the order at the door, taken with the phone's camera; it goes up as soon as it is taken. */
function ProofPhoto({ stop }: { stop: DriverStop }) {
  const { t } = useTranslation()
  const { token, updateStop } = useDriver()
  const errorMessage = useErrorMessage()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const image = await shrinkImage(file)
      if (image.size > MAX_IMAGE_BYTES) {
        setError(t('errors.imageTooLarge'))
        return
      }
      updateStop(await driverApi.addProof(token, stop.orderId, image, image === file ? file.name : 'proof.jpg'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function remove() {
    setError(null)
    try {
      updateStop(await driverApi.removeProof(token, stop.orderId))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (stop.cancelled && !stop.proofUrl) return null
  return (
    <section className="driver-card stack" aria-labelledby="driver-proof">
      <h3 id="driver-proof">{t('driver.proof')}</h3>
      {stop.proofUrl ? (
        <img className="driver-proof" src={stop.proofUrl} alt={t('driver.proofAlt', { name: stop.name })} />
      ) : (
        <p className="hint">{t('driver.proofHint')}</p>
      )}
      <p className="row">
        <label className="button-file">
          {uploading ? t('driver.uploading') : stop.proofUrl ? t('driver.replaceProof') : t('driver.takeProof')}
          {/* capture opens the camera on a phone; a computer picks a file. */}
          <input type="file" accept={IMAGE_TYPES} capture="environment" onChange={handleFile} disabled={uploading} />
        </label>
        {stop.proofUrl && (
          <button type="button" className="button-quiet" onClick={() => void remove()}>
            {t('driver.removeProof')}
          </button>
        )}
      </p>
      {error && <Status message={error} error />}
    </section>
  )
}
