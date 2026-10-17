import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '../../api/catalog'
import { FONTS, SHADOWS, SPACINGS, type FontPair, type Shadows, type Spacing } from '../../api/site'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { Loading, Section, Status } from '../ui'
import { announceLook } from '../useAdminLook'
import { useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsaved'

/**
 * Picks the font pair, the shadow strength and the spacing of the client site. They apply on top of every style
 * and every colour choice. Saved on its own, sending only these with the other settings as saved now.
 */
export function FinishSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [font, setFont] = useState<FontPair | null>(null)
  const [shadows, setShadows] = useState<Shadows | null>(null)
  const [spacing, setSpacing] = useState<Spacing | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shown = { font: font ?? settings?.font, shadows: shadows ?? settings?.shadows, spacing: spacing ?? settings?.spacing }
  const changed = !!settings && (shown.font !== settings.font || shown.shadows !== settings.shadows || shown.spacing !== settings.spacing)

  useUnsavedChanges(changed, save)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!shown.font || !shown.shadows || !shown.spacing) return false
    setSaving(true)
    setError(null)
    try {
      const { backgroundImageUrl: _, style: __, orderTotalPosition: ___, orderFlow: ____, corners: _____, palette: _p, customColors: _c, lineWidth: _l, tileGroups: _tg, ...current } = await settingsApi.get()
      const result = await settingsApi.save({ ...current, font: shown.font, shadows: shown.shadows, spacing: shown.spacing })
      setData(result)
      announceLook(result)
      setFont(null)
      setShadows(null)
      setSpacing(null)
      flash()
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  function group<T extends string>(name: 'font' | 'shadows' | 'spacing', options: readonly T[], value: T | undefined, pick: (option: T) => void) {
    return (
      <fieldset className="style-options">
        <legend>{t(`admin.settings.finish.${name}.title`)}</legend>
        {options.map((option) => (
          <label key={option} className="style-option">
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => pick(option)} />
            <strong>{t(`admin.settings.finish.${name}.${option}.name`)}</strong>
            <span className="hint">{t(`admin.settings.finish.${name}.${option}.description`)}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  return (
    <Section title={t('admin.settings.finish.title')} hint={t('admin.settings.finish.hint')}>
      {!settings ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          {group('font', FONTS, shown.font, setFont)}
          {group('shadows', SHADOWS, shown.shadows, setShadows)}
          {group('spacing', SPACINGS, shown.spacing, setSpacing)}
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
