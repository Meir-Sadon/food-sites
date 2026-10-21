import { useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { POPUP_FREQUENCIES, POPUP_LIMITS, POPUP_MAX_DELAY_SECONDS, POPUP_SIZES, POPUP_TRIGGERS, popupApi, type Popup, type PopupInput } from '../../api/popup'
import { PopupView } from '../../components/EntryPopup'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { useUnsavedChanges } from '../unsaved'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage, useLoad } from '../hooks'
import { FieldError, Info, Loading, Section, Status } from '../ui'

const toInput = (p: Popup): PopupInput => ({
  enabled: p.enabled,
  size: p.size,
  frequency: p.frequency,
  trigger: p.trigger,
  delaySeconds: p.delaySeconds,
  title: p.title ?? '',
  body: p.body ?? '',
  buttonText: p.buttonText ?? '',
  buttonUrl: p.buttonUrl ?? '',
})

/**
 * The window shown to a client when the site opens: size, picture, title, text and an optional button. The text and
 * choices are saved with the button; the picture is stored as soon as it is chosen, like the background.
 */
export function PopupSection() {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const plainError = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data, setData, failed } = useLoad(popupApi.get)
  const [edited, setEdited] = useState<PopupInput | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const form = edited ?? (data ? toInput(data) : null)
  const dirty = edited !== null && data !== null && JSON.stringify(edited) !== JSON.stringify(toInput(data))

  function change(patch: Partial<PopupInput>) {
    if (!form) return
    setEdited({ ...form, ...patch })
    setError(null)
  }

  async function save(): Promise<boolean> {
    if (!form) return true
    setSaving(true)
    setErrors({})
    try {
      setData(await popupApi.save(form))
      setEdited(null)
      setError(null)
      flash()
      return true
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  useUnsavedChanges(dirty, save)

  /** A picture change only replaces the picture; what is typed in the form stays as it is. */
  async function pictureAction(action: () => Promise<Popup>) {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      setData((current) => (current ? { ...current, imageUrl: result.imageUrl } : result))
    } catch (err) {
      setError(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t('errors.imageTooLarge'))
      return
    }
    void pictureAction(() => popupApi.uploadImage(file))
  }

  const fieldError = (field: string) => <FieldError errors={errors} field={field} id={`popup-${field}-error`} />

  return (
    <Section title={t('admin.popup.title')} hint={t('admin.popup.hint')}>
      {!form || !data ? (
        <Loading failed={failed} />
      ) : (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label className="checkbox">
            <input type="checkbox" checked={form.enabled} onChange={(e) => change({ enabled: e.target.checked })} />
            {t('admin.popup.enabled')}
          </label>
          {fieldError('enabled')}

          <fieldset className="style-options">
            <legend>{t('admin.popup.size')}</legend>
            {POPUP_SIZES.map((size) => (
              <label key={size} className="style-option">
                <input type="radio" name="popup-size" value={size} checked={form.size === size} onChange={() => change({ size })} />
                <strong>{t(`admin.popup.sizes.${size}.name`)}</strong>
                <span className="hint">{t(`admin.popup.sizes.${size}.description`)}</span>
              </label>
            ))}
          </fieldset>
          {fieldError('size')}

          <fieldset className="style-options">
            <legend>{t('admin.popup.frequency')}</legend>
            {POPUP_FREQUENCIES.map((frequency) => (
              <label key={frequency} className="style-option">
                <input
                  type="radio"
                  name="popup-frequency"
                  value={frequency}
                  checked={form.frequency === frequency}
                  onChange={() => change({ frequency })}
                />
                <strong>{t(`admin.popup.frequencies.${frequency}.name`)}</strong>
                <span className="hint">{t(`admin.popup.frequencies.${frequency}.description`)}</span>
              </label>
            ))}
          </fieldset>
          {fieldError('frequency')}

          <fieldset className="style-options">
            <legend>{t('admin.popup.trigger')}</legend>
            {POPUP_TRIGGERS.map((trigger) => (
              <label key={trigger} className="style-option">
                <input
                  type="radio"
                  name="popup-trigger"
                  value={trigger}
                  checked={form.trigger === trigger}
                  onChange={() => change({ trigger })}
                />
                <strong>{t(`admin.popup.triggers.${trigger}.name`)}</strong>
                <span className="hint">{t(`admin.popup.triggers.${trigger}.description`)}</span>
              </label>
            ))}
          </fieldset>
          {fieldError('trigger')}

          <span className="field">
            <span className="with-info">
              <label htmlFor="popup-delay">{t(form.trigger === 'exit' ? 'admin.popup.delayExit' : 'admin.popup.delay')}</label>
              <Info text={t('admin.popup.delayHint', { max: POPUP_MAX_DELAY_SECONDS })} about={t('admin.popup.delay')} />
            </span>
            <input
              id="popup-delay"
              type="number"
              inputMode="numeric"
              min={0}
              max={POPUP_MAX_DELAY_SECONDS}
              step={1}
              value={form.delaySeconds}
              aria-describedby="popup-delaySeconds-error"
              onChange={(e) => change({ delaySeconds: Math.min(POPUP_MAX_DELAY_SECONDS, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
            />
            {fieldError('delaySeconds')}
          </span>

          <div className="stack">
            <strong>{t('admin.popup.image')}</strong>
            {data.imageUrl ? (
              <img className="background-preview" src={data.imageUrl} alt={t('admin.popup.image')} />
            ) : (
              <p>{t('admin.popup.noImage')}</p>
            )}
            <div className="row">
              <label className="button-file">
                {t('admin.settings.chooseImage')}
                <input type="file" accept={IMAGE_TYPES} onChange={handleFile} disabled={busy} />
              </label>
              {data.imageUrl && (
                <button type="button" className="button-quiet" disabled={busy} onClick={() => void pictureAction(popupApi.removeImage)}>
                  {t('admin.popup.removeImage')}
                </button>
              )}
            </div>
            {busy && <p role="status">{t('admin.settings.uploading')}</p>}
          </div>

          <span className="field">
            <label htmlFor="popup-title">{t('admin.popup.titleField')}</label>
            <input
              id="popup-title"
              maxLength={POPUP_LIMITS.title}
              value={form.title ?? ''}
              aria-describedby="popup-title-error"
              onChange={(e) => change({ title: e.target.value })}
            />
            {fieldError('title')}
          </span>
          <span className="field">
            <label htmlFor="popup-body">{t('admin.popup.body')}</label>
            <textarea
              id="popup-body"
              rows={4}
              maxLength={POPUP_LIMITS.body}
              value={form.body ?? ''}
              aria-describedby="popup-body-error"
              onChange={(e) => change({ body: e.target.value })}
            />
            {fieldError('body')}
          </span>

          <h3>{t('admin.popup.button')}</h3>
          <div className="row">
            <span className="field">
              <label htmlFor="popup-button-text">{t('admin.popup.buttonText')}</label>
              <input
                id="popup-button-text"
                maxLength={POPUP_LIMITS.buttonText}
                placeholder={t('admin.popup.buttonTextPlaceholder')}
                value={form.buttonText ?? ''}
                aria-describedby="popup-buttonText-error"
                onChange={(e) => change({ buttonText: e.target.value })}
              />
              {fieldError('buttonText')}
            </span>
            <span className="field">
              <label htmlFor="popup-button-url">{t('admin.popup.buttonUrl')}</label>
              <input
                id="popup-button-url"
                dir="ltr"
                inputMode="url"
                maxLength={POPUP_LIMITS.buttonUrl}
                placeholder="https://"
                value={form.buttonUrl ?? ''}
                aria-describedby="popup-buttonUrl-error"
                onChange={(e) => change({ buttonUrl: e.target.value })}
              />
              {fieldError('buttonUrl')}
            </span>
          </div>

          <Status message={error} error />
          <div className="row">
            <button type="submit" disabled={saving || !dirty}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
            <button type="button" className="button-quiet" onClick={() => setPreviewing(true)}>
              {t('admin.popup.preview')}
            </button>
            <SavedNote show={saved} />
          </div>
          {previewing && (
            <PopupView
              popup={{ ...data, ...form, imageUrl: data.imageUrl, title: form.title || t('admin.popup.previewTitle') }}
              onClose={() => setPreviewing(false)}
            />
          )}
        </form>
      )}
    </Section>
  )
}
