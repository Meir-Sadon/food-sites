import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { claudeApi, type ClaudeApprovalInfo } from '../../api/admin'
import { useErrorMessage } from '../hooks'
import { browser } from './browser'
import { useAdminSession } from '../session'
import { Loading, Status } from '../ui'


/**
 * Where Claude sends the admin when they add the site as a connector (`/oauth/authorize` forwards here with the
 * OAuth request). The admin is already signed in to the admin, so approving here is the sign-in: the server makes a
 * one-time code and the browser goes back to Claude with it. Cancelling tells Claude the admin said no.
 */
export function ClaudeConnectPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const session = useAdminSession()
  const [params] = useSearchParams()
  const clientId = params.get('client_id') ?? ''
  const redirectUri = params.get('redirect_uri') ?? ''
  const state = params.get('state')
  const [info, setInfo] = useState<ClaudeApprovalInfo | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    claudeApi
      .approval(clientId, redirectUri)
      .then((answer) => active && setInfo(answer))
      .catch(() => active && setInvalid(true))
    return () => {
      active = false
    }
  }, [clientId, redirectUri])

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      const { redirectUrl } = await claudeApi.approve({
        clientId,
        redirectUri,
        codeChallenge: params.get('code_challenge'),
        codeChallengeMethod: params.get('code_challenge_method'),
        state,
        resource: params.get('resource'),
      })
      browser.go(redirectUrl)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  function cancel() {
    const back = new URL(redirectUri)
    back.searchParams.set('error', 'access_denied')
    if (state) back.searchParams.set('state', state)
    browser.go(back.toString())
  }

  return (
    <section className="admin-section claude-connect" aria-labelledby="claude-connect-title">
      <h2 id="claude-connect-title">{t('admin.claude.connect.title')}</h2>
      {invalid ? (
        <p className="notice notice--warning">{t('admin.claude.connect.invalid')}</p>
      ) : !info ? (
        <Loading />
      ) : (
        <div className="stack">
          <p>
            {t('admin.claude.connect.asks', {
              client: info.clientName,
              host: info.redirectHost,
              actor: t(`admin.actors.${session.actor}`),
            })}
          </p>
          <ul className="claude-connect__list">
            <li>{t('admin.claude.connect.canExplain')}</li>
            <li>{t('admin.claude.connect.canChange')}</li>
            <li>{t('admin.claude.connect.cannot')}</li>
          </ul>
          <p className="hint">{t('admin.claude.connect.usage')}</p>
          <span className="row">
            <button type="button" disabled={busy} onClick={() => void approve()}>
              {t('admin.claude.connect.approve')}
            </button>
            <button type="button" className="button-quiet" disabled={busy} onClick={cancel}>
              {t('admin.claude.connect.cancel')}
            </button>
          </span>
          {error && <Status message={error} error />}
        </div>
      )}
    </section>
  )
}
