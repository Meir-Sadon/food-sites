import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import { orderStatuses, type OrderStatus } from '../../api/operations'
import {
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_TEXT_MAX_LENGTH,
  templatesApi,
  type MessageTemplate,
  type MessageTemplateInput,
} from '../../api/reviews'
import { useFeature } from '../../site/useSite'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage, useLoad } from '../hooks'
import { ConfirmRemove, FieldError, Loading, Section, Status } from '../ui'
import { PLACEHOLDERS } from './compose'

const empty: MessageTemplateInput = { name: '', text: '', includeReviewLink: false, forStatus: null }

/** The WhatsApp message templates the admin sends clients from the Orders tab. */
export function MessagesPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data: templates, setData, failed } = useLoad(templatesApi.list)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRemove(id: number) {
    setError(null)
    try {
      await templatesApi.remove(id)
      setData((list) => list && list.filter((tpl) => tpl.id !== id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <h1>{t('admin.messages.title')}</h1>
      <p className="hint">{t('admin.messages.intro')}</p>
      {!templates ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          {templates.length === 0 && <p>{t('admin.messages.empty')}</p>}
          {templates.map((template) => (
            <Section key={template.id} title={template.name}>
              <TemplateForm
                idPrefix={`template-${template.id}`}
                initial={template}
                onSave={async (input) => {
                  const saved = await templatesApi.update(template.id, input)
                  setData((list) => list && list.map((tpl) => (tpl.id === saved.id ? saved : tpl)))
                }}
              >
                <ConfirmRemove name={template.name} onConfirm={() => handleRemove(template.id)} />
              </TemplateForm>
            </Section>
          ))}
          {error && <Status message={error} error />}
          {adding ? (
            <Section title={t('admin.messages.newTemplate')}>
              <TemplateForm
                idPrefix="template-new"
                initial={empty}
                onSave={async (input) => {
                  const created = await templatesApi.create(input)
                  setData((list) => [...(list ?? []), created])
                  setAdding(false)
                }}
              >
                <button type="button" className="button-quiet" onClick={() => setAdding(false)}>
                  {t('admin.cancel')}
                </button>
              </TemplateForm>
            </Section>
          ) : (
            <div>
              <button type="button" onClick={() => setAdding(true)}>
                {t('admin.messages.add')}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function TemplateForm({
  idPrefix,
  initial,
  onSave,
  children,
}: {
  idPrefix: string
  initial: MessageTemplateInput | MessageTemplate
  onSave: (input: MessageTemplateInput) => Promise<void>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const reviewsOn = useFeature('reviews')
  const [input, setInput] = useState<MessageTemplateInput>({
    name: initial.name,
    text: initial.text,
    includeReviewLink: initial.includeReviewLink,
    forStatus: initial.forStatus,
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setStatus(null)
    setBusy(true)
    try {
      await onSave(input)
      setStatus({ message: t('admin.saved') })
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setStatus({ message: formError(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <span className="field">
        <label htmlFor={`${idPrefix}-name`}>{t('admin.messages.name')}</label>
        <input
          id={`${idPrefix}-name`}
          value={input.name}
          maxLength={TEMPLATE_NAME_MAX_LENGTH}
          aria-describedby={`${idPrefix}-name-error`}
          onChange={(e) => setInput({ ...input, name: e.target.value })}
        />
        <FieldError errors={errors} field="name" id={`${idPrefix}-name-error`} />
      </span>
      <span className="field">
        <label htmlFor={`${idPrefix}-type`}>{t('admin.messages.type')}</label>
        <select
          id={`${idPrefix}-type`}
          value={input.forStatus ?? ''}
          aria-describedby={`${idPrefix}-type-hint`}
          onChange={(e) => setInput({ ...input, forStatus: (e.target.value || null) as OrderStatus | null })}
        >
          <option value="">{t('admin.messages.general')}</option>
          {orderStatuses.map((status) => (
            <option key={status} value={status}>
              {t('admin.messages.forStatus', { status: t(`admin.orders.statuses.${status}`) })}
            </option>
          ))}
        </select>
        <span id={`${idPrefix}-type-hint`} className="hint">
          {t('admin.messages.typeHint')}
        </span>
      </span>
      <span className="field">
        <label htmlFor={`${idPrefix}-text`}>{t('admin.messages.text')}</label>
        <textarea
          id={`${idPrefix}-text`}
          rows={4}
          value={input.text}
          maxLength={TEMPLATE_TEXT_MAX_LENGTH}
          aria-describedby={`${idPrefix}-text-hint ${idPrefix}-text-error`}
          onChange={(e) => setInput({ ...input, text: e.target.value })}
        />
        <span id={`${idPrefix}-text-hint`} className="hint">
          {t('admin.messages.textHint', { placeholders: PLACEHOLDERS.join(' ') })}
        </span>
        <FieldError errors={errors} field="text" id={`${idPrefix}-text-error`} />
      </span>
      {reviewsOn && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={input.includeReviewLink}
            onChange={(e) => setInput({ ...input, includeReviewLink: e.target.checked })}
          />
          {t('admin.messages.includeReviewLink')}
        </label>
      )}
      <div className="row">
        <button type="submit" disabled={busy}>
          {busy ? t('admin.saving') : t('admin.save')}
        </button>
        {children}
      </div>
      {status && <Status message={status.message} error={status.error} />}
    </form>
  )
}
