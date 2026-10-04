import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../api/client'
import { FieldError } from '../admin/ui'
import { isServiceCity, type AddressParts } from './addressParts'

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
  const { t } = useTranslation()
  const id = (name: string) => `${idPrefix}-${name}`

  const field = (name: keyof AddressParts, label: string, autoComplete: string, options: { required?: boolean; className: string }) => (
    <span className={`field ${options.className}`}>
      <label htmlFor={id(name)}>{label}</label>
      <input
        id={id(name)}
        autoComplete={autoComplete}
        maxLength={100}
        required={options.required}
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
        {field('city', t('address.city'), 'address-level2', { required: true, className: 'field--grow' })}
        {field('street', t('address.street'), 'address-line1', { required: true, className: 'field--grow' })}
      </div>
      <div className="row row--end">
        {field('houseNumber', t('address.houseNumber'), 'off', { required: true, className: 'field--narrow' })}
        {field('apartment', t('address.apartment'), 'address-line2', { className: 'field--narrow' })}
      </div>
      {value.city.trim() !== '' && !isServiceCity(value.city) && (
        <p role="status" className="notice notice--warning">
          {t(context === 'order' ? 'address.outsideOrder' : 'address.outsideProfile')}
        </p>
      )}
    </fieldset>
  )
}
