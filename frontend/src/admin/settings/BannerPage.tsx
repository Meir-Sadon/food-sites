import { useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { BANNER_LIMITS, bannerApi, type BannerInput, type OrderBanner } from '../../api/banner'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage, useLoad } from '../hooks'
import { SectionGroup, SectionSlot } from '../sectionGroup'
import { useUnsavedChanges } from '../unsaved'
import { FieldError, Info, Loading, Section, Status } from '../ui'

const toInput = (b: OrderBanner): BannerInput => ({
  enabled: b.enabled,
  title: b.title ?? '',
  tagline: b.tagline ?? '',
  chips: b.chips,
  background: b.background,
  textColor: b.textColor,
  animationEnabled: b.animationEnabled,
  animationScreens: b.animationScreens,
})

/** The order page's top banner and the scroll animation under it: the banner is the standard one until the admin turns the own banner on. */
export function BannerPage() {
  const { t } = useTranslation()
  const { data, setData, failed } = useLoad(bannerApi.get)
  return (
    <SectionGroup>
      <h1>{t('admin.banner.page')}</h1>
      {!data ? (
        <Loading failed={failed} />
      ) : (
        <>
          <SectionSlot>
            <BannerSection banner={data} onChange={setData} />
          </SectionSlot>
          <SectionSlot>
            <AnimationSection banner={data} onChange={setData} />
          </SectionSlot>
        </>
      )}
    </SectionGroup>
  )
}

