import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import { deliveryApi, type HourSlot, type LocatedAddress, type SupplyDate } from '../api/site'
import { formatSlot, formatSupplyDate, slotId, slotsFor } from './format'
import type { Missing } from './missing'

type Step = 'hour' | 'contact' | 'address' | 'ready'
type Locating = 'idle' | 'busy' | 'denied' | 'notFound' | 'failed'

interface Props {
  /** What was missing when the client pressed send: these are the steps. */
  was: Missing
  /** What is still missing now. */
  now: Missing
  name: string
  phone: string
  city: string
  street: string
  houseNumber: string
  onChange: (patch: { name?: string; phone?: string; city?: string; street?: string; houseNumber?: string }) => void
  supplyDates: SupplyDate[]
  delivery: boolean
  onPickHour: (date: string, slot: string) => void
  /** The advanced delivery method: the fee follows the address and is asked for at once when the address is settled. */
  zones: boolean
  onLocated: (found: LocatedAddress) => void
  onCalculate: () => void
  /** Switches the order to pickup, which needs no address; left out when the site has no pickup. */
  onPickup?: () => void
  /** The delivery fee is still being worked out, or the address is one that cannot be delivered to. */
  feePending: boolean
  blocked: boolean
  /** The delivery line shown on the last step, when there is one. */
  feeText: string | null
  submitting: boolean
  onSend: () => void
  onClose: () => void
}

/**
 * A floating dialog for what the order still lacks, one subject at a time (day and hour, contact details, delivery
 * address). The order page behind it does not change. A finished subject slides away and the next slides in; the last
 * step has the send button, ready once the delivery fee is worked out.
 */
