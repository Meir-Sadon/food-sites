import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { accountApi, MAX_RECOMMENDATION_LENGTH } from '../api/account'
import type { FieldErrors } from '../api/client'
import { FieldError, Loading, Status } from '../admin/ui'
import { fieldErrorsOf, useFormErrorMessage } from '../admin/hooks'
import { useAccount } from '../account/useAccount'

export function RecommendationsPage() {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const { user, loading } = useAccount()
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setMessage(null)
    setBusy(true)
    try {
      await accountApi.addRecommendation(text.trim())
      setText('')
      setMessage({ text: t('recommendations.thanks') })
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setMessage({ text: formError(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack">
      <h1>{t('pages.recommendations.title')}</h1>
      {loading ? (
        <Loading />
      ) : !user ? (
        <p>
          {t('recommendations.loginPrompt')}{' '}
          <Link to="/login">{t('recommendations.loginLink')}</Link>
        </p>
      ) : (
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <p className="hint">{t('recommendations.hint')}</p>
          <span className="field">
            <label htmlFor="recommendation-text">{t('recommendations.text')}</label>
            <textarea
              id="recommendation-text"
              rows={5}
              maxLength={MAX_RECOMMENDATION_LENGTH}
              value={text}
              aria-describedby="recommendation-error"
              onChange={(e) => setText(e.target.value)}
            />
            <FieldError errors={errors} field="text" id="recommendation-error" />
          </span>
          {message && <Status message={message.text} error={message.error} />}
          <div className="row">
            <button type="submit" disabled={busy || text.trim() === ''}>
              {busy ? t('recommendations.sending') : t('recommendations.send')}
            </button>
            <Link to="/profile" className="button-quiet">
              {t('recommendations.mine')}
            </Link>
          </div>
        </form>
      )}
    </section>
  )
}
