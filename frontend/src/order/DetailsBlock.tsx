import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  title: string
  /** One line saying what the block holds, shown in place of its fields while it is closed. */
  summary: string
  open: boolean
  onToggle: (open: boolean) => void
  children: ReactNode
}

/** A part of the order form that folds away to a one-line summary once its details are known. */
export function DetailsBlock({ title, summary, open, onToggle, children }: Props) {
  const { t } = useTranslation()
  return (
    <details className="details-block" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary>
        <span className="details-block__title">{title}</span>
        {!open && (
          <>
            <span className="details-block__summary">{summary}</span>
            <span className="details-block__change">{t('order.blocks.change')}</span>
          </>
        )}
      </summary>
      <div className="details-block__body stack">{children}</div>
    </details>
  )
}
