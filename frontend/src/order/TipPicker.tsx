import { useId } from 'react'
import { useTranslation } from 'react-i18next'

/** The fixed tips (₪) the client can pick; the last choice is another amount, typed in. */
export const TIP_AMOUNTS = [5, 10, 15, 20] as const
export const TIP_OTHER = 'other'
/** The most a tip can be (the server refuses more). */
export const MAX_TIP = 1000

export type TipChoice = (typeof TIP_AMOUNTS)[number] | typeof TIP_OTHER | null
export interface TipState {
  choice: TipChoice
  /** What was typed for another amount. */
  custom: string
}

export const noTip: TipState = { choice: null, custom: '' }

/** The tip in ₪ the state stands for: 0 when none is picked or the typed amount is not a positive number. */
export function tipAmount(tip: TipState): number {
  if (tip.choice === null) return 0
  if (tip.choice !== TIP_OTHER) return tip.choice
  const typed = Number(tip.custom.replace(',', '.'))
  return Number.isFinite(typed) && typed > 0 ? Math.min(Math.round(typed * 100) / 100, MAX_TIP) : 0
}

/** A tip for the courier: five radio buttons on one row (5, 10, 15, 20 ₪ and another amount, which opens a number field). */
export function TipPicker({ tip, onChange }: { tip: TipState; onChange: (tip: TipState) => void }) {
  const { t } = useTranslation()
  const name = useId()
  const customId = useId()
  return (
    <fieldset className="tip-picker">
      <legend>{t('order.tip.title')}</legend>
      <div className="tip-picker__options">
        {TIP_AMOUNTS.map((amount) => (
          <label key={amount} className="tip-picker__option">
            <input
              type="radio"
              name={name}
              checked={tip.choice === amount}
              onChange={() => onChange({ ...tip, choice: amount })}
              // A second press on the picked amount takes the tip off again.
              onClick={() => tip.choice === amount && onChange(noTip)}
            />
            <span className="numeric">₪{amount}</span>
          </label>
        ))}
        <label className="tip-picker__option">
          <input
            type="radio"
            name={name}
            checked={tip.choice === TIP_OTHER}
            onChange={() => onChange({ ...tip, choice: TIP_OTHER })}
            onClick={() => tip.choice === TIP_OTHER && onChange(noTip)}
          />
          <span>{t('order.tip.other')}</span>
        </label>
      </div>
      {tip.choice === TIP_OTHER && (
        <span className="field tip-picker__custom">
          <label htmlFor={customId}>{t('order.tip.amount')}</label>
          <input
            id={customId}
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_TIP}
            step="any"
            value={tip.custom}
            onChange={(e) => onChange({ ...tip, custom: e.target.value })}
          />
        </span>
      )}
      <p className="hint">{t('order.tip.hint')}</p>
    </fieldset>
  )
}
