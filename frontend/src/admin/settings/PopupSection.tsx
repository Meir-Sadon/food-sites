import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import {
  POPUP_ACTIVITY_CHOICES,
  POPUP_FREQUENCIES,
  POPUP_LIMITS,
  POPUP_LOGIN_CHOICES,
  POPUP_MAX_DELAY_SECONDS,
  POPUP_MAX_TOTAL,
  POPUP_ORDER_SOURCES,
  POPUP_SIZES,
  popupApi,
  type Popup,
  type PopupInput,
} from '../../api/popup'
import { PopupView } from '../../components/EntryPopup'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { useUnsavedChanges } from '../unsaved'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage } from '../hooks'
import { FieldError, Info, Section, Status } from '../ui'

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
  login: p.login,
  activity: p.activity,
  orderSource: p.orderSource,
  orderTotal: p.orderTotal,
  minTotal: p.minTotal,
  maxTotal: p.maxTotal,
})

/** A number box's text as the amount it holds; an empty box is no limit. */
const amountOf = (text: string) => (text === '' ? null : Math.min(POPUP_MAX_TOTAL, Math.max(0, Number(text) || 0)))

/** A condition's checkbox with, once ticked, what belongs to it. */
function Condition({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children?: ReactNode }) {
  return (
    <div className="stack">
      <label className="checkbox">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        {label}
      </label>
      {on && children}
    </div>
  )
}

/**
 * One of the windows shown to a client when the site opens: size, picture, title, text, an optional button, and the
 * conditions a visitor must all meet to be shown it. The text and choices are saved with the button; the picture is
 * stored as soon as it is chosen, like the background.
 */
