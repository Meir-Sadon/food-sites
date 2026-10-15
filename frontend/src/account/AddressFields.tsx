import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../api/client'
import { FieldError } from '../admin/ui'
import { deliveryApi, type LocatedAddress } from '../api/site'
import { useSite } from '../site/useSite'
import { formatCities, isServiceCity, type AddressParts } from './addressParts'

interface Props {
  value: AddressParts
  onChange: (patch: Partial<AddressParts>) => void
  errors: FieldErrors
  /** Prefix for the input ids, so two forms on a page never clash. */
  idPrefix: string
  /** Which note to show when the city is not the service city. */
  context: 'order' | 'profile'
  /** The advanced delivery setting on the order page: "find my location" and "calculate" buttons. */
  zones?: {
    onLocated: (found: LocatedAddress) => void
    onCalculate: () => void
  }
}

type Locating = 'idle' | 'busy' | 'denied' | 'notFound' | 'failed'

export function AddressFields({ value, onChange, errors, idPrefix, context, zones }: Props) {
  const { t, i18n } = useTranslation()
  const id = (name: string) => `${idPrefix}-${name}`
  const site = useSite()
  const serviceCities = useMemo(() => site?.serviceCities ?? [], [site])

  // An empty city starts as the first service city, once, as soon as the site info is in.
  const defaulted = useRef(false)
  useEffect(() => {
    if (defaulted.current || serviceCities.length === 0) return
    defaulted.current = true
    if (value.city.trim() === '') onChange({ city: serviceCities[0] })
  }, [serviceCities, value.city, onChange])

  const [locating, setLocating] = useState<Locating>('idle')
  const advanced = site?.deliveryPricing === 'zones'

  function locate() {
    if (!zones) return
    if (!navigator.geolocation) {
      setLocating('failed')
      return
    }
    setLocating('busy')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        deliveryApi
          .locate({ lat: coords.latitude, lng: coords.longitude })
          .then((found) => {
            if (!found.found) return setLocating('notFound')
            setLocating('idle')
            zones.onLocated(found)
          })
          .catch(() => setLocating('failed'))
      },
      (error) => setLocating(error.code === 1 ? 'denied' : 'failed'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  const field = (
    name: keyof AddressParts,
    label: string,
    autoComplete: string,
    options: { required?: boolean; className: string; list?: string },
  ) => (
    <span className={`field ${options.className}`}>
      <label htmlFor={id(name)}>{label}</label>
      <input
        id={id(name)}
        autoComplete={autoComplete}
        maxLength={100}
        required={options.required}
        list={options.list}
        value={value[name]}
        aria-describedby={id(`${name}-error`)}
        onChange={(e) => onChange({ [name]: e.target.value })}
      />
      <FieldError errors={errors} field={name} id={id(`${name}-error`)} />
    </span>
  )

  return (
    <fieldset className="address-fields">
      <legend>{t('address.title')}</legend>
      {zones && (
        <>
          <div className="row row--end">
            <button type="button" onClick={locate} disabled={locating === 'busy'}>
              {locating === 'busy' ? t('address.locating') : t('address.locate')}
            </button>
            <span className="muted">{t('address.orManual')}</span>
          </div>
          {locating !== 'idle' && locating !== 'busy' && (
            <p role="alert" className="form-error">
              {t(`address.locateErrors.${locating}`)}
            </p>
          )}
        </>
      )}
      <div className="row row--end">
        {field('city', t('address.city'), 'address-level2', { required: true, className: 'field--grow', list: id('cities') })}
        {field('street', t('address.street'), 'address-line1', { required: true, className: 'field--grow' })}
      </div>
      <div className="row row--end">
        {field('houseNumber', t('address.houseNumber'), 'off', { required: true, className: 'field--narrow' })}
        {field('apartment', t('address.apartment'), 'address-line2', { className: 'field--narrow' })}
      </div>
      {zones && (
        <div className="row">
          <button type="button" className="button-quiet" onClick={zones.onCalculate}>
            {t('address.calculate')}
          </button>
        </div>
      )}
      <datalist id={id('cities')}>
        {serviceCities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      {!advanced && value.city.trim() !== '' && !isServiceCity(value.city, serviceCities) && (
        <p role="status" className="notice notice--warning">
          {t(context === 'order' ? 'address.outsideOrder' : 'address.outsideProfile', {
            cities: formatCities(serviceCities, i18n.language),
          })}
        </p>
      )}
    </fieldset>
  )
}
