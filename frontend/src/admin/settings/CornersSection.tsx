import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '../../api/catalog'
import { CORNERS, type Corners } from '../../api/site'
import { useToast } from '../../components/toast'
import { Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'

/**
 * Picks how round the client site's pictures, buttons and cards are. Saved on its own, sending only the corners
 * with the other settings as saved now, so the other sections' defaults are not pinned.
 */
export function CornersSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [picked, setPicked] = useState<Corners | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const corners = picked ?? settings?.corners

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!corners) return
    setSaving(true)
    setError(null)
    try {
      const { backgroundImageUrl: _, style: __, orderTotalPosition: ___, orderFlow: ____, palette: _p, customColors: _c, lineWidth: _l, font: _f, shadows: _sh, spacing: _sp, tileGroups: _tg, ...current } = await settingsApi.get()
      setData(await settingsApi.save({ ...current, corners }))
      setPicked(null)
      toast(t('admin.saved'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title={t('admin.settings.corners')} hint={t('admin.settings.cornersHint')}>
      {!settings ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <fieldset className="style-options">
            <legend className="visually-hidden">{t('admin.settings.corners')}</legend>
            {CORNERS.map((option) => (
              <label key={option} className="style-option">
                <input type="radio" name="corners" value={option} checked={corners === option} onChange={() => setPicked(option)} />
                <span className={`corners-preview corners-preview--${option}`} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <strong>{t(`admin.settings.cornerShapes.${option}.name`)}</strong>
                <span className="hint">{t(`admin.settings.cornerShapes.${option}.description`)}</span>
              </label>
            ))}
          </fieldset>
          <div className="row">
            <button type="submit" disabled={saving || corners === settings.corners}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
            {error && <Status message={error} error />}
          </div>
        </form>
      )}
    </Section>
  )
}
