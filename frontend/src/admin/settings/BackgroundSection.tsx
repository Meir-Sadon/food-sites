import { useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IMAGE_TYPES, MAX_IMAGE_BYTES, settingsApi } from '../../api/catalog'
import { Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'

export function BackgroundSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data: settings, setData, failed } = useLoad(settingsApi.get)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<Awaited<ReturnType<typeof settingsApi.get>>>) {
    setBusy(true)
    setError(null)
    try {
      setData(await action())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t('errors.imageTooLarge'))
      return
    }
    void run(() => settingsApi.uploadBackground(file))
  }

  return (
    <Section title={t('admin.settings.background')} hint={t('admin.settings.imageHint')}>
      {!settings ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          {settings.backgroundImageUrl ? (
            <img className="background-preview" src={settings.backgroundImageUrl} alt={t('admin.settings.background')} />
          ) : (
            <p>{t('admin.settings.noBackground')}</p>
          )}
          <div className="row">
            <label className="button-file">
              {t('admin.settings.chooseImage')}
              <input type="file" accept={IMAGE_TYPES} onChange={handleFile} disabled={busy} />
            </label>
            {settings.backgroundImageUrl && (
              <button type="button" className="button-quiet" disabled={busy} onClick={() => run(settingsApi.removeBackground)}>
                {t('admin.settings.removeBackground')}
              </button>
            )}
          </div>
          {busy && <p role="status">{t('admin.settings.uploading')}</p>}
          {error && <Status message={error} error />}
        </div>
      )}
    </Section>
  )
}
