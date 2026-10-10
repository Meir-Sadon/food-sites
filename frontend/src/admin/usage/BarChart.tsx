import { useId } from 'react'

export interface Bar {
  /** Shown under the bar when `showLabel` says so, and in its tooltip. */
  label: string
  value: number
}

const BAR_GAP = 2
const HEIGHT = 120

/**
 * One series as vertical bars, scaled to the largest value. Each bar shows its label and value on hover
 * (and to screen readers through the hidden table), so no number needs printing on every bar.
 */
export function BarChart({
  title,
  bars,
  format = String,
  labelEvery = 1,
}: {
  title: string
  bars: Bar[]
  format?: (value: number) => string
  /** Print every n-th label under the bars (all of them are in the tooltips). */
  labelEvery?: number
}) {
  const id = useId()
  const max = Math.max(1, ...bars.map((b) => b.value))
  const width = 100 / Math.max(1, bars.length)
  return (
    <figure className="bar-chart" aria-labelledby={id}>
      <figcaption id={id}>{title}</figcaption>
      <div className="bar-chart__plot" aria-hidden="true">
        {bars.map((bar, i) => (
          <span
            key={i}
            className="bar-chart__slot"
            style={{ inlineSize: `${width}%`, paddingInline: `${BAR_GAP / 2}px` }}
            title={`${bar.label}: ${format(bar.value)}`}
          >
            <span
              className="bar-chart__bar"
              style={{ blockSize: `${(bar.value / max) * HEIGHT}px` }}
              data-empty={bar.value === 0 || undefined}
            />
          </span>
        ))}
      </div>
      <div className="bar-chart__labels" aria-hidden="true">
        {bars.map((bar, i) => (
          <span key={i} style={{ inlineSize: `${width}%` }}>
            {i % labelEvery === 0 ? bar.label : ''}
          </span>
        ))}
      </div>
      <table className="visually-hidden">
        <tbody>
          {bars.map((bar, i) => (
            <tr key={i}>
              <th scope="row">{bar.label}</th>
              <td>{format(bar.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** Steps of a funnel (or parts of a whole) as horizontal bars against the first step. */
export function StepBars({ steps }: { steps: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value))
  return (
    <ol className="step-bars">
      {steps.map((step) => (
        <li key={step.label}>
          <span className="step-bars__label">
            {step.label}
            <strong className="numeric">{step.value.toLocaleString('he-IL')}</strong>
          </span>
          <span className="step-bars__track" aria-hidden="true">
            <span className="step-bars__bar" style={{ inlineSize: `${(step.value / max) * 100}%` }} />
          </span>
          {step.note && <span className="hint">{step.note}</span>}
        </li>
      ))}
    </ol>
  )
}
