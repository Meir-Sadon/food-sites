import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '../../api/catalog'
import { BADGE_NEW_UNITS, LOW_STOCK_MODES, type ItemBadges } from '../../api/site'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { Info, Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsaved'

/**
 * The "new" and "almost out" badges of the order page: whether each shows and when it applies. Saved on its own, so
 * another section never overwrites them with an older copy.
 */
export function BadgesSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [edited, setEdited] = useState<ItemBadges | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const badges = edited ?? settings?.badges
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(settings?.badges)

  useUnsavedChanges(dirty, save)

  function set(patch: Partial<ItemBadges>) {
    if (badges) setEdited({ ...badges, ...patch })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!badges) return false
    setSaving(true)
    setError(null)
    try {
      setData(await settingsApi.saveBadges(badges))
      setEdited(null)
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
    <Section title={t('admin.settings.badges.title')} hint={t('admin.settings.badges.hint')}>
      {!settings || !badges ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <fieldset className="stack">
            <legend>{t('admin.settings.badges.newTitle')}</legend>
            <label className="checkbox">
              <input type="checkbox" checked={badges.newEnabled} onChange={(e) => set({ newEnabled: e.target.checked })} />
              {t('admin.settings.badges.newEnabled')}
            </label>
            {badges.newEnabled && (
              <div className="row">
                <span className="field field--narrow">
                  <label htmlFor="badge-new-amount">{t('admin.settings.badges.newAmount')}</label>
                  <input
                    id="badge-new-amount"
                    type="number"
                    min={1}
                    max={365}
                    inputMode="numeric"
                    value={badges.newAmount}
                    onChange={(e) => set({ newAmount: Number(e.target.value) })}
                  />
                </span>
                <span className="field field--narrow">
                  <label htmlFor="badge-new-unit">{t('admin.settings.badges.newUnit')}</label>
                  <select id="badge-new-unit" value={badges.newUnit} onChange={(e) => set({ newUnit: e.target.value as ItemBadges['newUnit'] })}>
                    {BADGE_NEW_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {t(`admin.settings.badges.units.${unit}`)}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
            )}
          </fieldset>

          <fieldset className="stack">
            <legend>{t('admin.settings.badges.lowStockTitle')}</legend>
            <span className="with-info">
              <label className="checkbox">
                <input type="checkbox" checked={badges.lowStockEnabled} onChange={(e) => set({ lowStockEnabled: e.target.checked })} />
                {t('admin.settings.badges.lowStockEnabled')}
              </label>
              <Info text={t('admin.settings.badges.lowStockHint')} about={t('admin.settings.badges.lowStockTitle')} />
            </span>
            {badges.lowStockEnabled && (
              <div className="row">
                <span className="field">
                  <label htmlFor="badge-low-mode">{t('admin.settings.badges.lowStockMode')}</label>
                  <select
                    id="badge-low-mode"
                    value={badges.lowStockMode}
                    onChange={(e) => set({ lowStockMode: e.target.value as ItemBadges['lowStockMode'] })}
                  >
                    {LOW_STOCK_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`admin.settings.badges.modes.${mode}`)}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="field field--narrow">
                  <label htmlFor="badge-low-amount">
                    {t(badges.lowStockMode === 'percent' ? 'admin.settings.badges.lowStockPercent' : 'admin.settings.badges.lowStockUnits')}
                  </label>
                  <input
                    id="badge-low-amount"
                    type="number"
                    min={1}
                    max={badges.lowStockMode === 'percent' ? 99 : 100000}
                    inputMode="numeric"
                    value={badges.lowStockAmount}
                    onChange={(e) => set({ lowStockAmount: Number(e.target.value) })}
                  />
                </span>
              </div>
            )}
          </fieldset>

          <div className="row">
            <button type="submit" disabled={saving || !dirty}>
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
