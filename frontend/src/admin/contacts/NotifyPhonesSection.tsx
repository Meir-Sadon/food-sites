import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { contactsApi, pushoverSounds } from '../../api/site'
import { useFeature } from '../../site/useSite'
import type { FieldErrors } from '../../api/client'
import { ConfirmRemove, FieldError, Loading, Section, Status } from '../ui'
import { fieldErrorsOf, useErrorMessage, useLoad } from '../hooks'

export function NotifyPhonesSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data: phones, setData, failed } = useLoad(contactsApi.notifyPhones)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [pushKey, setPushKey] = useState('')
  const [sound, setSound] = useState<string>(pushoverSounds[0])
  const alerts = useFeature('phoneAlerts')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setError(null)
    try {
      const added = await contactsApi.addNotifyPhone(phone, name, alerts ? pushKey : '', alerts && pushKey.trim() ? sound : '')
      setData((current) => [...(current ?? []), added])
      setPhone('')
      setName('')
      setPushKey('')
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      if (!Object.keys(fieldErrorsOf(err)).length) setError(errorMessage(err))
    }
  }

  async function handleRemove(id: number) {
    try {
      await contactsApi.removeNotifyPhone(id)
      setData((current) => current && current.filter((p) => p.id !== id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Section title={t('admin.contacts.notify')} hint={t('admin.contacts.notifyHint')}>
      {!phones ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          {phones.length === 0 ? (
            <p>{t('admin.contacts.noNotify')}</p>
          ) : (
            <ul className="list">
              {phones.map((p) => (
                <li key={p.id} className="list__row">
                  <span>
                    <bdi className="numeric">{p.phone}</bdi>
                    {p.name && ` · ${p.name}`}
                    {p.pushoverKey && ` · ${t('admin.contacts.alertOn')}`}
                  </span>
                  <ConfirmRemove name={p.phone} onConfirm={() => handleRemove(p.id)} />
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAdd} className="row row--end" noValidate>
            <span className="field">
              <label htmlFor="notify-phone">{t('admin.contacts.phone')}</label>
              <input
                id="notify-phone"
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-describedby="notify-phone-error"
              />
              <FieldError errors={errors} field="phone" id="notify-phone-error" />
            </span>
            <span className="field field--grow">
              <label htmlFor="notify-name">{t('admin.contacts.notifyName')}</label>
              <input id="notify-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </span>
            {alerts && (
              <>
                <span className="field">
                  <label htmlFor="notify-push-key">{t('admin.contacts.pushKey')}</label>
                  <input
                    id="notify-push-key"
                    dir="ltr"
                    value={pushKey}
                    maxLength={30}
                    autoComplete="off"
                    onChange={(e) => setPushKey(e.target.value)}
                    aria-describedby="notify-push-key-hint notify-push-key-error"
                  />
                  <small id="notify-push-key-hint">{t('admin.contacts.pushKeyHint')}</small>
                  <FieldError errors={errors} field="pushoverKey" id="notify-push-key-error" />
                </span>
                <span className="field">
                  <label htmlFor="notify-push-sound">{t('admin.contacts.pushSound')}</label>
                  <select id="notify-push-sound" value={sound} onChange={(e) => setSound(e.target.value)}>
                    {pushoverSounds.map((value) => (
                      <option key={value} value={value}>
                        {t(`admin.contacts.sounds.${value}`)}
                      </option>
                    ))}
                  </select>
                </span>
              </>
            )}
            <button type="submit" disabled={!phone.trim()}>
              {t('admin.add')}
            </button>
          </form>
          {error && <Status message={error} error />}
        </div>
      )}
    </Section>
  )
}