export function PopupSection({ popup: data, onChange }: { popup: Popup; onChange: (popup: Popup) => void }) {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const plainError = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const slot = data.slot
  const [edited, setEdited] = useState<PopupInput | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const form = edited ?? toInput(data)
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(toInput(data))
  // "Always" is what is left when no condition is ticked.
  const always = !form.login && !form.activity && !form.orderSource && !form.orderTotal && form.trigger === 'load'

  function change(patch: Partial<PopupInput>) {
    setEdited({ ...form, ...patch })
    setError(null)
  }

  async function save(): Promise<boolean> {
    setSaving(true)
    setErrors({})
    try {
      onChange(await popupApi.save(slot, form))
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
      onChange({ ...data, imageUrl: result.imageUrl })
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
    void pictureAction(() => popupApi.uploadImage(slot, file))
  }

  const fieldError = (field: string) => <FieldError errors={errors} field={field} id={`popup-${slot}-${field}-error`} />

  const id = (name: string) => `popup-${slot}-${name}`
  const radios = <T extends string>(name: string, choices: readonly T[], value: T | null, key: string, onPick: (choice: T) => void) => (
    <div className="style-options" role="radiogroup" aria-label={t(`admin.popup.when.${key}.label`)}>
      {choices.map((choice) => (
        <label key={choice} className="style-option">
          <input type="radio" name={id(name)} value={choice} checked={value === choice} onChange={() => onPick(choice)} />
          <strong>{t(`admin.popup.when.${key}.choices.${choice}`)}</strong>
        </label>
      ))}
    </div>
  )

  return (
    <Section title={t('admin.popup.slotTitle', { slot })} hint={t('admin.popup.hint')}>
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
              <input type="radio" name={id('size')} value={size} checked={form.size === size} onChange={() => change({ size })} />
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
                name={id('frequency')}
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

        <fieldset className="stack">
          <legend>{t('admin.popup.conditions')}</legend>
          <p className="hint">{t('admin.popup.conditionsHint')}</p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={always}
              onChange={(e) => e.target.checked && change({ login: null, activity: null, orderSource: null, orderTotal: false, minTotal: null, maxTotal: null, trigger: 'load' })}
            />
            {t('admin.popup.when.always')}
          </label>

          <Condition label={t('admin.popup.when.login.label')} on={form.login !== null} onToggle={(on) => change({ login: on ? 'loggedIn' : null })}>
            {radios('login', POPUP_LOGIN_CHOICES, form.login, 'login', (login) => change({ login }))}
            {fieldError('login')}
          </Condition>

          <Condition
            label={t('admin.popup.when.activity.label')}
            on={form.activity !== null}
            onToggle={(on) => change({ activity: on ? 'active' : null })}
          >
            {radios('activity', POPUP_ACTIVITY_CHOICES, form.activity, 'activity', (activity) => change({ activity }))}
            <p className="hint">{t('admin.popup.when.activity.hint')}</p>
            {fieldError('activity')}
          </Condition>

          <Condition
            label={t('admin.popup.when.orderSource.label')}
            on={form.orderSource !== null}
            onToggle={(on) => change({ orderSource: on ? 'any' : null })}
          >
            {radios('order-source', POPUP_ORDER_SOURCES, form.orderSource, 'orderSource', (orderSource) => change({ orderSource }))}
            {fieldError('orderSource')}
          </Condition>

          <Condition
            label={t('admin.popup.when.orderTotal.label')}
            on={form.orderTotal}
            onToggle={(on) => change({ orderTotal: on, ...(on ? {} : { minTotal: null, maxTotal: null }) })}
          >
            <p className="hint">{t('admin.popup.when.orderTotal.hint')}</p>
            <div className="row">
              <span className="field field--narrow">
                <label htmlFor={id('min-total')}>{t('admin.popup.when.orderTotal.min')}</label>
                <input
                  id={id('min-total')}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={POPUP_MAX_TOTAL}
                  value={form.minTotal ?? ''}
                  aria-describedby={id('minTotal-error')}
                  onChange={(e) => change({ minTotal: amountOf(e.target.value) })}
                />
                {fieldError('minTotal')}
              </span>
              <span className="field field--narrow">
                <label htmlFor={id('max-total')}>{t('admin.popup.when.orderTotal.max')}</label>
                <input
                  id={id('max-total')}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={POPUP_MAX_TOTAL}
                  value={form.maxTotal ?? ''}
                  aria-describedby={id('maxTotal-error')}
                  onChange={(e) => change({ maxTotal: amountOf(e.target.value) })}
                />
                {fieldError('maxTotal')}
              </span>
            </div>
          </Condition>

          <span className="with-info">
            <label className="checkbox">
              <input type="checkbox" checked={form.trigger === 'exit'} onChange={(e) => change({ trigger: e.target.checked ? 'exit' : 'load' })} />
              {t('admin.popup.when.exit.label')}
            </label>
            <Info text={t('admin.popup.when.exit.hint')} about={t('admin.popup.when.exit.label')} />
          </span>
          {fieldError('trigger')}
        </fieldset>

        <span className="field">
          <span className="with-info">
            <label htmlFor={id('delay')}>{t(form.trigger === 'exit' ? 'admin.popup.delayExit' : 'admin.popup.delay')}</label>
            <Info text={t('admin.popup.delayHint', { max: POPUP_MAX_DELAY_SECONDS })} about={t('admin.popup.delay')} />
          </span>
          <input
            id={id('delay')}
            type="number"
            inputMode="numeric"
            min={0}
            max={POPUP_MAX_DELAY_SECONDS}
            step={1}
            value={form.delaySeconds}
            aria-describedby={id('delaySeconds-error')}
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
              <button type="button" className="button-quiet" disabled={busy} onClick={() => void pictureAction(() => popupApi.removeImage(slot))}>
                {t('admin.popup.removeImage')}
              </button>
            )}
          </div>
          {busy && <p role="status">{t('admin.settings.uploading')}</p>}
        </div>

        <span className="field">
          <label htmlFor={id('title')}>{t('admin.popup.titleField')}</label>
          <input
            id={id('title')}
            maxLength={POPUP_LIMITS.title}
            value={form.title ?? ''}
            aria-describedby={id('title-error')}
            onChange={(e) => change({ title: e.target.value })}
          />
          {fieldError('title')}
        </span>
        <span className="field">
          <label htmlFor={id('body')}>{t('admin.popup.body')}</label>
          <textarea
            id={id('body')}
            rows={4}
            maxLength={POPUP_LIMITS.body}
            value={form.body ?? ''}
            aria-describedby={id('body-error')}
            onChange={(e) => change({ body: e.target.value })}
          />
          {fieldError('body')}
        </span>

        <h3>{t('admin.popup.button')}</h3>
        <div className="row">
          <span className="field">
            <label htmlFor={id('button-text')}>{t('admin.popup.buttonText')}</label>
            <input
              id={id('button-text')}
              maxLength={POPUP_LIMITS.buttonText}
              placeholder={t('admin.popup.buttonTextPlaceholder')}
              value={form.buttonText ?? ''}
              aria-describedby={id('buttonText-error')}
              onChange={(e) => change({ buttonText: e.target.value })}
            />
            {fieldError('buttonText')}
          </span>
          <span className="field">
            <span className="with-info">
              <label htmlFor={id('button-url')}>{t('admin.popup.buttonUrl')}</label>
              <Info text={t('admin.popup.buttonUrlHint')} about={t('admin.popup.buttonUrl')} />
            </span>
            <input
              id={id('button-url')}
              dir="ltr"
              inputMode="url"
              maxLength={POPUP_LIMITS.buttonUrl}
              placeholder="https://  /about"
              value={form.buttonUrl ?? ''}
              aria-describedby={id('buttonUrl-error')}
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
    </Section>
  )
}
