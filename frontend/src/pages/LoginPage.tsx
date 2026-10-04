import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { accountApi } from '../api/account'
import { ApiError, type FieldErrors } from '../api/client'
import { Loading, Status } from '../admin/ui'
import { fieldErrorsOf, useFormErrorMessage } from '../admin/hooks'
import { ProfileFields } from '../account/ProfileFields'
import { emptyProfileForm } from '../account/profileForm'
import { addressOf } from '../account/addressParts'
import { useAccount } from '../account/useAccount'
import { normalizePhone } from '../order/phone'
import { PhoneVerification, type Verified } from '../order/PhoneVerification'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const formError = useFormErrorMessage()
  const { user, loading, setUser, logout } = useAccount()

  const [mode, setMode] = useState<Mode>('login')
  const [phone, setPhone] = useState('')
  const [verified, setVerified] = useState<Verified | null>(null)
  const [form, setForm] = useState(emptyProfileForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
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
    setMessage(null)
  }

  // The code confirms the phone; for an existing account that is the whole login.
  async function handleVerified(proof: Verified) {
    setVerified(proof)
    setErrors({})
    if (mode !== 'login') return
    setBusy(true)
    setMessage(null)
    try {
      setUser(await accountApi.login(proof.phone, proof.token))
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'notRegistered') {
        // The phone is already confirmed, so registering needs no second code.
        setMode('register')
        setMessage({ text: t('account.notRegistered') })
      } else {
        setMessage({ text: formError(err), error: true })
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault()
    // In login mode the form only holds the phone: Enter must not submit anything.
    if (mode !== 'register') return
    setErrors({})
    setMessage(null)
    if (!verified || verified.phone !== normalizePhone(phone)) {
      setErrors({ phone: [normalizePhone(phone) ? 'phoneNotVerified' : 'phone'] })
      setMessage({ text: t('errors.checkFields'), error: true })
      return
    }

    setBusy(true)
    try {
      setUser(
        await accountApi.register({
          phone: verified.phone,
          ...form,
          fullName: form.fullName.trim(),
          ...addressOf(form),
          verificationToken: verified.token,
        }),
      )
      navigate('/')
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setMessage({ text: formError(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1>{mode === 'login' ? t('account.loginTitle') : t('account.registerTitle')}</h1>
      <form className="stack" onSubmit={handleRegister} noValidate aria-label={mode === 'login' ? t('account.loginTitle') : t('account.registerTitle')}>
        <p className="hint">{mode === 'login' ? t('account.loginHint') : t('account.registerHint')}</p>

        <PhoneVerification phone={phone} onPhoneChange={setPhone} verified={verified} onVerified={handleVerified} errors={errors} />

        {mode === 'register' && (
          <>
            <ProfileFields form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} errors={errors} idPrefix="register" />
            <p className="hint">{t('account.optionalHint')}</p>
          </>
        )}

        {message && <Status message={message.text} error={message.error} />}

        <div className="row">
          {mode === 'login' ? (
            <button type="button" className="button-quiet" onClick={() => switchTo('register')}>
              {t('account.register')}
            </button>
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
