import { useTranslation } from 'react-i18next'
import { round2 } from './model'

const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 3 })

interface Props {
  /** Names the control for screen readers, e.g. the dish name. */
  name: string
  value: number
  min: number
  max: number
  step: number
  /** Add-ons can go down to zero (not ordered); the stepper then jumps between 0 and min. */
  allowZero?: boolean
  /** e.g. ק״ג for free-weight dishes; empty when the amount counts units or set options. */
  unit?: string
  onChange: (value: number) => void
}

/** A minus / amount / plus control that always stays within the dish's allowed amounts. */
export function AmountControl({ name, value, min, max, step, allowZero, unit, onChange }: Props) {
  const { t } = useTranslation()
  const floor = allowZero ? 0 : min
  const down = () => onChange(value - step < min ? floor : round2(value - step))
  const up = () => onChange(value < min ? min : Math.min(round2(value + step), max))

  return (
    <span className="amount" role="group" aria-label={name}>
      <button type="button" className="button-icon" aria-label={t('order.less', { name })} disabled={value <= floor} onClick={down}>
        −
      </button>
      <output className="amount__value numeric" aria-live="polite">
        {number.format(value)}
        {unit ? ` ${unit}` : ''}
      </output>
      <button type="button" className="button-icon" aria-label={t('order.more', { name })} disabled={value >= max} onClick={up}>
        +
      </button>
    </span>
  )
}
