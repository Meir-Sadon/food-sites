import { useState, type CSSProperties, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi } from '../../api/catalog'
import { COLOR_KEYS, MAX_LINE_WIDTH, PALETTES, type ColorKey, type ColorSet, type Palette } from '../../api/site'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { backgroundOf, colorVariables, contrastRatio, copySource, ensureReadable, mergeColors, MIN_CONTRAST, wouldCycle } from '../../site/palettes'
import { Loading, Section, Status } from '../ui'
import { announceLook } from '../useAdminLook'
import { useErrorMessage, useLoad } from '../hooks'

const LINE_WIDTHS = Array.from({ length: MAX_LINE_WIDTH }, (_, i) => i + 1)

/** A tiny drawing of the client site in the given colours: menu bar, banner, a dish card and a button. */
function ColorPreview({ palette, colors, lineWidth }: { palette: Palette; colors: ColorSet; lineWidth: number | null }) {
  return (
    <span className="color-preview" aria-hidden="true" style={colorVariables(palette, colors, lineWidth) as CSSProperties}>
      <span className="color-preview__menu" />
      <span className="color-preview__banner" />
      <span className="color-preview__dish">
        <span className="color-preview__line" />
        <span className="color-preview__button" />
      </span>
    </span>
  )
}

/**
 * Picks the client site's colours: a ready-made palette that restyles the whole site at once, and, over it, a colour
 * per element and the thickness of the lines. Saved on its own, sending only the colours with the other settings as
 * saved now, so the other sections' defaults are not pinned.
 */
export function ColorsSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [pickedPalette, setPickedPalette] = useState<Palette | null>(null)
  const [pickedColors, setPickedColors] = useState<ColorSet | null>(null)
  const [pickedWidth, setPickedWidth] = useState<number | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const palette = pickedPalette ?? settings?.palette ?? 'site'
  const custom = pickedColors ?? settings?.customColors ?? {}
  const lineWidth = pickedWidth === undefined ? (settings?.lineWidth ?? null) : pickedWidth
  const shown = mergeColors(palette, custom)
  const { colors: readable, fixed } = ensureReadable(shown)
  const changed =
    !!settings &&
    (palette !== settings.palette ||
      JSON.stringify(custom) !== JSON.stringify(settings.customColors) ||
      lineWidth !== (settings.lineWidth ?? null))

  function setColor(key: ColorKey, value: string | null) {
    const next = { ...custom }
    if (value) next[key] = value
    else delete next[key]
    setPickedColors(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const { backgroundImageUrl: _, style: __, orderTotalPosition: ___, orderFlow: ____, corners: _____, font: _f, shadows: _sh, spacing: _sp, tileGroups: _tg, ...current } = await settingsApi.get()
      const result = await settingsApi.save({ ...current, palette, customColors: custom, lineWidth: lineWidth ?? 0 })
      setData(result)
      announceLook(result)
      setPickedPalette(null)
      setPickedColors(null)
      setPickedWidth(undefined)
      flash()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title={t('admin.settings.colors')} hint={t('admin.settings.colorsHint')}>
      {!settings ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <fieldset className="style-options">
            <legend>{t('admin.settings.palettes.title')}</legend>
            {PALETTES.map((option) => (
              <label key={option} className="style-option">
                <input type="radio" name="palette" value={option} checked={palette === option} onChange={() => setPickedPalette(option)} />
                <ColorPreview palette={option} colors={option === palette ? custom : {}} lineWidth={lineWidth} />
                <strong>{t(`admin.settings.palettes.${option}.name`)}</strong>
                <span className="hint">{t(`admin.settings.palettes.${option}.description`)}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="color-fields">
            <legend>{t('admin.settings.customColors')}</legend>
            <p className="hint">{t('admin.settings.customColorsHint')}</p>
            {COLOR_KEYS.map((key) => {
              const own = custom[key]
              const source = copySource(own)
              const value = shown[key]
              return (
                <div key={key} className="color-field">
                  <label htmlFor={`color-${key}`}>{t(`admin.settings.colorKeys.${key}`)}</label>
                  <input id={`color-${key}`} type="color" value={value ?? '#ffffff'} onChange={(e) => setColor(key, e.target.value)} />
                  <select
                    aria-label={t('admin.settings.copyFromFor', { name: t(`admin.settings.colorKeys.${key}`) })}
                    value={source ?? ''}
                    onChange={(e) => setColor(key, e.target.value ? `=${e.target.value}` : null)}
                  >
                    <option value="">{t('admin.settings.copyFrom')}</option>
                    {COLOR_KEYS.filter((other) => other !== key && !wouldCycle(custom, key, other)).map((other) => (
                      <option key={other} value={other}>
                        {t(`admin.settings.colorKeys.${other}`)}
                      </option>
                    ))}
                  </select>
                  {own ? (
                    <button type="button" className="button-quiet" onClick={() => setColor(key, null)}>
                      {t('admin.settings.colorReset')}
                    </button>
                  ) : (
                    <span className="hint">{t(value ? 'admin.settings.colorFromPalette' : 'admin.settings.colorFromSite')}</span>
                  )}
                </div>
              )
            })}
            <div className="color-field">
              <label htmlFor="line-width">{t('admin.settings.lineWidth')}</label>
              <select id="line-width" value={lineWidth ?? ''} onChange={(e) => setPickedWidth(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{t('admin.settings.lineWidthDefault')}</option>
                {LINE_WIDTHS.map((width) => (
                  <option key={width} value={width}>
                    {t('admin.settings.lineWidthPx', { count: width })}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          {fixed.length > 0 && (
            <div className="notice notice--warning" role="status">
              <strong>{t('admin.settings.contrastFixed')}</strong>
              <ul>
                {fixed.map((key) => {
                  const background = backgroundOf(key, shown)
                  const ratio = background && shown[key] ? contrastRatio(shown[key], background) : MIN_CONTRAST
                  return (
                    <li key={key}>
                      {t('admin.settings.contrastFixedItem', {
                        name: t(`admin.settings.colorKeys.${key}`),
                        ratio: ratio.toFixed(1),
                        min: MIN_CONTRAST,
                        color: readable[key] === '#000000' ? t('admin.settings.black') : t('admin.settings.white'),
                      })}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="color-preview-row">
            <span className="hint">{t('admin.settings.colorPreview')}</span>
            <ColorPreview palette={palette} colors={custom} lineWidth={lineWidth} />
          </div>

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
