import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { accountApi, type Profile, type RememberInput } from '../api/account'
import { useErrorMessage } from '../admin/hooks'

type Phase = 'ask' | 'saving' | 'saved' | 'guestSaved' | 'notSaved' | 'declined'

interface Props {
  details: RememberInput
  /** Called with the profile when the client is logged in and the details went to their account. */
  onSaved: (profile: Profile) => void
}

/** After an order: keep the name and address for the next one? A logged-in client gets them on the account, a guest is remembered by phone. */
export function RememberDetails({ details, onSaved }: Props) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [phase, setPhase] = useState<Phase>('ask')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setPhase('saving')
    setError(null)
    try {
      const result = await accountApi.remember(details)
      if (result.profile) onSaved(result.profile)
      setPhase(!result.saved ? 'notSaved' : result.profile ? 'saved' : 'guestSaved')
    } catch (err) {
      setError(errorMessage(err))
      setPhase('ask')
    }
  }

  if (phase === 'declined') return null
  if (phase !== 'ask' && phase !== 'saving')
    return (
      <p role="status" className="notice">
        {t(`order.remember.${phase}`)}
      </p>
    )
  return (
    <section className="notice remember-details" aria-labelledby="remember-title">
      <h3 id="remember-title">{t('order.remember.title')}</h3>
      <p>{t('order.remember.hint')}</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" onClick={save} disabled={phase === 'saving'}>
          {phase === 'saving' ? t('admin.saving') : t('order.remember.yes')}
        </button>
        <button type="button" className="button-quiet" onClick={() => setPhase('declined')} disabled={phase === 'saving'}>
          {t('order.remember.no')}
        </button>
      </div>
    </section>
  )
}
