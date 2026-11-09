import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { clientsApi, listClients, type NewClientInput, type RegisteredClient } from '../../api/admin'
import { normalizeSearchText } from '../../order/search'
import { firstName, whatsAppUrl } from '../messages/compose'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage, useLoad } from '../hooks'
import { Info, Loading } from '../ui'

const date = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' })

function matches(client: RegisteredClient, query: string) {
  const text = normalizeSearchText(`${client.fullName} ${client.phone} ${client.email ?? ''}`)
  return normalizeSearchText(query)
    .split(' ')
    .filter(Boolean)
    .every((word) => text.includes(word) || client.phone.replace(/\D/g, '').includes(word.replace(/\D/g, '') || '\u0000'))
}

const emptyClient: NewClientInput = { fullName: '', phone: '', email: '', city: '', street: '', houseNumber: '', apartment: '' }
const clientFields = ['fullName', 'phone', 'email', 'city', 'street', 'houseNumber', 'apartment'] as const

/** Registers a client who will not order on the site, so the owner can order for them. */
function NewClientForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const [input, setInput] = useState(emptyClient)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      await clientsApi.create(input)
      setInput(emptyClient)
      onCreated()
    } catch (err) {
      setError(formError(err))
      setFieldErrors(fieldErrorsOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="form">
      <h2>{t('admin.clients.add.title')}</h2>
      <p className="muted">{t('admin.clients.add.intro')}</p>
      {clientFields.map((field) => (
        <label key={field} className="field">
          <span>{t(`admin.clients.add.${field}`)}</span>
          <input
            type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
            dir={field === 'email' || field === 'phone' ? 'ltr' : undefined}
            value={input[field]}
            onChange={(event) => setInput({ ...input, [field]: event.target.value })}
          />
          {fieldErrors[field.toLowerCase()]?.[0] && (
            <span role="alert" className="field__error">
              {t(`errors.${fieldErrors[field.toLowerCase()][0]}`, { defaultValue: t('errors.generic') })}
            </span>
          )}
        </label>
      ))}
      {error && <p role="alert" className="field__error">{error}</p>}
      <button type="submit" disabled={busy}>{t('admin.clients.add.submit')}</button>
    </form>
  )
}

/** The clients who registered on this site, with a button that opens a WhatsApp chat with each. */
export function ClientsPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const navigate = useNavigate()
  const { data, failed, reload } = useLoad(() => listClients())
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function orderFor(client: RegisteredClient) {
    setError(null)
    try {
      await clientsApi.openOrderSession(client.id)
      navigate('/')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const shown = data?.clients.filter((c) => matches(c, query)) ?? []

  return (
    <>
      <div className="with-info">
        <h1>{t('admin.clients.title')}</h1>
        <Info text={t('admin.clients.intro')} about={t('admin.clients.title')} />
      </div>
      <details>
        <summary>{t('admin.clients.add.title')}</summary>
        <NewClientForm onCreated={reload} />
      </details>
      {error && <p role="alert" className="field__error">{error}</p>}
      {!data ? (
        <Loading failed={failed} />
      ) : data.total === 0 ? (
        <p>{t('admin.clients.empty')}</p>
      ) : (
        <>
          <p role="status">{t('admin.clients.count', { count: data.total })}</p>
          {data.clients.length < data.total && (
            <p className="muted">{t('admin.clients.truncated', { shown: data.clients.length, total: data.total })}</p>
          )}
          <label className="field">
            <span>{t('admin.clients.search')}</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {shown.length === 0 ? (
            <p>{t('admin.clients.noMatch')}</p>
          ) : (
            <ul className="list">
              {shown.map((client) => {
                const link = whatsAppUrl(client.phone, t('admin.clients.whatsappGreeting', { name: firstName(client.fullName) }))
                return (
                  <li key={client.id} className="list__row">
                    <span className="list__main">
                      <strong>{client.fullName}</strong>
                      <br />
                      <bdi dir="ltr">{client.phone}</bdi>
                      {client.email && (
                        <>
                          {' · '}
                          <bdi dir="ltr">{client.email}</bdi>
                        </>
                      )}
                      <br />
                      <span className="muted">
                        {[
                          client.createdAt ? t('admin.clients.registered', { date: date.format(new Date(client.createdAt)) }) : null,
                          t('admin.clients.orders', { count: client.orders }),
                          client.withGoogle ? t('admin.clients.google') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <button type="button" onClick={() => void orderFor(client)} aria-label={`${t('admin.clients.orderFor')} ${client.fullName}`}>
                      {t('admin.clients.orderFor')}
                    </button>
                    {link && (
                      <a
                        className="button-link"
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('admin.clients.whatsapp', { name: client.fullName })}
                      >
                        WhatsApp
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </>
  )
}
