import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '../../api/catalog'
import { SITE_STYLES, TILE_GROUPS, type SiteStyle, type TileGroups } from '../../api/site'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsaved'

/** Picks the client site's look. Saved on its own, so unsaved edits in the other sections are not sent with it. */
export function StyleSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [picked, setPicked] = useState<SiteStyle | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickedGroups, setPickedGroups] = useState<TileGroups | null>(null)
  const style = picked ?? settings?.style
  const tileGroups = pickedGroups ?? settings?.tileGroups
  const changed = !!settings && (style !== settings.style || tileGroups !== settings.tileGroups)

  useUnsavedChanges(changed, save)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!style) return false
    setSaving(true)
    setError(null)
    try {
      // The other settings as saved now, so this never sends stale values back.
      const { backgroundImageUrl: _, orderTotalPosition: __, orderFlow: ___, corners: ____, palette: _p, customColors: _c, lineWidth: _l, font: _f, shadows: _sh, spacing: _sp, tracking: _tr, badges: _bd, ...current } = await settingsApi.get()
      setData(await settingsApi.save({ ...current, style, tileGroups }))
      setPicked(null)
      setPickedGroups(null)
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
    <Section title={t('admin.settings.style')} hint={t('admin.settings.styleHint')}>
      {!settings ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <fieldset className="style-options">
            <legend className="visually-hidden">{t('admin.settings.style')}</legend>
            {SITE_STYLES.map((option) => (
              <label key={option} className="style-option">
                <input type="radio" name="site-style" value={option} checked={style === option} onChange={() => setPicked(option)} />
                <span className={`style-option__preview style-option__preview--${option}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <strong>{t(`admin.settings.styles.${option}.name`)}</strong>
                <span className="hint">{t(`admin.settings.styles.${option}.description`)}</span>
              </label>
            ))}
          </fieldset>
          {style === 'tiles' && (
            <fieldset className="style-options">
              <legend>{t('admin.settings.tileGroups.title')}</legend>
              {TILE_GROUPS.map((option) => (
                <label key={option} className="style-option">
                  <input type="radio" name="tile-groups" value={option} checked={tileGroups === option} onChange={() => setPickedGroups(option)} />
                  <strong>{t(`admin.settings.tileGroups.${option}.name`)}</strong>
                  <span className="hint">{t(`admin.settings.tileGroups.${option}.description`)}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="row">
            <button type="submit" disabled={saving || !changed}>
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
