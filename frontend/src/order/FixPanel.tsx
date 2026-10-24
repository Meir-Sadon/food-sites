import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deliveryApi, type HourSlot, type LocatedAddress, type SupplyDate } from '../api/site'
import { scrollBehavior } from '../components/motion'
import { holdScroll } from '../components/scrollToInvalid'
import { anyMissing, type Missing } from './missing'
import { formatSlot, formatSupplyDate, slotId, slotsFor } from './format'

interface Props {
  /** What was missing when the client pressed send. */
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
  /** The chosen date and hour, to confirm what was picked. */
  chosen: { date: string; slot: HourSlot } | null
  onPickHour: (date: string, slot: string) => void
  /** The advanced delivery method: the fee follows the address, and can be asked for at once. */
  zones: boolean
  onLocated: (found: LocatedAddress) => void
  onCalculate: () => void
}

type Locating = 'idle' | 'busy' | 'denied' | 'notFound' | 'failed'

/**
 * Shown right above the send button when the order cannot be sent yet: the client settles what is missing here
 * instead of being taken to each field. The day and hour come as "the closest possible" or a pick; an incomplete
 * address as "find my location" and the parts that are missing.
 */
export function FixPanel(props: Props) {
  const { was, now, supplyDates, delivery, chosen } = props
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const done = !anyMissing(now)

  // Opening the panel keeps the client where they are: it only makes sure the panel itself is on screen.
  useEffect(() => {
    holdScroll()
    ref.current?.scrollIntoView?.({ behavior: scrollBehavior(), block: 'nearest' })
    ref.current?.focus({ preventScroll: true })
  }, [])

  const dated = supplyDates
    .map((d) => ({ date: d.date, slots: slotsFor(d.hours, delivery) }))
    .filter((d) => d.slots.length > 0)
  // The earliest date has the earliest hour; the slots already leave out hours that are too soon (the lead time).
  const closest = dated[0] && { date: dated[0].date, slot: dated[0].slots[0] }

  const [pickDate, setPickDate] = useState(chosen?.date ?? dated[0]?.date ?? '')
  const [pickHour, setPickHour] = useState('')
  const pickable = dated.find((d) => d.date === pickDate) ?? dated[0]

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

  const address = was.city || was.street || was.houseNumber

  return (
    <section ref={ref} tabIndex={-1} className="fix-panel" aria-labelledby="fix-title" role="group">
      <h3 id="fix-title">{t(done ? 'order.fix.doneTitle' : 'order.fix.title')}</h3>
      {done && <p role="status">{t('order.fix.doneHint')}</p>}

      {was.hour && (
        <div className="fix-panel__block">
          <h4>{t('order.fix.hourTitle')}</h4>
          {closest && (
            <div className="fix-panel__hours">
              <div className="fix-panel__closest">
                <button type="button" onClick={() => props.onPickHour(closest.date, slotId(closest.slot))}>
                  {t('order.fix.closest')}
                </button>
                <span className="hint">
                  {formatSupplyDate(closest.date, t)} · {formatSlot(closest.slot, t)}
                </span>
              </div>
              <div className="fix-panel__pick">
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
            </div>
          )}
          {!closest && <p className="form-error">{t('order.noSupplyDates')}</p>}
          {!now.hour && chosen && (
            <p role="status" className="fix-panel__ok">
              {t('order.fix.chosen', { when: `${formatSupplyDate(chosen.date, t)} · ${formatSlot(chosen.slot, t)}` })}
            </p>
          )}
        </div>
      )}

      {(was.name || was.phone) && (
        <div className="fix-panel__block">
          <h4>{t('order.fix.contactTitle')}</h4>
          {was.name && input('name', 'name', t('order.name'), { autoComplete: 'name' })}
          {was.phone && input('phone', 'phone', t('order.phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel', dir: 'ltr' })}
        </div>
      )}

      {address && (
        <div className="fix-panel__block">
          <h4>{t('order.fix.addressTitle')}</h4>
          <button type="button" onClick={locate} disabled={locating === 'busy'}>
            {locating === 'busy' ? t('address.locating') : t('address.locate')}
          </button>
          {locating !== 'idle' && locating !== 'busy' && (
            <p role="alert" className="form-error">
              {t(`address.locateErrors.${locating}`)}
            </p>
          )}
          <div className="fix-panel__fields">
            {was.city && input('city', 'city', t('address.city'), { autoComplete: 'address-level2' })}
            {was.street && input('street', 'street', t('address.street'), { autoComplete: 'address-line1' })}
            {was.houseNumber && input('houseNumber', 'houseNumber', t('address.houseNumber'), { autoComplete: 'off' })}
          </div>
          {props.zones && (
            <button type="button" className="button-quiet" onClick={props.onCalculate}>
              {t('address.calculate')}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
