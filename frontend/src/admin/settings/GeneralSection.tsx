import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi, type Settings } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { FieldError, Loading, Section, Status } from '../ui'
import { fieldErrorsOf, useFormErrorMessage, useLoad } from '../hooks'
import { useToast } from '../../components/toast'

type TextField = 'deliveryAreaText' | 'deliveryFeeText' | 'kashrutText' | 'paymentPhone'

export function GeneralSection() {
  const { t } = useTranslation()
  const errorMessage = useFormErrorMessage()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  function change(patch: Partial<Settings>) {
    setData((current) => current && { ...current, ...patch })
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!settings) return
    setSaving(true)
    setErrors({})
    try {
      const { backgroundImageUrl: _, ...input } = settings
      setData(await settingsApi.save(input))
      setError(null)
      toast(t('admin.saved'))
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const text = (field: TextField, label: string, multiline = true) => {
    const id = `settings-${field}`
    const props = {
      id,
      value: settings?.[field] ?? '',
      maxLength: 1000,
      'aria-describedby': `${id}-error`,
      onChange: (e: { target: { value: string } }) => change({ [field]: e.target.value }),
    }
    return (
      <span className="field">
        <label htmlFor={id}>{label}</label>
        {multiline ? <textarea rows={2} {...props} /> : <input inputMode="tel" dir="ltr" {...props} />}
        <FieldError errors={errors} field={field} id={`${id}-error`} />
      </span>
    )
  }

  return (
    <Section title={t('admin.settings.general')}>
      {!settings ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <fieldset className="row" aria-describedby="settings-deliveryEnabled-error">
            <legend className="visually-hidden">{t('admin.settings.fulfillment')}</legend>
            <label className="checkbox">
              <input type="checkbox" checked={settings.deliveryEnabled} onChange={(e) => change({ deliveryEnabled: e.target.checked })} />
              {t('admin.settings.delivery')}
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={settings.pickupEnabled} onChange={(e) => change({ pickupEnabled: e.target.checked })} />
              {t('admin.settings.pickup')}
            </label>
          </fieldset>
          <FieldError errors={errors} field="deliveryEnabled" id="settings-deliveryEnabled-error" />
          {text('deliveryAreaText', t('admin.settings.deliveryArea'))}
          <span className="field">
            <label htmlFor="settings-serviceCities">{t('admin.settings.serviceCities')}</label>
            <input
              id="settings-serviceCities"
              value={settings.serviceCities}
              maxLength={500}
              aria-describedby="settings-serviceCities-hint settings-serviceCities-error"
              onChange={(e) => change({ serviceCities: e.target.value })}
            />
            <span id="settings-serviceCities-hint" className="hint">
              {t('admin.settings.serviceCitiesHint')}
            </span>
            <FieldError errors={errors} field="serviceCities" id="settings-serviceCities-error" />
          </span>
          {text('deliveryFeeText', t('admin.settings.deliveryFee'))}
          {text('kashrutText', t('admin.settings.kashrut'))}
          {text('paymentPhone', t('admin.settings.paymentPhone'), false)}
          <span className="field">
            <label htmlFor="settings-minimumOrderAmount">{t('admin.settings.minimumOrder')}</label>
            <span className="field__inline">
              <input
                id="settings-minimumOrderAmount"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                dir="ltr"
                value={settings.minimumOrderAmount ?? ''}
                aria-describedby="settings-minimumOrderAmount-hint settings-minimumOrderAmount-error"
                onChange={(e) => change({ minimumOrderAmount: e.target.value === '' ? null : Number(e.target.value) })}
              />
              {settings.pickupEnabled && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={settings.minimumOrderAppliesToPickup}
                    onChange={(e) => change({ minimumOrderAppliesToPickup: e.target.checked })}
                  />
                  {t('admin.settings.minimumOrderAppliesToPickup')}
                </label>
              )}
            </span>
            <span id="settings-minimumOrderAmount-hint" className="hint">
              {t('admin.settings.minimumOrderHint')}
            </span>
            <FieldError errors={errors} field="minimumOrderAmount" id="settings-minimumOrderAmount-error" />
          </span>
          <span className="field">
            <label htmlFor="settings-ordersPerHour">{t('admin.settings.ordersPerHour')}</label>
            <input
              id="settings-ordersPerHour"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              dir="ltr"
              className="input-narrow"
              value={settings.ordersPerHour ?? ''}
              aria-describedby="settings-ordersPerHour-hint settings-ordersPerHour-error"
              onChange={(e) => change({ ordersPerHour: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <span id="settings-ordersPerHour-hint" className="hint">
              {t('admin.settings.ordersPerHourHint')}
            </span>
            <FieldError errors={errors} field="ordersPerHour" id="settings-ordersPerHour-error" />
          </span>
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
            {error && <Status message={error} error />}
          </div>
        </form>
      )}
    </Section>
  )
}
