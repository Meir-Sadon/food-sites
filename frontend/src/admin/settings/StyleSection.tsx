import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '../../api/catalog'
import { SITE_STYLES, type SiteStyle } from '../../api/site'
import { useToast } from '../../components/toast'
import { Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'

/** Picks the client site's look. Saved on its own, so unsaved edits in the other sections are not sent with it. */
export function StyleSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [picked, setPicked] = useState<SiteStyle | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const style = picked ?? settings?.style

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!style) return
    setSaving(true)
    setError(null)
    try {
      // The other settings as saved now, so this never sends stale values back.
      const { backgroundImageUrl: _, ...current } = await settingsApi.get()
      setData(await settingsApi.save({ ...current, style }))
      setPicked(null)
      toast(t('admin.saved'))
    } catch (err) {
      setError(errorMessage(err))
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
          <div className="row">
            <button type="submit" disabled={saving || style === settings.style}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
            {error && <Status message={error} error />}
          </div>
        </form>
      )}
    </Section>
  )
}