/** Saves a part of the banner's text settings; what the other section has is kept as it is saved. */
function useBannerForm(data: OrderBanner, onChange: (banner: OrderBanner) => void, pick: (input: BannerInput) => Partial<BannerInput>) {
  const formError = useFormErrorMessage()
  const { saved, flash } = useSavedFlash()
  const [edited, setEdited] = useState<Partial<BannerInput> | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const base = toInput(data)
  const form = { ...base, ...edited }
  const dirty = edited !== null && JSON.stringify(pick(form)) !== JSON.stringify(pick(base))

  function change(patch: Partial<BannerInput>) {
    setEdited({ ...edited, ...patch })
    setError(null)
  }

  async function save(): Promise<boolean> {
    setSaving(true)
    setErrors({})
    try {
      onChange(await bannerApi.save({ ...base, ...pick(form) }))
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
  return { form, change, errors, error, setError, saving, dirty, save, saved }
}

function BannerSection({ banner: data, onChange }: { banner: OrderBanner; onChange: (banner: OrderBanner) => void }) {
  const { t } = useTranslation()
  const plainError = useErrorMessage()
  const { form, change, errors, error, setError, saving, dirty, save, saved } = useBannerForm(data, onChange, (f) => ({
    enabled: f.enabled,
    title: f.title,
    tagline: f.tagline,
    chips: f.chips,
    background: f.background,
    textColor: f.textColor,
  }))
  const [busy, setBusy] = useState(false)
  const fieldError = (field: string) => <FieldError errors={errors} field={field} id={`banner-${field}-error`} />

  /** The logo is stored as soon as it is chosen; what is typed in the form stays as it is. */
  async function logoAction(action: () => Promise<OrderBanner>) {
    setBusy(true)
    setError(null)
    try {
      onChange({ ...data, logoUrl: (await action()).logoUrl })
    } catch (err) {
      setError(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t('errors.imageTooLarge'))
      return
    }
    void logoAction(() => bannerApi.uploadLogo(file))
  }

  const chips = form.chips
  const setChip = (index: number, text: string) => change({ chips: chips.map((c, i) => (i === index ? text : c)) })

  const colour = (key: 'background' | 'textColor', label: string) => (
    <span className="color-field">
      <label htmlFor={`banner-${key}`}>{label}</label>
      <input id={`banner-${key}`} type="color" value={form[key] ?? '#ffffff'} onChange={(e) => change({ [key]: e.target.value })} />
      {form[key] && (
        <button type="button" className="button-quiet" onClick={() => change({ [key]: null })}>
          {t('admin.banner.siteColour')}
        </button>
      )}
      {fieldError(key)}
    </span>
  )

  return (
    <Section title={t('admin.banner.bannerTitle')} hint={t('admin.banner.bannerHint')}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label className="checkbox">
          <input type="checkbox" checked={form.enabled} onChange={(e) => change({ enabled: e.target.checked })} />
          {t('admin.banner.enabled')}
        </label>

        {form.enabled && (
          <>
            <div className="stack">
              <strong>{t('admin.banner.logo')}</strong>
              <p className="hint">{t('admin.banner.logoHint')}</p>
              {data.logoUrl && <img className="background-preview" src={data.logoUrl} alt={t('admin.banner.logo')} />}
              <div className="row">
                <label className="button-file">
                  {t('admin.settings.chooseImage')}
                  <input type="file" accept={IMAGE_TYPES} onChange={handleLogo} disabled={busy} />
                </label>
                {data.logoUrl && (
                  <button type="button" className="button-quiet" disabled={busy} onClick={() => logoAction(bannerApi.removeLogo)}>
                    {t('admin.banner.removeLogo')}
                  </button>
                )}
              </div>
              {busy && <p role="status">{t('admin.settings.uploading')}</p>}
            </div>

            <div className="row">
              {colour('background', t('admin.banner.background'))}
              {colour('textColor', t('admin.banner.textColor'))}
            </div>

            <span className="field">
              <label htmlFor="banner-title">{t('admin.banner.title')}</label>
              <input
                id="banner-title"
                maxLength={BANNER_LIMITS.title}
                placeholder={t('pages.order.title')}
                value={form.title ?? ''}
                aria-describedby="banner-title-error"
                onChange={(e) => change({ title: e.target.value })}
              />
              {fieldError('title')}
            </span>

            <span className="field">
              <label htmlFor="banner-tagline">{t('admin.banner.tagline')}</label>
              <textarea
                id="banner-tagline"
                rows={2}
                maxLength={BANNER_LIMITS.tagline}
                placeholder={t('order.hero.tagline')}
                value={form.tagline ?? ''}
                aria-describedby="banner-tagline-error"
                onChange={(e) => change({ tagline: e.target.value })}
              />
              {fieldError('tagline')}
            </span>

            <fieldset className="stack">
              <legend className="with-info">
                {t('admin.banner.chips')}
                <Info text={t('admin.banner.chipsHint')} about={t('admin.banner.chips')} />
              </legend>
              {chips.map((chip, i) => (
                <div key={i} className="row">
                  <input
                    aria-label={t('admin.banner.chipN', { n: i + 1 })}
                    maxLength={BANNER_LIMITS.chip}
                    value={chip}
                    onChange={(e) => setChip(i, e.target.value)}
                  />
                  <button type="button" className="button-quiet" onClick={() => change({ chips: chips.filter((_, j) => j !== i) })}>
                    {t('admin.banner.removeChip')}
                  </button>
                </div>
              ))}
              {chips.length < BANNER_LIMITS.chips && (
                <button type="button" className="button-quiet" onClick={() => change({ chips: [...chips, ''] })}>
                  {t('admin.banner.addChip')}
                </button>
              )}
              {chips.length === 0 && <p className="hint">{t('admin.banner.standardChips')}</p>}
              {fieldError('chips')}
            </fieldset>
          </>
        )}

        <Status message={error} error />
        <div className="row">
          <button type="submit" disabled={saving || !dirty}>
            {saving ? t('admin.saving') : t('admin.save')}
          </button>
          <SavedNote show={saved} />
        </div>
      </form>
    </Section>
  )
}

function AnimationSection({ banner: data, onChange }: { banner: OrderBanner; onChange: (banner: OrderBanner) => void }) {
  const { t } = useTranslation()
  const plainError = useErrorMessage()
  const { form, change, errors, error, setError, saving, dirty, save, saved } = useBannerForm(data, onChange, (f) => ({
    animationEnabled: f.animationEnabled,
    animationScreens: f.animationScreens,
  }))
  const [busy, setBusy] = useState(false)

  /** The pictures are changed on their own; what is typed in the form stays as it is. */
  async function framesAction(action: () => Promise<OrderBanner>) {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      onChange({ ...data, frames: result.frames, animationEnabled: result.animationEnabled })
    } catch (err) {
      setError(plainError(err))
    } finally {
      setBusy(false)
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setError(t('errors.imageTooLarge'))
      return
    }
    void framesAction(async () => {
      let last: OrderBanner = data
      for (const file of files) last = await bannerApi.addFrame(file)
      return last
    })
  }

  const frames = data.frames
  return (
    <Section title={t('admin.banner.animationTitle')} hint={t('admin.banner.animationHint')}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="stack">
          <strong>{t('admin.banner.frames')}</strong>
          <p className="hint">{t('admin.banner.framesHint', { max: BANNER_LIMITS.frames })}</p>
          {frames.length > 0 && (
            <ol className="image-list">
              {frames.map((frame, i) => (
                <li key={frame.id} className="row">
                  <img src={frame.url} alt={t('admin.banner.frameN', { n: i + 1 })} width={96} />
                  <span>{i + 1}</span>
                  <button type="button" className="button-quiet" disabled={busy || i === 0} aria-label={t('admin.banner.frameUp', { n: i + 1 })} onClick={() => framesAction(() => bannerApi.moveFrame(frame.id, 'Up'))}>
                    ↑
                  </button>
                  <button type="button" className="button-quiet" disabled={busy || i === frames.length - 1} aria-label={t('admin.banner.frameDown', { n: i + 1 })} onClick={() => framesAction(() => bannerApi.moveFrame(frame.id, 'Down'))}>
                    ↓
                  </button>
                  <button type="button" className="button-quiet" disabled={busy} onClick={() => framesAction(() => bannerApi.removeFrame(frame.id))}>
                    {t('admin.banner.removeFrame', { n: i + 1 })}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {frames.length < BANNER_LIMITS.frames && (
            <label className="button-file">
              {t('admin.banner.addFrames')}
              <input type="file" accept={IMAGE_TYPES} multiple onChange={handleFiles} disabled={busy} />
            </label>
          )}
          {busy && <p role="status">{t('admin.settings.uploading')}</p>}
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.animationEnabled}
            disabled={frames.length < 2}
            onChange={(e) => change({ animationEnabled: e.target.checked })}
          />
          {t('admin.banner.animationEnabled')}
        </label>
        {frames.length < 2 && <p className="hint">{t('admin.banner.needTwo')}</p>}
        <FieldError errors={errors} field="animationEnabled" id="banner-animationEnabled-error" />

        <span className="field field--narrow">
          <label htmlFor="banner-screens">{t('admin.banner.screens')}</label>
          <input
            id="banner-screens"
            type="number"
            min={BANNER_LIMITS.minScreens}
            max={BANNER_LIMITS.maxScreens}
            value={form.animationScreens}
            aria-describedby="banner-animationScreens-error"
            onChange={(e) => change({ animationScreens: Math.min(BANNER_LIMITS.maxScreens, Math.max(BANNER_LIMITS.minScreens, Number(e.target.value) || BANNER_LIMITS.minScreens)) })}
          />
          <span className="hint">{t('admin.banner.screensHint')}</span>
          <FieldError errors={errors} field="animationScreens" id="banner-animationScreens-error" />
        </span>

        <Status message={error} error />
        <div className="row">
          <button type="submit" disabled={saving || !dirty}>
            {saving ? t('admin.saving') : t('admin.save')}
          </button>
          <SavedNote show={saved} />
        </div>
      </form>
    </Section>
  )
}
