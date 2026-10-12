import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

export interface StepItem {
  id: number
  name: string
  /** How many dishes of the step's category are in the order. */
  picked: number
}

interface Props {
  /** One step per category, then a last step for the order details (contact, payment). */
  categories: StepItem[]
  /** The shown step: a category's position, or `categories.length` for the details. */
  current: number
  onChange: (step: number) => void
}

const Chevron = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 6 6 6-6 6" />
  </svg>
)

/**
 * The step-by-step order flow's header: arrows to the previous and next step, and a chip per step to jump to it
 * (the last one goes straight to the contact and payment details). The next arrow points to the end of the line,
 * which is left in Hebrew (`index.css` flips the icons by direction).
 */
export const CategorySteps = forwardRef<HTMLElement, Props>(function CategorySteps({ categories, current, onChange }, ref) {
  const { t } = useTranslation()
  const detailsStep = categories.length
  const steps = [
    ...categories.map((c) => ({ key: c.id, name: c.name, picked: c.picked })),
    { key: 'details', name: t('order.steps.details'), picked: 0 },
  ]
  return (
    <nav ref={ref} className="order-steps" aria-label={t('order.steps.label')}>
      <button
        type="button"
        className="order-steps__arrow order-steps__arrow--previous"
        aria-label={t('order.steps.previous')}
        disabled={current <= 0}
        onClick={() => onChange(current - 1)}
      >
        <Chevron />
      </button>
      <ol className="order-steps__list">
        {steps.map((step, index) => (
          <li key={step.key}>
            <button
              type="button"
              className={`order-steps__step${index === detailsStep ? ' order-steps__step--details' : ''}`}
              aria-current={index === current ? 'step' : undefined}
              onClick={() => onChange(index)}
            >
              {step.name}
              {step.picked > 0 && (
                <span className="order-steps__count" aria-label={t('order.steps.picked', { count: step.picked })}>
                  {step.picked}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="order-steps__arrow order-steps__arrow--next"
        aria-label={t('order.steps.next')}
        disabled={current >= detailsStep}
        onClick={() => onChange(current + 1)}
      >
        <Chevron />
      </button>
    </nav>
  )
})

/** Under a category's dishes: back to the previous step, on to the next (the last category leads to the details). */
export function CategoryStepsFooter({ current, last, onChange }: { current: number; last: number; onChange: (step: number) => void }) {
  const { t } = useTranslation()
  return (
    <div className="order-steps__footer">
      {current > 0 && (
        <button type="button" className="button-quiet" onClick={() => onChange(current - 1)}>
          {t('order.steps.back')}
        </button>
      )}
      <button type="button" className="order-steps__forward" onClick={() => onChange(current + 1)}>
        {current >= last ? t('order.steps.toDetails') : t('order.steps.continue')}
      </button>
    </div>
  )
}
