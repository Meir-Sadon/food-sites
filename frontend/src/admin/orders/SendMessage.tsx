import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { AdminOrder } from '../../api/operations'
import { reviewsAdminApi, templatesApi, type MessageTemplate, type ReviewLink } from '../../api/reviews'
import { useFeature } from '../../site/useSite'
import { useErrorMessage } from '../hooks'
import { Loading, Status } from '../ui'
import { composeMessage, reviewUrl, whatsAppUrl } from '../messages/compose'

/** A delivered order starts with the review request; any other with the first template that has no review link. */
function suggested(templates: MessageTemplate[], order: AdminOrder) {
  const wantsLink = order.status === 'Delivered'
  return templates.find((t) => t.includeReviewLink === wantsLink) ?? templates[0]
}

/**
 * Prepares a WhatsApp message to the client from one of the admin's templates: the admin checks (and may edit)
 * the text, then opens WhatsApp with it typed in and sends it there.
 */
export function SendMessage({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const reviewsOn = useFeature('reviews')
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [link, setLink] = useState<ReviewLink | null>(null)
  // What the admin typed over each template's message, by template id.
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    templatesApi
      .list()
      .then((list) => {
        if (!active) return
        setTemplates(list)
        setTemplateId(suggested(list, order)?.id ?? null)
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
    // Loaded once when the admin opens the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const template = templates?.find((t) => t.id === templateId) ?? null
  const needsLink = !!template?.includeReviewLink && reviewsOn

  // The review link is made the first time a template that has it is picked.
  useEffect(() => {
    if (!needsLink || link) return
    let active = true
    reviewsAdminApi
      .linkFor(order.id)
      .then((result) => active && setLink(result))
      .catch((err) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
    // errorMessage is rebuilt every render; the link only depends on the order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLink, link, order.id])

  const waitingForLink = needsLink && !link && !error
  const text = !template
    ? ''
    : (edits[template.id] ?? composeMessage(template, order, needsLink && link ? reviewUrl(link.token) : null))

  const url = text.trim() ? whatsAppUrl(order.phone, text) : null
  const id = `message-${order.id}`

  return (
    <section className="send-message no-print" aria-label={t('admin.messages.sendTitle', { id: order.id })}>
      {!templates ? (
        <Loading failed={failed} />
      ) : templates.length === 0 ? (
        <p>
          {t('admin.messages.noTemplates')} <Link to="/admin/messages">{t('admin.messages.manage')}</Link>
        </p>
      ) : (
        <>
          <span className="field">
            <label htmlFor={`${id}-template`}>{t('admin.messages.template')}</label>
            <select
              id={`${id}-template`}
              value={templateId ?? ''}
              onChange={(e) => {
                setError(null)
                setTemplateId(Number(e.target.value))
              }}
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </span>
          {link?.submitted && needsLink && <p className="hint">{t('admin.messages.alreadyReviewed')}</p>}
          {waitingForLink ? (
            <p role="status">{t('admin.messages.preparingLink')}</p>
          ) : (
            <span className="field">
              <label htmlFor={`${id}-text`}>{t('admin.messages.preview')}</label>
              <textarea id={`${id}-text`} rows={6} value={text} onChange={(e) => template && setEdits({ ...edits, [template.id]: e.target.value })} />
            </span>
          )}
          {error && <Status message={error} error />}
          {!url && !waitingForLink && text.trim() !== '' && <p className="form-error">{t('admin.messages.badPhone')}</p>}
        </>
      )}
      <div className="row">
        {url && !waitingForLink && (
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
