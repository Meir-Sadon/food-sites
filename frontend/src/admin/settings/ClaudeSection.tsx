import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { claudeApi } from '../../api/admin'
import { useToast } from '../../components/toast'
import { useErrorMessage, useLoad } from '../hooks'
import { ConfirmRemove, Loading, Section, Status } from '../ui'

const time = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' })

/**
 * The Claude connector (feature `mcp`): the address to add in Claude as a custom connector, how to add it, and the
 * Claude accounts connected now, each with a way to disconnect it.
 */
export function ClaudeSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const errorMessage = useErrorMessage()
  const { data, setData, failed } = useLoad(claudeApi.connections)
  const [error, setError] = useState<string | null>(null)
  const address = `${window.location.origin}/mcp`

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      toast(t('admin.claude.copied'))
    } catch {
      window.prompt(t('admin.claude.copy'), address)
    }
  }

  async function disconnect(id: number) {
    setError(null)
    try {
      await claudeApi.disconnect(id)
      setData((list) => (list ?? []).filter((c) => c.id !== id))
      toast(t('admin.claude.disconnected'))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Section title={t('admin.claude.title')} hint={t('admin.claude.hint')}>
      <div className="stack">
        <span className="field">
          <label htmlFor="claude-address">{t('admin.claude.address')}</label>
          <input id="claude-address" type="text" dir="ltr" readOnly value={address} onFocus={(e) => e.target.select()} />
        </span>
        <span className="row">
          <button type="button" className="button-quiet" onClick={() => void copy()}>
            {t('admin.claude.copy')}
          </button>
        </span>
        <ol className="claude-connect__list">
          <li>{t('admin.claude.steps.open')}</li>
          <li>{t('admin.claude.steps.add')}</li>
          <li>{t('admin.claude.steps.approve')}</li>
          <li>{t('admin.claude.steps.ask')}</li>
        </ol>
        <p className="hint">{t('admin.claude.plans')}</p>
        <h3>{t('admin.claude.connected')}</h3>
        {!data ? (
          <Loading failed={failed} />
        ) : data.length === 0 ? (
          <p>{t('admin.claude.none')}</p>
        ) : (
          <ul className="claude-connections">
            {data.map((connection) => (
              <li key={connection.id}>
                <span>
                  {t('admin.claude.connection', {
                    client: connection.clientName,
                    actor: t(`admin.actors.${connection.actor}`),
                    time: time.format(new Date(connection.createdAt)),
                  })}
                  {connection.lastUsedAt && (
                    <span className="muted">
                      {' '}
                      {t('admin.claude.lastUsed', { time: time.format(new Date(connection.lastUsedAt)) })}
                    </span>
                  )}
                </span>
                <ConfirmRemove
                  name={connection.clientName}
                  label={t('admin.claude.disconnect')}
                  question={t('admin.claude.confirmDisconnect')}
                  confirmLabel={t('admin.claude.yesDisconnect')}
                  onConfirm={() => disconnect(connection.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {error && <Status message={error} error />}
      </div>
    </Section>
  )
}