export function CompleteDialog(props: Props) {
  const { was, now, supplyDates, delivery } = props
  const { t } = useTranslation()
  const trackRef = useRef<HTMLDivElement>(null)

  // Steps that need typing end with the client's "continue", so they do not move on at the first letter.
  const [confirmed, setConfirmed] = useState({ contact: false, address: false })
  const steps: Step[] = [
    ...(was.hour ? (['hour'] as const) : []),
    ...(was.name || was.phone ? (['contact'] as const) : []),
    ...(was.city || was.street || was.houseNumber ? (['address'] as const) : []),
    'ready',
  ]
  const done = (step: Step) =>
    step === 'hour'
      ? !now.hour
      : step === 'contact'
        ? !now.name && !now.phone && confirmed.contact
        : step === 'address'
          ? !now.city && !now.street && !now.houseNumber && confirmed.address
          : false
  const current = steps.find((s) => !done(s)) ?? 'ready'
  const index = steps.indexOf(current)

  // The new step's first control gets the focus once it has slid in.
  useEffect(() => {
    const slide = trackRef.current?.children[index] as HTMLElement | undefined
    slide?.querySelector<HTMLElement>('button:not([disabled]), input, select')?.focus({ preventScroll: true })
  }, [current, index])

  const dated = supplyDates.map((d) => ({ date: d.date, slots: slotsFor(d.hours, delivery) })).filter((d) => d.slots.length > 0)
  // The earliest date has the earliest hour; the slots already leave out hours that are too soon (the lead time).
  const closest: { date: string; slot: HourSlot } | undefined = dated[0] && { date: dated[0].date, slot: dated[0].slots[0] }
  const [other, setOther] = useState(false)
  const [pickDate, setPickDate] = useState('')
  const [pickHour, setPickHour] = useState('')
  const pickable = dated.find((d) => d.date === pickDate) ?? dated[0]

  const [manual, setManual] = useState(false)
  const [located, setLocated] = useState(false)
  const [locating, setLocating] = useState<Locating>('idle')
  function locate() {
    if (!navigator.geolocation) return setLocating('failed')
    setLocating('busy')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        deliveryApi
          .locate({ lat: coords.latitude, lng: coords.longitude })
          .then((found) => {
            if (!found.found) return setLocating('notFound')
            setLocating('idle')
            setLocated(true)
            setConfirmed((c) => ({ ...c, address: true }))
            props.onLocated(found)
          })
          .catch(() => setLocating('failed'))
      },
      (error) => setLocating(error.code === 1 ? 'denied' : 'failed'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  const input = (id: string, key: 'name' | 'phone' | 'city' | 'street' | 'houseNumber', label: string, extra: object = {}) => (
    <span className="field">
      <label htmlFor={`fix-${id}`}>{label}</label>
      <input id={`fix-${id}`} maxLength={100} value={props[key]} onChange={(e) => props.onChange({ [key]: e.target.value })} {...extra} />
    </span>
  )

  const addressComplete = !now.city && !now.street && !now.houseNumber

  const slides: Record<Step, React.ReactNode> = {
    hour: (
      <>
        <h3>{t('order.fix.hourTitle')}</h3>
        {closest ? (
          <>
            <div className="complete-dialog__choices">
              <button type="button" className="complete-dialog__choice" onClick={() => props.onPickHour(closest.date, slotId(closest.slot))}>
                <strong>{t('order.fix.closest')}</strong>
                <span>
                  {formatSupplyDate(closest.date, t)} · {formatSlot(closest.slot, t)}
                </span>
              </button>
              <button type="button" className="complete-dialog__choice" aria-expanded={other} onClick={() => setOther(true)}>
                <strong>{t('order.fix.otherTime')}</strong>
              </button>
            </div>
            {other && (
              <div className="complete-dialog__pick">
                <span className="field">
                  <label htmlFor="fix-date">{t('order.supplyDate')}</label>
                  <select
                    id="fix-date"
                    value={pickable?.date ?? ''}
                    onChange={(e) => {
                      setPickDate(e.target.value)
                      setPickHour('')
                    }}
                  >
                    {dated.map((d) => (
                      <option key={d.date} value={d.date}>
                        {formatSupplyDate(d.date, t)}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="field">
                  <label htmlFor="fix-hour">{t('order.deliveryHour')}</label>
                  <select id="fix-hour" value={pickHour} onChange={(e) => setPickHour(e.target.value)}>
                    <option value="">{t('order.chooseHour')}</option>
                    {pickable?.slots.map((slot) => (
                      <option key={slotId(slot)} value={slotId(slot)}>
                        {formatSlot(slot, t)}
                      </option>
                    ))}
                  </select>
                </span>
                <button type="button" disabled={!pickHour || !pickable} onClick={() => pickable && props.onPickHour(pickable.date, pickHour)}>
                  {t('order.fix.confirm')}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="form-error">{t('order.noSupplyDates')}</p>
        )}
      </>
    ),
    contact: (
      <>
        <h3>{t('order.fix.contactTitle')}</h3>
        {was.name && input('name', 'name', t('order.name'), { autoComplete: 'name' })}
        {was.phone && input('phone', 'phone', t('order.phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel', dir: 'ltr' })}
        <button type="button" disabled={now.name || now.phone} onClick={() => setConfirmed((c) => ({ ...c, contact: true }))}>
          {t('order.fix.next')}
        </button>
      </>
    ),
    address: (
      <>
        <h3>{t('order.fix.addressTitle')}</h3>
        <div className="complete-dialog__choices">
          <button type="button" className="complete-dialog__choice" onClick={locate} disabled={locating === 'busy'}>
            <strong>{locating === 'busy' ? t('address.locating') : t('order.fix.locate')}</strong>
          </button>
          <button type="button" className="complete-dialog__choice" aria-expanded={manual || located} onClick={() => setManual(true)}>
            <strong>{t('order.fix.manual')}</strong>
          </button>
        </div>
        {props.onPickup && (
          <button
            type="button"
            className="button-quiet"
            onClick={() => {
              setConfirmed((c) => ({ ...c, address: true }))
              props.onPickup?.()
            }}
          >
            {t('order.fix.pickup')}
          </button>
        )}
        {locating !== 'idle' && locating !== 'busy' && (
          <p role="alert" className="form-error">
            {t(`address.locateErrors.${locating}`)}
          </p>
        )}
        {(manual || located) && (
          <>
            <div className="complete-dialog__fields">
              {was.city && input('city', 'city', t('address.city'), { autoComplete: 'address-level2' })}
              {was.street && input('street', 'street', t('address.street'), { autoComplete: 'address-line1' })}
              {was.houseNumber && input('houseNumber', 'houseNumber', t('address.houseNumber'), { autoComplete: 'off' })}
            </div>
            <button
              type="button"
              disabled={!addressComplete}
              onClick={() => {
                setConfirmed((c) => ({ ...c, address: true }))
                if (props.zones) props.onCalculate()
              }}
            >
              {t(props.zones ? 'order.fix.nextCalculate' : 'order.fix.next')}
            </button>
          </>
        )}
      </>
    ),
    ready: (
      <>
        <h3>{t('order.fix.doneTitle')}</h3>
        {props.blocked ? (
          <p role="alert" className="form-error">
            {t('order.zones.blocked')}
          </p>
        ) : props.feePending ? (
          <p role="status">{t('order.zones.loading')}</p>
        ) : (
          <>
            <p role="status">{t('order.fix.doneHint')}</p>
            {props.feeText && <p className="complete-dialog__fee">{props.feeText}</p>}
          </>
        )}
        <div className="modal__actions">
          <button type="button" disabled={props.feePending || props.blocked || props.submitting || steps.some((s) => s !== 'ready' && !done(s))} onClick={props.onSend}>
            {props.submitting ? t('order.submitting') : t('order.submit')}
          </button>
          <button type="button" className="button-quiet" onClick={props.onClose}>
            {t('order.fix.back')}
          </button>
        </div>
      </>
    ),
  }

  return (
    <Modal title={t('order.fix.title')} onClose={props.onClose} closeButton className="complete-dialog">
      <div className="complete-dialog__viewport">
        <div ref={trackRef} className="complete-dialog__track" style={{ '--step': index } as React.CSSProperties}>
          {steps.map((step) => (
            <div key={step} className="complete-dialog__slide" inert={step !== current}>
              {slides[step]}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
