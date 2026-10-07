import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../api/client'
import { FieldError } from '../admin/ui'
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
}

export function AddressFields({ value, onChange, errors, idPrefix, context }: Props) {
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
      <div className="row row--end">
        {field('city', t('address.city'), 'address-level2', { required: true, className: 'field--grow', list: id('cities') })}
        {field('street', t('address.street'), 'address-line1', { required: true, className: 'field--grow' })}
      </div>
      <div className="row row--end">
        {field('houseNumber', t('address.houseNumber'), 'off', { required: true, className: 'field--narrow' })}
        {field('apartment', t('address.apartment'), 'address-line2', { className: 'field--narrow' })}
      </div>
      <datalist id={id('cities')}>
        {serviceCities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      {value.city.trim() !== '' && !isServiceCity(value.city, serviceCities) && (
        <p role="status" className="notice notice--warning">
          {t(context === 'order' ? 'address.outsideOrder' : 'address.outsideProfile', {
            cities: formatCities(serviceCities, i18n.language),
          })}
        </p>
      )}
    </fieldset>
  )
}
