import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listClients, type RegisteredClient } from '../../api/admin'
import { normalizeSearchText } from '../../order/search'
import { firstName, whatsAppUrl } from '../messages/compose'
import { useLoad } from '../hooks'
import { Info, Loading } from '../ui'

const date = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' })

function matches(client: RegisteredClient, query: string) {
  const text = normalizeSearchText(`${client.fullName} ${client.phone} ${client.email ?? ''}`)
  return normalizeSearchText(query)
    .split(' ')
    .filter(Boolean)
    .every((word) => text.includes(word) || client.phone.replace(/\D/g, '').includes(word.replace(/\D/g, '') || '\u0000'))
}

/** The clients who registered on this site, with a button that opens a WhatsApp chat with each. */
export function ClientsPage() {
  const { t } = useTranslation()
  const { data, failed } = useLoad(() => listClients())
  const [query, setQuery] = useState('')

  const shown = data?.clients.filter((c) => matches(c, query)) ?? []

  return (
    <>
      <div className="with-info">
        <h1>{t('admin.clients.title')}</h1>
        <Info text={t('admin.clients.intro')} about={t('admin.clients.title')} />
      </div>
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
