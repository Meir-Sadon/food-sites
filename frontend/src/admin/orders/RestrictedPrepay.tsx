import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { restrictedApi } from '../../api/admin'
import { settingsApi } from '../../api/catalog'
import type { AdminOrder } from '../../api/operations'
import { composeRestrictedMessage, whatsAppUrl } from '../messages/compose'
import { Loading } from '../ui'

/**
 * A WhatsApp message to a restricted client asking to pay the order in advance to the site's Bit / PayBox number.
 * The admin checks (and may edit) the text and sends it by hand; nothing is sent automatically.
 */
export function RestrictedPrepay({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [edited, setEdited] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([restrictedApi.get(), settingsApi.get()])
      .then(([restricted, settings]) => {
        if (active) setText(composeRestrictedMessage(restricted.message ?? t('admin.restricted.defaultMessage'), order, settings.paymentPhone))
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
    // Loaded once when the admin opens the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = edited ?? text ?? ''
  const url = text === null || !shown.trim() ? null : whatsAppUrl(order.phone, shown)
  const id = `prepay-${order.id}`

  return (
    <section className="send-message no-print" aria-label={t('admin.restricted.prepayTitle', { id: order.id })}>
      {text === null ? (
        <Loading failed={failed} />
      ) : (
        <span className="field">
          <label htmlFor={id}>{t('admin.messages.preview')}</label>
          <textarea id={id} rows={6} value={shown} onChange={(e) => setEdited(e.target.value)} />
        </span>
      )}
      <div className="row">
        {url && (
          <a className="button-link whatsapp-link" href={url} target="_blank" rel="noopener noreferrer">
            {t('admin.messages.openWhatsApp')}
          </a>
        )}
        <button type="button" className="button-quiet" onClick={onClose}>
          {t('admin.messages.close')}
        </button>
      </div>
    </section>
  )
}
