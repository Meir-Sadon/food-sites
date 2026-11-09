import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DISH_LAYOUTS, IMAGE_SIZES, type DishLayout, type ImageSize, type SectionLook } from '../api/site'

/** What a category or group asks for: its own dish layout and picture size, or null for the site's. */
export interface LookChoice {
  layout: DishLayout | ''
  imageSize: ImageSize | ''
}

export const lookChoiceOf = (look: SectionLook): LookChoice => ({ layout: look.layout ?? '', imageSize: look.imageSize ?? '' })

export const lookOf = (choice: LookChoice): SectionLook => ({ layout: choice.layout || null, imageSize: choice.imageSize || null })

/** Two lists to give a category or a group its own look, instead of the site's (the Appearance page's choices). */
export function SectionLookFields({ idPrefix, value, onChange }: { idPrefix: string; value: LookChoice; onChange: (value: LookChoice) => void }) {
  const { t } = useTranslation()
  return (
    <span className="row row--end">
      <span className="field">
        <label htmlFor={`${idPrefix}-layout`}>{t('admin.sectionLook.layout')}</label>
        <select id={`${idPrefix}-layout`} value={value.layout} onChange={(e) => onChange({ ...value, layout: e.target.value as LookChoice['layout'] })}>
          <option value="">{t('admin.sectionLook.asSite')}</option>
          {DISH_LAYOUTS.map((layout) => (
            <option key={layout} value={layout}>
              {t(`admin.sectionLook.layouts.${layout}`)}
            </option>
          ))}
        </select>
      </span>
      <span className="field">
        <label htmlFor={`${idPrefix}-size`}>{t('admin.sectionLook.imageSize')}</label>
        <select id={`${idPrefix}-size`} value={value.imageSize} onChange={(e) => onChange({ ...value, imageSize: e.target.value as LookChoice['imageSize'] })}>
          <option value="">{t('admin.sectionLook.asSite')}</option>
          {IMAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {t(`admin.settings.imageSize.${size}`)}
            </option>
          ))}
        </select>
      </span>
    </span>
  )
}

/** The same two lists straight on a category's or group's row: a change is saved at once, no edit form to open. */
export function SectionLookQuick({ idPrefix, look, onSave }: { idPrefix: string; look: SectionLook; onSave: (look: SectionLook) => Promise<void> }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  async function change(next: LookChoice) {
    setPending(true)
    setFailed(false)
    try {
      await onSave(lookOf(next))
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <span className="section-look-quick">
      <fieldset disabled={pending} className="section-look-quick__fields">
        <SectionLookFields idPrefix={`${idPrefix}-quick`} value={lookChoiceOf(look)} onChange={(next) => void change(next)} />
      </fieldset>
      {failed && <span role="alert" className="muted">{t('admin.sectionLook.saveFailed')}</span>}
    </span>
  )
}
