import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { auditPageSize, listAudit, type AuditChange, type AuditEntry } from '../../api/admin'
import { useErrorMessage, useLoad } from '../hooks'
import { Loading, Status } from '../ui'

const time = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' })

/** Who changed what: every change the master or the owner made, newest first. Nobody can edit or remove it. */
export function AuditPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data, setData, failed } = useLoad(() => listAudit())
  const [more, setMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasMore = more && data !== null && data.length > 0 && data.length % auditPageSize === 0

  async function loadMore() {
    if (!data) return
    setLoadingMore(true)
    setError(null)
    try {
      const next = await listAudit(data[data.length - 1].id)
      setData([...data, ...next])
      if (next.length < auditPageSize) setMore(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <>
      <h1>{t('admin.audit.title')}</h1>
      <p className="hint">{t('admin.audit.intro')}</p>
      {!data ? (
        <Loading failed={failed} />
      ) : data.length === 0 ? (
        <p>{t('admin.audit.empty')}</p>
      ) : (
        <ol className="list audit-list">
          {data.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
      {hasMore && (
        <div className="row">
          <button type="button" className="button-quiet" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? t('admin.loading') : t('admin.audit.more')}
          </button>
        </div>
      )}
      {error && <Status message={error} error />}
    </>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation()
  const entity = entry.entityType
    ? t(`admin.audit.entities.${entry.entityType}`, { defaultValue: entry.entityType })
    : null

  return (
    <li className="audit-entry">
      <p className="audit-entry__summary">
        <span className={`badge audit-entry__actor audit-entry__actor--${entry.actor}`}>
          {t(`admin.actors.${entry.actor}`)}
        </span>{' '}
        <span>{t(`admin.audit.actions.${entry.action}`)}</span>
        {entity && (
          <>
            {' '}
            <span>{entity}</span>
          </>
        )}
        {entry.label && (
          <>
            {': '}
            <bdi className="audit-entry__label">{entry.label}</bdi>
          </>
        )}
      </p>
      <time className="muted numeric" dateTime={entry.at}>
        {time.format(new Date(entry.at))}
      </time>
      {entry.changes.length > 0 && (
        <ul className="audit-entry__changes">
          {entry.changes.map((change) => (
            <li key={change.field}>
              <ChangeLine change={change} added={entry.action === 'Added'} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function ChangeLine({ change, added }: { change: AuditChange; added: boolean }) {
  const { t } = useTranslation()
  const field = t(`admin.audit.fields.${change.field}`, { defaultValue: change.field })
  const value = (v: string | null) =>
    v === null || v === '' ? t('admin.audit.empty_value') : v === 'true' ? t('admin.audit.yes') : v === 'false' ? t('admin.audit.no') : v

  if (change.secret) return <>{t('admin.audit.secretChanged', { field })}</>
  if (added) return <>{field}: <bdi>{value(change.to)}</bdi></>
  return (
    <>
      {field}: {t('admin.audit.was')} <bdi>{value(change.from)}</bdi> · {t('admin.audit.now')} <bdi>{value(change.to)}</bdi>
    </>
  )
}
