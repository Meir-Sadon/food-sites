import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi, type Settings } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { FieldError, Info, Loading, Section, Status } from '../ui'
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
      // The style, the order layout and the corners are saved by their own sections; leaving them out keeps them.
      const { backgroundImageUrl: _, style: __, orderTotalPosition: ___, orderFlow: ____, corners: _____, ...input } = settings
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
            <span className="with-info">
              <label htmlFor="settings-serviceCities">{t('admin.settings.serviceCities')}</label>
              <Info text={t('admin.settings.serviceCitiesHint')} about={t('admin.settings.serviceCities')} />
            </span>
            <input
              id="settings-serviceCities"
              value={settings.serviceCities}
              maxLength={500}
              aria-describedby="settings-serviceCities-error"
              onChange={(e) => change({ serviceCities: e.target.value })}
            />
            <FieldError errors={errors} field="serviceCities" id="settings-serviceCities-error" />
          </span>
          {text('deliveryFeeText', t('admin.settings.deliveryFee'))}
          {text('kashrutText', t('admin.settings.kashrut'))}
          {text('paymentPhone', t('admin.settings.paymentPhone'), false)}
          <span className="field">
            <span className="with-info">
              <label htmlFor="settings-ownerEmail">{t('admin.settings.ownerEmail')}</label>
              <Info text={t('admin.settings.ownerEmailHint')} about={t('admin.settings.ownerEmail')} />
            </span>
            <input
              id="settings-ownerEmail"
              type="email"
              inputMode="email"
              dir="ltr"
              maxLength={200}
              value={settings.ownerEmail}
              aria-describedby="settings-ownerEmail-error"
              onChange={(e) => change({ ownerEmail: e.target.value })}
            />
            <FieldError errors={errors} field="ownerEmail" id="settings-ownerEmail-error" />
          </span>
          <span className="field">
            <span className="with-info">
              <label htmlFor="settings-minimumOrderAmount">{t('admin.settings.minimumOrder')}</label>
              <Info text={t('admin.settings.minimumOrderHint')} about={t('admin.settings.minimumOrder')} />
            </span>
            <span className="field__inline">
              <input
                id="settings-minimumOrderAmount"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                dir="ltr"
                value={settings.minimumOrderAmount ?? ''}
                aria-describedby="settings-minimumOrderAmount-error"
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
            <FieldError errors={errors} field="minimumOrderAmount" id="settings-minimumOrderAmount-error" />
          </span>
          <span className="field">
            <span className="with-info">
              <label htmlFor="settings-ordersPerHour">{t('admin.settings.ordersPerHour')}</label>
              <Info text={t('admin.settings.ordersPerHourHint')} about={t('admin.settings.ordersPerHour')} />
            </span>
            <input
              id="settings-ordersPerHour"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              dir="ltr"
              className="input-narrow"
              value={settings.ordersPerHour ?? ''}
              aria-describedby="settings-ordersPerHour-error"
              onChange={(e) => change({ ordersPerHour: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <FieldError errors={errors} field="ordersPerHour" id="settings-ordersPerHour-error" />
          </span>
          <span className="field">
            <span className="with-info">
              <label htmlFor="settings-portionsPerSupplyDate">{t('admin.settings.portionsPerSupplyDate')}</label>
              <Info text={t('admin.settings.portionsPerSupplyDateHint')} about={t('admin.settings.portionsPerSupplyDate')} />
            </span>
            <input
              id="settings-portionsPerSupplyDate"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              dir="ltr"
              className="input-narrow"
              value={settings.portionsPerSupplyDate ?? ''}
              aria-describedby="settings-portionsPerSupplyDate-error"
              onChange={(e) => change({ portionsPerSupplyDate: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <FieldError errors={errors} field="portionsPerSupplyDate" id="settings-portionsPerSupplyDate-error" />
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
