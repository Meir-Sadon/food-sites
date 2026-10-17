import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_CUSTOM_LINKS, SOCIAL_PLATFORMS, socialLinksApi, type SocialLink, type SocialPlatform } from '../../api/social'
import type { FieldErrors } from '../../api/client'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { useUnsavedChanges } from '../unsaved'
import { fieldErrorsOf, useFormErrorMessage, useLoad } from '../hooks'
import { ConfirmRemove, FieldError, Loading, Section, Status } from '../ui'

interface Form {
  platforms: Record<SocialPlatform, string>
  custom: { label: string; url: string }[]
}

const toForm = (links: SocialLink[]): Form => ({
  platforms: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, links.find((l) => l.kind === p)?.url ?? ''])) as Form['platforms'],
  custom: links.filter((l) => l.kind === 'custom').map((l) => ({ label: l.label ?? '', url: l.url })),
})

/** What is sent, and for each entry the field it came from (to show a refusal beside it). */
function toRequest(form: Form) {
  const links: SocialLink[] = []
  const fields: string[] = []
  for (const p of SOCIAL_PLATFORMS) {
    if (!form.platforms[p].trim()) continue
    links.push({ kind: p, label: null, url: form.platforms[p].trim() })
    fields.push(p)
  }
  form.custom.forEach((c, i) => {
    if (!c.label.trim() && !c.url.trim()) return
    links.push({ kind: 'custom', label: c.label.trim(), url: c.url.trim() })
    fields.push(`custom-${i}`)
  })
  return { links, fields }
}

/**
 * The links to the business's Facebook, Instagram and TikTok pages and to any other page, shown as buttons on the
 * About page. A field left empty is not shown. Saves on its own, so it never touches the other settings.
 */
export function SocialLinksSection() {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data, setData, failed } = useLoad(socialLinksApi.get)
  const [edited, setEdited] = useState<Form | null>(null)
  const [errors, setErrors] = useState<Record<string, FieldErrors[string]>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const form = edited ?? (data ? toForm(data) : null)

  function change(next: Form) {
    setEdited(next)
    setError(null)
  }

  async function save(): Promise<boolean> {
    if (!form) return true
    const { links, fields } = toRequest(form)
    setSaving(true)
    setErrors({})
    try {
      const result = await socialLinksApi.save(links)
      setData(result)
      setEdited(null)
      setError(null)
      flash()
      return true
    } catch (err) {
      // The server names an entry by its place in the list sent; show its message beside the field it came from.
      const byField: Record<string, FieldErrors[string]> = {}
      for (const [key, codes] of Object.entries(fieldErrorsOf(err))) {
        const match = /^links\[(\d+)\]\.(\w+)$/.exec(key)
        const field = match ? fields[Number(match[1])] : undefined
        if (field) byField[field] = [...(byField[field] ?? []), ...codes]
        else byField.list = [...(byField.list ?? []), ...codes]
      }
      setErrors(byField)
      setError(formError(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    form !== null && edited !== null && JSON.stringify(toRequest(form).links) !== JSON.stringify(data?.map(({ kind, label, url }) => ({ kind, label, url })))
  useUnsavedChanges(dirty, save)

  const fieldError = (field: string) => <FieldError errors={errors} field={field} id={`social-${field}-error`} />

  return (
    <Section title={t('socialLinks.title')} hint={t('socialLinks.hint')}>
      {!form ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          {SOCIAL_PLATFORMS.map((p) => (
            <span className="field" key={p}>
              <label htmlFor={`social-${p}`}>{t(`socialLinks.platforms.${p}`)}</label>
              <input
                id={`social-${p}`}
                type="url"
                dir="ltr"
                inputMode="url"
                maxLength={500}
                placeholder={t(`socialLinks.placeholders.${p}`)}
                value={form.platforms[p]}
                aria-describedby={`social-${p}-error`}
                onChange={(e) => change({ ...form, platforms: { ...form.platforms, [p]: e.target.value } })}
              />
              {fieldError(p)}
            </span>
          ))}
          <h3>{t('socialLinks.other')}</h3>
          {form.custom.length === 0 && <p className="hint">{t('socialLinks.noOther')}</p>}
          <ul className="list">
            {form.custom.map((c, index) => {
              const field = `custom-${index}`
              const name = c.label.trim() || t('socialLinks.unnamed')
              return (
                <li key={index}>
                  <div className="row">
                    <span className="field">
                      <label htmlFor={`social-${field}-label`}>{t('socialLinks.label')}</label>
                      <input
                        id={`social-${field}-label`}
                        maxLength={40}
                        placeholder={t('socialLinks.labelPlaceholder')}
                        value={c.label}
                        aria-describedby={`social-${field}-error`}
                        onChange={(e) =>
                          change({ ...form, custom: form.custom.map((x, i) => (i === index ? { ...x, label: e.target.value } : x)) })
                        }
                      />
                    </span>
                    <span className="field">
                      <label htmlFor={`social-${field}-url`}>{t('socialLinks.url')}</label>
                      <input
                        id={`social-${field}-url`}
                        type="url"
                        dir="ltr"
                        inputMode="url"
                        maxLength={500}
                        placeholder="https://"
                        value={c.url}
                        aria-describedby={`social-${field}-error`}
                        onChange={(e) =>
                          change({ ...form, custom: form.custom.map((x, i) => (i === index ? { ...x, url: e.target.value } : x)) })
                        }
                      />
                    </span>
                    <ConfirmRemove name={name} onConfirm={() => change({ ...form, custom: form.custom.filter((_, i) => i !== index) })} />
                  </div>
                  {fieldError(field)}
                </li>
              )
            })}
          </ul>
          {fieldError('list')}
          {form.custom.length < MAX_CUSTOM_LINKS && (
            <div className="row">
              <button type="button" className="button-quiet" onClick={() => change({ ...form, custom: [...form.custom, { label: '', url: '' }] })}>
                {t('socialLinks.add')}
              </button>
            </div>
          )}
          <Status message={error} error />
          <div className="row">
            <button type="button" onClick={() => void save()} disabled={saving || edited === null}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
            <SavedNote show={saved} />
          </div>
        </div>
      )}
    </Section>
  )
}
