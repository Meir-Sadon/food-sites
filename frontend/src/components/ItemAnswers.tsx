import type { ItemAnswer } from '../api/operations'

/** The client's answers to an ordered dish's questions, one per line under the dish. */
export function ItemAnswers({ answers }: { answers?: ItemAnswer[] | null }) {
  if (!answers?.length) return null
  return (
    <ul className="item-answers">
      {answers.map((a, i) => (
        <li key={i}>
          <span className="muted">{a.question}:</span> {a.answer}
        </li>
      ))}
    </ul>
  )
}
