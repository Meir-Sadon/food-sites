import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FEEDBACK_TEXT_MAX_LENGTH, feedbackApi, type FeedbackKind } from '../../api/admin'
import type { FieldErrors } from '../../api/client'
import { useToast } from '../../components/toast'
import { useFeatures } from '../../site/useSite'
import { sections } from '../sections'
import { fieldErrorsOf, useFormErrorMessage, useLoad } from '../hooks'
import { FieldError, Loading, Section, Status } from '../ui'

const kinds: FeedbackKind[] = ['Problem', 'Comment']
const time = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' })

/** "Report a problem / comment": goes to the platform's console, which marks it handled. */
export function FeedbackPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const formError = useFormErrorMessage()
  const hasFeature = useFeatures()
  const { data: sent, setData, failed } = useLoad(feedbackApi.list)
  const [kind, setKind] = useState<FeedbackKind>('Problem')
  const [text, setText] = useState('')
  const [page, setPage] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // The client site, then every admin page the admin can open.
  const pages = [
    { to: '/', key: 'admin.feedback.clientSite' },
    ...sections.flatMap((section) => section.tabs.filter((tab) => !tab.feature || hasFeature(tab.feature))),
  ]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setError(null)
    setSending(true)
    try {
      const created = await feedbackApi.send({ kind, text, page: page || null })
      setData((list) => [created, ...(list ?? [])])
      setText('')
      setPage('')
      toast(t('admin.feedback.sent'))
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
    } finally {
      setSending(false)
    }
  }

  const pageName = (path: string | null) => {
    const match = pages.find((p) => p.to === path)
    return match ? t(match.key) : path
  }

  return (
    <>
      <h1>{t('admin.feedback.title')}</h1>
      <p className="hint">{t('admin.feedback.intro')}</p>
      <Section title={t('admin.feedback.new')}>
        <form onSubmit={handleSubmit} className="stack">
          <fieldset className="row">
            <legend>{t('admin.feedback.kind')}</legend>
            {kinds.map((k) => (
              <label key={k} className="checkbox">
                <input type="radio" name="feedbackKind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                {t(`admin.feedback.kinds.${k}`)}
              </label>
            ))}
          </fieldset>
          <span className="field">
            <label htmlFor="feedback-page">{t('admin.feedback.page')}</label>
            <select id="feedback-page" value={page} onChange={(e) => setPage(e.target.value)}>
              <option value="">{t('admin.feedback.noPage')}</option>
              {pages.map((p) => (
                <option key={p.to} value={p.to}>
                  {t(p.key)}
                </option>
              ))}
            </select>
          </span>
          <span className="field">
            <label htmlFor="feedback-text">{t('admin.feedback.text')}</label>
            <textarea
              id="feedback-text"
              rows={5}
              maxLength={FEEDBACK_TEXT_MAX_LENGTH}
              value={text}
              aria-describedby="feedback-text-error"
              onChange={(e) => setText(e.target.value)}
            />
            <FieldError errors={errors} field="text" id="feedback-text-error" />
          </span>
          <div className="row">
            <button type="submit" disabled={sending || !text.trim()}>
              {sending ? t('admin.feedback.sending') : t('admin.feedback.send')}
            </button>
          </div>
          {error && <Status message={error} error />}
        </form>
      </Section>
      <Section title={t('admin.feedback.history')}>
        {!sent ? (
          <Loading failed={failed} />
        ) : sent.length === 0 ? (
          <p>{t('admin.feedback.empty')}</p>
        ) : (
          <ul className="list feedback-list">
            {sent.map((item) => (
              <li key={item.id} className="stack">
                <span className="row">
                  <span className="badge">{t(`admin.feedback.kinds.${item.kind}`)}</span>
                  <time className="muted numeric" dateTime={item.createdAt}>
                    {time.format(new Date(item.createdAt))}
                  </time>
                  {item.page && <span>{pageName(item.page)}</span>}
                  <span className={`badge feedback-list__state${item.isHandled ? ' feedback-list__state--handled' : ''}`}>
                    {t(item.isHandled ? 'admin.feedback.handled' : 'admin.feedback.waiting')}
                  </span>
                </span>
                <p className="feedback-list__text">{item.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}
