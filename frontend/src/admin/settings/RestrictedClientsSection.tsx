import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { restrictedApi, type RestrictedClients } from '../../api/admin'
import { RESTRICTED_PLACEHOLDERS } from '../messages/compose'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { fieldErrorsOf, useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsaved'
import { FieldError, Loading, Section, Status } from '../ui'

/**
 * Restricted clients: the WhatsApp message asking them to pay in advance (sent by hand from the order) and the phones
 * marked as restricted. Admin-only: clients never see any of it.
 */
export function RestrictedClientsSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data, setData, failed } = useLoad(restrictedApi.get)
  const [edited, setEdited] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phoneError, setPhoneError] = useState<ReturnType<typeof fieldErrorsOf>>({})
  const text = edited ?? data?.message ?? t('admin.restricted.defaultMessage')
  const dirty = edited !== null && edited !== (data?.message ?? t('admin.restricted.defaultMessage'))

  useUnsavedChanges(dirty, save)

  async function save(): Promise<boolean> {
    setSaving(true)
    setError(null)
    try {
      // The built-in text is kept as "not set", so a later change to it reaches this site.
      setData(await restrictedApi.saveMessage(edited === t('admin.restricted.defaultMessage') ? '' : (edited ?? '')))
      setEdited(null)
      flash()
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

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
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <span className="field">
              <label htmlFor="restricted-message">{t('admin.restricted.message')}</label>
              <textarea id="restricted-message" rows={6} value={text} onChange={(e) => setEdited(e.target.value)} />
              <span className="hint">
                {t('admin.restricted.placeholders')} <bdi dir="ltr">{RESTRICTED_PLACEHOLDERS.join(' ')}</bdi>
              </span>
            </span>
            <div className="row">
              <button type="submit" disabled={saving || !dirty}>
                {saving ? t('admin.saving') : t('admin.save')}
              </button>
              <SavedNote show={saved} />
            </div>
          </form>
          <form className="stack" onSubmit={(event) => void add(event)}>
            <span className="field">
              <label htmlFor="restricted-phone">{t('admin.restricted.addPhone')}</label>
              <input id="restricted-phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} aria-describedby="restricted-phone-error" />
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
