import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { adminLogin } from '../api/admin'
import { ApiError } from '../api/client'

export function AdminLoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await adminLogin(password)
      navigate('/admin', { replace: true })
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      setError(
        status === 401
          ? t('admin.wrongPassword')
          : status === 429
            ? t('admin.tooManyAttempts')
            : t('admin.error'),
      )
      setSubmitting(false)
    }
  }

  return (
    <main className="page admin-login">
      <h1>{t('admin.loginTitle')}</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="admin-password">{t('admin.password')}</label>
        <input
          id="admin-password"
          type="text"
          dir="ltr"
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? 'admin-login-error' : undefined}
        />
        {error && (
          <p id="admin-login-error" role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting || password === ''}>
          {submitting ? t('admin.submitting') : t('admin.submit')}
        </button>
      </form>
    </main>
  )
}
