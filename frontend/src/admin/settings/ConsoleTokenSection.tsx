import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { opsTokenApi } from '../../api/admin'
import { useToast } from '../../components/toast'
import { useErrorMessage, useLoad } from '../hooks'
import { ConfirmRemove, Loading, Section, Status } from '../ui'

const time = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' })

/**
 * The master's key for the platform's console (the ops API). The site keeps only its hash, so the token is shown
 * once, right after it is made; making a new one turns the previous one off.
 */
export function ConsoleTokenSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const errorMessage = useErrorMessage()
  const { data, setData, failed } = useLoad(opsTokenApi.get)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const created = await opsTokenApi.create()
      setData({ createdAt: created.createdAt })
      setToken(created.token)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    setError(null)
    try {
      await opsTokenApi.revoke()
      setData({ createdAt: null })
      setToken(null)
      toast(t('admin.settings.console.revoked'))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast(t('admin.settings.console.copied'))
    } catch {
      window.prompt(t('admin.settings.console.copy'), value)
    }
  }

  return (
    <Section title={t('admin.settings.console.title')} hint={t('admin.settings.console.hint')}>
      {!data ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          <p>
            {data.createdAt
              ? t('admin.settings.console.active', { time: time.format(new Date(data.createdAt)) })
              : t('admin.settings.console.none')}
          </p>
          {token && (
            <div className="stack">
              <span className="field">
                <label htmlFor="console-token">{t('admin.settings.console.token')}</label>
                <input id="console-token" type="text" dir="ltr" readOnly value={token} onFocus={(e) => e.target.select()} />
              </span>
              <p className="notice notice--warning">{t('admin.settings.console.showOnce')}</p>
              <span className="row">
                <button type="button" className="button-quiet" onClick={() => void copy(token)}>
                  {t('admin.settings.console.copy')}
                </button>
              </span>
            </div>
          )}
          <span className="row">
            {data.createdAt ? (
              <>
                <ConfirmRemove
                  name={t('admin.settings.console.title')}
                  label={t('admin.settings.console.replace')}
                  question={t('admin.settings.console.confirmReplace')}
                  confirmLabel={t('admin.settings.console.yesReplace')}
                  onConfirm={create}
                />
                <ConfirmRemove
                  name={t('admin.settings.console.title')}
                  label={t('admin.settings.console.revoke')}
                  question={t('admin.settings.console.confirmRevoke')}
                  confirmLabel={t('admin.settings.console.yesRevoke')}
                  onConfirm={revoke}
                />
              </>
            ) : (
              <button type="button" disabled={busy} onClick={() => void create()}>
                {t('admin.settings.console.create')}
              </button>
            )}
          </span>
          {error && <Status message={error} error />}
        </div>
      )}
    </Section>
  )
}
