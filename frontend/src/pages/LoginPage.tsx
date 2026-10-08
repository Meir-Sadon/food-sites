import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { accountApi } from '../api/account'
import { ApiError, type FieldErrors } from '../api/client'
import { Loading, Status } from '../admin/ui'
import { fieldErrorsOf, useFormErrorMessage } from '../admin/hooks'
import { ProfileFields } from '../account/ProfileFields'
import { emptyProfileForm, profileInput } from '../account/profileForm'
import { useAccount } from '../account/useAccount'
import { normalizePhone } from '../order/phone'
import { PhoneField } from '../order/PhoneField'
import { useToast } from '../components/toast'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const formError = useFormErrorMessage()
  const { user, loading, setUser, logout } = useAccount()

  const [mode, setMode] = useState<Mode>('login')
  const [phone, setPhone] = useState('')
  const [form, setForm] = useState(emptyProfileForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  if (loading)
    return (
      <section>
        <h1>{t('pages.login.title')}</h1>
        <Loading />
      </section>
    )

  if (user)
    return (
      <section className="stack">
        <h1>{t('pages.login.title')}</h1>
        <p role="status">{t('account.loggedInAs', { name: user.fullName })}</p>
        <div className="row">
          <Link to="/" className="button-link">
            {t('nav.order')}
          </Link>
          <Link to="/profile" className="button-quiet">
            {t('nav.profile')}
          </Link>
          <button type="button" className="button-quiet" onClick={() => logout()}>
            {t('account.logout')}
          </button>
        </div>
      </section>
    )

  const switchTo = (next: Mode) => {
    setMode(next)
    setErrors({})
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setError(null)
    const normalized = normalizePhone(phone)
    if (!normalized) {
      setErrors({ phone: ['phone'] })
      setError(t('errors.checkFields'))
      return
    }

    setBusy(true)
    try {
      if (mode === 'login') {
        setUser(await accountApi.login(normalized))
      } else {
        setUser(
          await accountApi.register(profileInput(normalized, form)),
        )
      }
      navigate('/')
    } catch (err) {
      if (mode === 'login' && err instanceof ApiError && err.code === 'notRegistered') {
        // Nothing to log in to yet: go on to registering with the same number.
        setMode('register')
        toast(t('account.notRegistered'))
      } else {
        setErrors(fieldErrorsOf(err))
        setError(formError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1>{mode === 'login' ? t('account.loginTitle') : t('account.registerTitle')}</h1>
      <form className="stack" onSubmit={handleSubmit} noValidate aria-label={mode === 'login' ? t('account.loginTitle') : t('account.registerTitle')}>
        <p className="hint">{mode === 'login' ? t('account.loginHint') : t('account.registerHint')}</p>

        <PhoneField phone={phone} onPhoneChange={setPhone} errors={errors} />

        {mode === 'register' && (
          <>
            <ProfileFields form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} errors={errors} idPrefix="register" />
            <p className="hint">{t('account.optionalHint')}</p>
          </>
        )}

        {error && <Status message={error} error />}

        <div className="row">
          {mode === 'login' ? (
            <>
              <button type="submit" disabled={busy}>
                {busy ? t('account.loggingIn') : t('account.loginSubmit')}
              </button>
              <button type="button" className="button-quiet" onClick={() => switchTo('register')}>
                {t('account.register')}
              </button>
            </>
          ) : (
            <>
              <button type="submit" disabled={busy}>
                {busy ? t('account.registering') : t('account.registerSubmit')}
              </button>
              <button type="button" className="button-quiet" onClick={() => switchTo('login')}>
                {t('account.haveAccount')}
              </button>
            </>
          )}
        </div>
      </form>
    </section>
  )
}
