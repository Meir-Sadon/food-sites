import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { accountApi, type Profile } from '../api/account'
import type { FieldErrors } from '../api/client'
import { Status } from '../admin/ui'
import { fieldErrorsOf, useFormErrorMessage } from '../admin/hooks'
import { ProfileFields } from '../account/ProfileFields'
import { formFromProfile } from '../account/profileForm'
import { addressOf } from '../account/addressParts'
import { normalizePhone } from '../order/phone'
import { PhoneField } from '../order/PhoneField'
import { useToast } from '../components/toast'

interface Props {
  user: Profile
  onSaved: (profile: Profile) => void
}

/** The personal details, all editable. */
export function DetailsSection({ user, onSaved }: Props) {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const [form, setForm] = useState(() => formFromProfile(user))
  const [phone, setPhone] = useState(user.phone)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)

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
      const saved = await accountApi.update({
        phone: normalized,
        ...form,
        fullName: form.fullName.trim(),
        ...addressOf(form),
      })
      onSaved(saved)
      setPhone(saved.phone)
      toast(t('admin.saved'))
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="account-section" aria-labelledby="profile-details-title">
      <h2 id="profile-details-title">{t('profile.details')}</h2>
      <form className="stack" onSubmit={handleSubmit} noValidate>
        <PhoneField phone={phone} onPhoneChange={setPhone} errors={errors} />
        <ProfileFields form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} errors={errors} idPrefix="profile" />
        {error && <Status message={error} error />}
        <div className="row">
          <button type="submit" disabled={busy}>
            {busy ? t('admin.saving') : t('admin.save')}
          </button>
        </div>
      </form>
    </section>
  )
}
