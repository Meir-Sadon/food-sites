import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi, type Settings } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import type { DeliveryPricing } from '../../api/site'
import { FieldError, Info, Loading, Section, Status } from '../ui'
import { fieldErrorsOf, useFormErrorMessage, useLoad } from '../hooks'
import { useDirty, useUnsavedChanges } from '../unsaved'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'

type TextField = 'deliveryAreaText' | 'deliveryFeeText' | 'kashrutText' | 'paymentPhone' | 'bitLink' | 'payBoxLink'

/** `onPricing` hears the picked delivery pricing at once, so the page shows the zones editor as soon as "advanced" is picked. */
export function GeneralSection({ onPricing }: { onPricing?: (pricing: DeliveryPricing) => void }) {
  const { t } = useTranslation()
  const errorMessage = useFormErrorMessage()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const { saved, flash } = useSavedFlash()
  const [saving, setSaving] = useState(false)

  const pricing = settings?.deliveryPricing
  useEffect(() => {
    if (pricing) onPricing?.(pricing)
  }, [pricing, onPricing])

  function change(patch: Partial<Settings>) {
    setData((current) => current && { ...current, ...patch })
    setError(null)
  }

  const { dirty, markSaved } = useDirty(settings)
  useUnsavedChanges(dirty, save)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!settings) return false
    setSaving(true)
    setErrors({})
    try {
      // The style, the order layout, the corners and the colours are saved by their own sections; leaving them out keeps them.
      const { backgroundImageUrl: _, style: __, orderTotalPosition: ___, orderFlow: ____, corners: _____, palette: _p, customColors: _c, lineWidth: _l, font: _f, shadows: _sh, spacing: _sp, tileGroups: _tg, tracking: _tr, badges: _bd, inactiveAfter: _ia, ...input } = settings
      const result = await settingsApi.save(input)
      setData(result)
      markSaved(result)
      setError(null)
      flash()
      return true
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  const money = (field: 'deliveryBaseFee' | 'deliveryDiscountMinOrder') => {
    const id = `settings-${field}`
    return (
      <span className="field">
        <span className="with-info">
          <label htmlFor={id}>{t(`admin.settings.${field}`)}</label>
          <Info text={t(`admin.settings.${field}Hint`)} about={t(`admin.settings.${field}`)} />
        </span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          dir="ltr"
          className="input-narrow"
          value={settings?.[field] ?? ''}
          aria-describedby={`${id}-error`}
          onChange={(e) => change({ [field]: e.target.value === '' ? null : Number(e.target.value) })}
        />
        <FieldError errors={errors} field={field} id={`${id}-error`} />
      </span>
    )
  }

  const text = (field: TextField, label: string, multiline = true, kind: 'tel' | 'url' = 'tel') => {
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
        {multiline ? <textarea rows={2} {...props} /> : <input inputMode={kind} type={kind === 'url' ? 'url' : undefined} dir="ltr" {...props} />}
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
          <span className="field">
            <span className="with-info">
              <label className="checkbox">
                <input type="checkbox" checked={settings.addressFirst} onChange={(e) => change({ addressFirst: e.target.checked })} />
                {t('admin.settings.addressFirst')}
              </label>
              <Info text={t('admin.settings.addressFirstHint')} about={t('admin.settings.addressFirst')} />
            </span>
          </span>
          {settings.deliveryEnabled && (
            <fieldset className="field" aria-labelledby="settings-pricing-legend">
              <span className="with-info">
                <legend id="settings-pricing-legend">{t('admin.zones.pricing')}</legend>
                <Info text={t('admin.zones.pricingInfo')} about={t('admin.zones.pricing')} />
              </span>
              <div className="row">
                {(['simple', 'zones'] as const).map((value) => (
                  <label key={value} className="checkbox">
                    <input
                      type="radio"
                      name="delivery-pricing"
                      checked={settings.deliveryPricing === value}
                      onChange={() => change({ deliveryPricing: value })}
                    />
                    {t(`admin.zones.pricings.${value}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {settings.deliveryEnabled && settings.deliveryPricing === 'zones' && <p className="hint">{t('admin.zones.advancedNote')}</p>}
          {(!settings.deliveryEnabled || settings.deliveryPricing !== 'zones') && (
            <>
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
              <span className="field">
                <span className="with-info">
                  <label htmlFor="settings-deliveryFeeAmount">{t('admin.settings.deliveryFeeAmount')}</label>
                  <Info text={t('admin.settings.deliveryFeeAmountHint')} about={t('admin.settings.deliveryFeeAmount')} />
                </span>
                <input
                  id="settings-deliveryFeeAmount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  dir="ltr"
                  className="input-narrow"
                  value={settings.deliveryFeeAmount ?? ''}
                  aria-describedby="settings-deliveryFeeAmount-error"
                  onChange={(e) => change({ deliveryFeeAmount: e.target.value === '' ? null : Number(e.target.value) })}
                />
                <FieldError errors={errors} field="deliveryFeeAmount" id="settings-deliveryFeeAmount-error" />
              </span>
              {text('deliveryFeeText', t('admin.settings.deliveryFee'))}
            </>
          )}
          {settings.deliveryEnabled && (
            <>
              {settings.deliveryPricing === 'zones' && money('deliveryBaseFee')}
              {money('deliveryDiscountMinOrder')}
            </>
          )}
          {text('kashrutText', t('admin.settings.kashrut'))}
          <fieldset className="field" aria-labelledby="settings-payments-legend">
            <legend id="settings-payments-legend">{t('admin.settings.payments')}</legend>
            <label className="checkbox">
              <input type="checkbox" checked={settings.bitEnabled} onChange={(e) => change({ bitEnabled: e.target.checked })} />
              {t('admin.settings.bitEnabled')}
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={settings.payBoxEnabled} onChange={(e) => change({ payBoxEnabled: e.target.checked })} />
              {t('admin.settings.payBoxEnabled')}
            </label>
            <p className="hint">{t('admin.settings.paymentsHint')}</p>
          </fieldset>
          {text('paymentPhone', t('admin.settings.paymentPhone'), false)}
          {settings.bitEnabled && text('bitLink', t('admin.settings.bitLink'), false, 'url')}
          {settings.payBoxEnabled && text('payBoxLink', t('admin.settings.payBoxLink'), false, 'url')}
          <span className="field">
            <span className="with-info">
              <label htmlFor="settings-ownerEmail">{t('admin.settings.ownerEmail')}</label>
              <Info text={t('admin.settings.ownerEmailHint')} about={t('admin.settings.ownerEmail')} />
            </span>
            <input
              id="settings-ownerEmail"
              type="text"
              inputMode="email"
              dir="ltr"
              maxLength={500}
              value={settings.ownerEmail}
              aria-describedby="settings-ownerEmail-error"
              onChange={(e) => change({ ownerEmail: e.target.value })}
            />
            <FieldError errors={errors} field="ownerEmail" id="settings-ownerEmail-error" />
            <span className="with-info">
              <label className="checkbox">
                <input type="checkbox" checked={settings.ownerChangeMails} onChange={(e) => change({ ownerChangeMails: e.target.checked })} />
                {t('admin.settings.ownerChangeMails')}
              </label>
              <Info text={t('admin.settings.ownerChangeMailsHint')} about={t('admin.settings.ownerChangeMails')} />
            </span>
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
              <label htmlFor="settings-slotMinutes">{t('admin.settings.slotMinutes')}</label>
              <Info text={t('admin.settings.slotMinutesHint')} about={t('admin.settings.slotMinutes')} />
            </span>
            <select
              id="settings-slotMinutes"
              className="input-narrow"
              value={settings.slotMinutes}
              onChange={(e) => change({ slotMinutes: Number(e.target.value) })}
            >
              {[15, 30, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t(`admin.settings.slotOptions.${minutes}`)}
                </option>
              ))}
            </select>
            <label className="checkbox">
              <input type="checkbox" checked={settings.alignSlots} onChange={(e) => change({ alignSlots: e.target.checked })} />
              {t('admin.settings.alignSlots')}
              <Info text={t('admin.settings.alignSlotsHint')} about={t('admin.settings.alignSlots')} />
            </label>
            <FieldError errors={errors} field="slotMinutes" id="settings-slotMinutes-error" />
          </span>
          {(['delivery', 'pickup'] as const).map((way) => {
            const field = `${way}LeadMinutes` as const
            return (
              <span className="field" key={field}>
                <span className="with-info">
                  <label htmlFor={`settings-${field}`}>{t(`admin.settings.${field}`)}</label>
                  <Info text={t(`admin.settings.${field}Hint`)} about={t(`admin.settings.${field}`)} />
                </span>
                <input
                  id={`settings-${field}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={5}
                  dir="ltr"
                  className="input-narrow"
                  value={settings[field]}
                  aria-describedby={`settings-${field}-error`}
                  onChange={(e) => change({ [field]: e.target.value === '' ? 0 : Number(e.target.value) })}
                />
                <FieldError errors={errors} field={field} id={`settings-${field}-error`} />
              </span>
            )
          })}
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
            <SavedNote show={saved} />
            {error && <Status message={error} error />}
          </div>
        </form>
      )}
    </Section>
  )
}
