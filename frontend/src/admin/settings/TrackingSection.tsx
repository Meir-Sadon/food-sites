import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { settingsApi, type TrackingInput } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import type { TrackingIds } from '../../api/site'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { FieldError, Info, Loading, Section, Status } from '../ui'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage, useLoad } from '../hooks'

const FIELDS = [
  { key: 'metaPixelId', example: '123456789012345' },
  { key: 'googleAnalyticsId', example: 'G-XXXXXXXXXX' },
  { key: 'googleTagManagerId', example: 'GTM-XXXXXXX' },
  { key: 'tikTokPixelId', example: 'C1ABCDEF2GHIJKLMN3OP' },
] as const satisfies readonly { key: keyof TrackingIds; example: string }[]

/**
 * The marketing tools the owner connects by an id (Meta Pixel, Google Analytics, Tag Manager, TikTok). The client site
 * loads a tool only when its id is filled in. Saved on its own so saving another section never overwrites the ids.
 */
export function TrackingSection() {
  const { t } = useTranslation()
  const errorMessage = useFormErrorMessage()
  const plainError = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [edited, setEdited] = useState<Partial<TrackingIds>>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const value = (key: keyof TrackingIds) => edited[key] ?? settings?.tracking[key] ?? ''
  const dirty = Object.keys(edited).length > 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setErrors({})
    setError(null)
    try {
      const input: TrackingInput = edited
      setData(await settingsApi.saveTracking(input))
      setEdited({})
      flash()
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(Object.keys(fieldErrorsOf(err)).length ? errorMessage(err) : plainError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title={t('admin.settings.tracking.title')} hint={t('admin.settings.tracking.hint')}>
      {!settings ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          {FIELDS.map(({ key, example }) => {
            const id = `settings-tracking-${key}`
            return (
              <span key={key} className="field">
                <span className="with-info">
                  <label htmlFor={id}>{t(`admin.settings.tracking.${key}`)}</label>
                  <Info text={t(`admin.settings.tracking.${key}Hint`)} about={t(`admin.settings.tracking.${key}`)} />
                </span>
                <input
                  id={id}
                  type="text"
                  dir="ltr"
                  maxLength={40}
                  autoComplete="off"
                  placeholder={example}
                  value={value(key)}
                  aria-describedby={`${id}-error`}
                  onChange={(e) => {
                    setEdited((current) => ({ ...current, [key]: e.target.value }))
                    setError(null)
                  }}
                />
                <FieldError errors={errors} field={key} id={`${id}-error`} />
              </span>
            )
          })}
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
