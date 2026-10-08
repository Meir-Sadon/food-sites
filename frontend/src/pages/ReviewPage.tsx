import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../api/catalog'
import { ApiError, type FieldErrors } from '../api/client'
import {
  MAX_REVIEW_IMAGES,
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_NAME_MAX_LENGTH,
  reviewsApi,
  type ReviewForm,
} from '../api/reviews'
import { FieldError, Loading, Status } from '../admin/ui'
import { fieldErrorsOf, useErrorMessage, useFormErrorMessage } from '../admin/hooks'
import { siteLogo } from '../site/config'

type State = { kind: 'loading' } | { kind: 'failed' } | { kind: 'notFound' } | { kind: 'ready'; form: ReviewForm }

/** The page behind the review link the admin sends after an order: stars, a few words and up to two pictures, sent once. */
export function ReviewPage() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    reviewsApi
      .form(token)
      .then((form) => active && setState({ kind: 'ready', form }))
      .catch((err) => active && setState({ kind: err instanceof ApiError && err.status === 404 ? 'notFound' : 'failed' }))
    return () => {
      active = false
    }
  }, [token])

  return (
    <section className="review-page stack">
      <header className="review-page__header">
        {siteLogo && <img className="review-page__logo" src={siteLogo} alt="" />}
        <h1>{t('reviews.page.title')}</h1>
      </header>
      {state.kind === 'loading' || state.kind === 'failed' ? (
        <Loading failed={state.kind === 'failed'} />
      ) : state.kind === 'notFound' ? (
        <p>{t('reviews.page.notFound')}</p>
      ) : state.form.submitted ? (
        <p role="status" className="review-page__thanks">
          {t('reviews.page.thanks')}
        </p>
      ) : (
        <ReviewFormView token={token} form={state.form} onChange={(form) => setState({ kind: 'ready', form })} />
      )}
    </section>
  )
}

function ReviewFormView({ token, form, onChange }: { token: string; form: ReviewForm; onChange: (form: ReviewForm) => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const formError = useFormErrorMessage()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [name, setName] = useState(form.name ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t('errors.imageTooLarge'))
      return
    }
    setUploading(true)
    try {
      onChange(await reviewsApi.addImage(token, file))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function removeImage(id: number) {
    setError(null)
    try {
      onChange(await reviewsApi.removeImage(token, id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setError(null)
    if (rating === 0) {
      setErrors({ rating: ['ratingRequired'] })
      return
    }
    setSending(true)
    try {
      await reviewsApi.submit(token, { rating, comment: comment.trim(), name: name.trim() })
      onChange({ ...form, submitted: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'reviewAlreadySent') onChange({ ...form, submitted: true })
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="review-form stack" onSubmit={handleSubmit} noValidate>
      <p className="hint">{t('reviews.page.hint')}</p>
      <fieldset className="star-picker" aria-describedby="review-rating-error">
        <legend>{t('reviews.page.rating')}</legend>
        <div className="star-picker__stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={`star-picker__star${n <= rating ? ' star-picker__star--on' : ''}`}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
              <span aria-hidden="true">★</span>
              <span className="visually-hidden">{t('reviews.stars', { rating: n })}</span>
            </label>
          ))}
        </div>
        {rating > 0 && <p className="star-picker__label">{t(`reviews.page.ratingLabels.${rating}`)}</p>}
        <FieldError errors={errors} field="rating" id="review-rating-error" />
      </fieldset>

      <span className="field">
        <label htmlFor="review-comment">{t('reviews.page.comment')}</label>
        <textarea
          id="review-comment"
          rows={4}
          maxLength={REVIEW_COMMENT_MAX_LENGTH}
          value={comment}
          aria-describedby="review-comment-error"
          onChange={(e) => setComment(e.target.value)}
        />
        <FieldError errors={errors} field="comment" id="review-comment-error" />
      </span>

      <div className="stack">
        <span className="review-form__label">{t('reviews.page.images', { count: MAX_REVIEW_IMAGES })}</span>
        {form.images.length > 0 && (
          <ul className="review-form__images">
            {form.images.map((image, index) => (
              <li key={image.id}>
                <img src={image.url} alt={t('reviews.page.imageN', { n: index + 1 })} />
                <button type="button" className="button-icon" onClick={() => void removeImage(image.id)}>
                  <span aria-hidden="true">✕</span>
                  <span className="visually-hidden">{t('reviews.page.removeImage', { n: index + 1 })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {form.images.length < MAX_REVIEW_IMAGES && (
          <label className="button-file review-form__add">
            {uploading ? t('reviews.page.uploading') : t('reviews.page.addImage')}
            <input type="file" accept={IMAGE_TYPES} onChange={handleFile} disabled={uploading} />
          </label>
        )}
      </div>

      <span className="field">
        <label htmlFor="review-name">{t('reviews.page.name')}</label>
        <input
          id="review-name"
          value={name}
          maxLength={REVIEW_NAME_MAX_LENGTH}
          aria-describedby="review-name-hint review-name-error"
          onChange={(e) => setName(e.target.value)}
        />
        <span id="review-name-hint" className="hint">
          {t('reviews.page.nameHint')}
        </span>
        <FieldError errors={errors} field="name" id="review-name-error" />
      </span>

      {error && <Status message={error} error />}
      <div>
        <button type="submit" disabled={sending || uploading}>
          {sending ? t('reviews.page.sending') : t('reviews.page.send')}
        </button>
      </div>
    </form>
  )
}
