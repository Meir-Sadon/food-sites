import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { restrictedApi, type RestrictedClients } from '../../api/admin'
import { fieldErrorsOf, useErrorMessage, useLoad } from '../hooks'
import { FieldError, Loading, Section, Status } from '../ui'

/**
 * Restricted clients: the phones marked as restricted. Admin-only: clients never see any of it. The prepayment message
 * is edited with the other WhatsApp messages (`RestrictedMessageSection`).
 */
export function RestrictedClientsSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data, setData, failed } = useLoad(restrictedApi.get)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phoneError, setPhoneError] = useState<ReturnType<typeof fieldErrorsOf>>({})

  async function change(action: () => Promise<RestrictedClients>) {
    setError(null)
    setPhoneError({})
    try {
      setData(await action())
      return true
    } catch (err) {
      setPhoneError(fieldErrorsOf(err))
      setError(errorMessage(err))
      return false
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    if (await change(() => restrictedApi.add(phone))) setPhone('')
  }

  return (
    <Section title={t('admin.restricted.title')} hint={t('admin.restricted.hint')}>
      {!data ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          <form className="stack" onSubmit={(event) => void add(event)}>
            <span className="field">
              <label htmlFor="restricted-phone">{t('admin.restricted.addPhone')}</label>
              <input id="restricted-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-describedby="restricted-phone-error" />
              <FieldError errors={phoneError} field="phone" id="restricted-phone-error" />
            </span>
            <div className="row">
              <button type="submit" disabled={!phone.trim()}>
                {t('admin.restricted.add')}
              </button>
            </div>
          </form>
          {data.phones.length === 0 ? (
            <p className="muted">{t('admin.restricted.none')}</p>
          ) : (
            <ul className="list">
              {data.phones.map((p) => (
                <li key={p} className="list__row">
                  <bdi dir="ltr">{p}</bdi>
                  <button type="button" className="button-quiet" onClick={() => void change(() => restrictedApi.remove(p))}>
                    {t('admin.restricted.unmark')}
                    <span className="visually-hidden"> {p}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <Status message={error} error />}
        </div>
      )}
    </Section>
  )
}
