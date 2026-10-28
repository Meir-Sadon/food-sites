import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '../../api/catalog'
import { ORDER_FLOWS, ORDER_TOTAL_POSITIONS, type OrderFlow, type OrderTotalPosition } from '../../api/site'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsaved'

/**
 * Picks how the client's order page is laid out: where the total sits and whether the menu is one page or
 * one category at a time. Saved on its own, sending only these two so the other sections' values stay as they are.
 */
export function OrderLayoutSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [pickedTotal, setPickedTotal] = useState<OrderTotalPosition | null>(null)
  const [pickedFlow, setPickedFlow] = useState<OrderFlow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const totalPosition = pickedTotal ?? settings?.orderTotalPosition
  const flow = pickedFlow ?? settings?.orderFlow
  const unchanged = totalPosition === settings?.orderTotalPosition && flow === settings?.orderFlow

  useUnsavedChanges(!unchanged, save)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!totalPosition || !flow) return false
    setSaving(true)
    setError(null)
    try {
      // The other settings as saved now, so this never sends stale values back; the style and corners stay out so their defaults aren't pinned.
      const { backgroundImageUrl: _, style: __, corners: ___, palette: _p, customColors: _c, lineWidth: _l, font: _f, shadows: _sh, spacing: _sp, tileGroups: _tg, tracking: _tr, badges: _bd, inactiveAfter: _ia, ...current } = await settingsApi.get()
      setData(
        await settingsApi.save({
          ...current,
          orderTotalPosition: totalPosition,
          orderFlow: flow,
        }),
      )
      setPickedTotal(null)
      setPickedFlow(null)
      flash()
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title={t('admin.settings.orderLayout')} hint={t('admin.settings.orderLayoutHint')}>
      {!settings ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <fieldset className="style-options">
            <legend>{t('admin.settings.orderTotal')}</legend>
            {ORDER_TOTAL_POSITIONS.map((option) => (
              <label key={option} className="style-option">
                <input
                  type="radio"
                  name="order-total-position"
                  value={option}
                  checked={totalPosition === option}
                  onChange={() => setPickedTotal(option)}
                />
                <span className={`layout-preview layout-preview--total-${option}`} aria-hidden="true">
                  <span />
                  <span />
                </span>
                <strong>{t(`admin.settings.orderTotals.${option}.name`)}</strong>
                <span className="hint">{t(`admin.settings.orderTotals.${option}.description`)}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="style-options">
            <legend>{t('admin.settings.orderFlow')}</legend>
            {ORDER_FLOWS.map((option) => (
              <label key={option} className="style-option">
                <input type="radio" name="order-flow" value={option} checked={flow === option} onChange={() => setPickedFlow(option)} />
                <span className={`layout-preview layout-preview--flow-${option}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <strong>{t(`admin.settings.orderFlows.${option}.name`)}</strong>
                <span className="hint">{t(`admin.settings.orderFlows.${option}.description`)}</span>
              </label>
            ))}
          </fieldset>
          <div className="row">
            <button type="submit" disabled={saving || unchanged}>
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
