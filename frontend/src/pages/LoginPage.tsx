import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { accountApi, type Profile } from '../api/account'
import type { FieldErrors } from '../api/client'
import { Loading, Status } from '../admin/ui'
import { fieldErrorsOf, useFormErrorMessage } from '../admin/hooks'
import { ProfileFields } from '../account/ProfileFields'
import { emptyProfileForm, formFromProfile, profileInput } from '../account/profileForm'
import { useAccount } from '../account/useAccount'
import { normalizePhone } from '../order/phone'
import { PhoneField } from '../order/PhoneField'
import { Modal } from '../components/Modal'
import { GoogleSignInButton } from '../account/GoogleSignInButton'
import { useSite } from '../site/useSite'

/** Login and registration are one step: a phone with no account gets one. A new account then sees the optional "get to know you" form. */
export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const formError = useFormErrorMessage()
  const { user, loading, setUser, logout } = useAccount()
  const googleClientId = useSite()?.googleClientId
  // Set once Google confirmed someone who has no account: only the phone is missing then, and it is sent along with the token.
  const [google, setGoogle] = useState<{ credential: string; fullName: string; email: string } | null>(null)
  // Set when this login made the account: the optional details form is shown before leaving the page.
  const [newcomer, setNewcomer] = useState<Profile | null>(null)

  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (newcomer) return <GetToKnowYou profile={newcomer} onDone={() => navigate('/')} onSaved={setUser} />

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
        <p role="status">{t('account.loggedInAs', { name: user.fullName || user.phone })}</p>
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

  async function handleGoogle(credential: string) {
    setErrors({})
    setError(null)
    setBusy(true)
    try {
      const result = await accountApi.google(credential)
      if (result.profile) {
        setUser(result.profile)
        navigate('/')
      } else {
        // First time with this Google account: the phone is the one thing still needed.
        setGoogle({ credential, fullName: result.registration?.fullName ?? '', email: result.registration?.email ?? '' })
      }
    } catch (err) {
      setError(formError(err))
    } finally {
      setBusy(false)
    }
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
      if (google) {
        const profile = await accountApi.googleRegister(
          google.credential,
          profileInput(normalized, { ...emptyProfileForm(), fullName: google.fullName, email: google.email }),
        )
        setUser(profile)
        setNewcomer(profile)
      } else {
        const result = await accountApi.login(normalized)
        setUser(result.profile)
        if (result.isNew) setNewcomer(result.profile)
        else navigate('/')
      }
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
    } finally {
      setBusy(false)
    }
  }

  const title = t('account.loginTitle')
  return (
    <section>
      <h1>{title}</h1>
      <form className="stack" onSubmit={handleSubmit} noValidate aria-label={title}>
        <p className="hint">{t('account.loginHint')}</p>

        <PhoneField phone={phone} onPhoneChange={setPhone} errors={errors} />

        {!google && error && <Status message={error} error />}

        <div className="row">
          <button type="submit" disabled={busy}>
            {busy && !google ? t('account.loggingIn') : t('account.loginSubmit')}
          </button>
        </div>
      </form>
      {googleClientId && (
        <div className="stack google-login">
          <p className="hint">{t('account.or')}</p>
          <GoogleSignInButton clientId={googleClientId} onCredential={handleGoogle} />
        </div>
      )}
      {google && (
        // First time with this Google account: the phone is the one thing still needed, asked in a small window.
        <Modal title={t('account.googlePhone.title')} onClose={() => setGoogle(null)}>
          <form className="stack" onSubmit={handleSubmit} noValidate aria-label={t('account.googlePhone.title')}>
            <p>{t('account.googlePhone.text')}</p>
            <PhoneField id="google-phone" phone={phone} onPhoneChange={setPhone} errors={errors} />
            {error && <Status message={error} error />}
            <div className="row">
              <button type="submit" disabled={busy}>
                {busy ? t('account.registering') : t('account.googlePhone.submit')}
              </button>
              <button type="button" className="button-quiet" onClick={() => setGoogle(null)}>
                {t('account.cancelGoogle')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

/** Shown once, right after a new account was made: everything on it is optional and can be skipped. */
function GetToKnowYou({ profile, onDone, onSaved }: { profile: Profile; onDone: () => void; onSaved: (profile: Profile) => void }) {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const [form, setForm] = useState(() => formFromProfile(profile))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // First only a question, so a client who just wants to order is not met by a long form.
  const [wantsForm, setWantsForm] = useState(false)

  if (!wantsForm)
    return (
      <section>
        <h1>{t('pages.login.title')}</h1>
        <Modal title={t('account.getToKnow.askTitle')} onClose={onDone}>
          <p>{t('account.getToKnow.ask')}</p>
          <div className="row">
            <button type="button" onClick={() => setWantsForm(true)}>
              {t('account.getToKnow.yes')}
            </button>
            <button type="button" className="button-quiet" onClick={onDone}>
              {t('account.getToKnow.no')}
            </button>
          </div>
        </Modal>
      </section>
    )

  async function save(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setError(null)
    setBusy(true)
    try {
      onSaved(await accountApi.update(profileInput(profile.phone, form)))
      onDone()
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1>{t('account.getToKnow.title')}</h1>
      <form className="stack" onSubmit={save} noValidate aria-label={t('account.getToKnow.title')}>
        <p className="hint">{t('account.getToKnow.hint')}</p>
        <ProfileFields form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} errors={errors} idPrefix="register" />
        {error && <Status message={error} error />}
        <div className="row">
          <button type="submit" disabled={busy}>
            {busy ? t('admin.saving') : t('account.getToKnow.save')}
          </button>
          <button type="button" className="button-quiet" onClick={onDone}>
            {t('account.getToKnow.skip')}
          </button>
        </div>
      </form>
    </section>
  )
}
