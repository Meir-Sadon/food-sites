import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { adminLogin } from '../api/admin'
import { ApiError } from '../api/client'

export function AdminLoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await adminLogin(username.trim(), password)
      navigate('/admin', { replace: true })
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0
      setError(
        status === 401
          ? t('admin.wrongLogin')
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
        <label htmlFor="admin-username">{t('admin.username')}</label>
        <input
          id="admin-username"
          type="text"
          dir="ltr"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? 'admin-login-error' : undefined}
        />
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
        <button type="submit" disabled={submitting || username.trim() === '' || password === ''}>
          {submitting ? t('admin.submitting') : t('admin.submit')}
        </button>
      </form>
      <Link to="/" className="admin-login__home">
        {t('admin.home')}
      </Link>
    </main>
  )
}
