import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { restrictedApi } from '../../api/admin'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsaved'
import { Loading, Section, Status } from '../ui'
import { RESTRICTED_PLACEHOLDERS } from './compose'

/**
 * The WhatsApp message asking a restricted client to pay in advance (sent by hand from the order). The phones marked as
 * restricted are managed in the settings (`RestrictedClientsSection`).
 */
export function RestrictedMessageSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data, setData, failed } = useLoad(restrictedApi.get)
  const [edited, setEdited] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  return (
    <Section title={t('admin.restricted.message')} hint={t('admin.restricted.messageHint')}>
      {!data ? (
        <Loading failed={failed} />
      ) : (
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
          {error && <Status message={error} error />}
        </form>
      )}
    </Section>
  )
}
