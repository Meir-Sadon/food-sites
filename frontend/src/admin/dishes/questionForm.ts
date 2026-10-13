import type { DishInput, DishQuestion } from '../../api/catalog'
import type { QuestionKind } from '../../api/site'
import { formKey } from './addOnForm'

export interface QuestionForm {
  key: number
  id: number | null
  text: string
  kind: QuestionKind
  /** The choices, one per line. */
  choices: string
  showAsDropdown: boolean
  isRequired: boolean
  /** '' for none, else one of the choices, or 'yes' / 'no'. */
  defaultAnswer: string
}

export const hasChoices = (kind: QuestionKind) => kind === 'SingleChoice' || kind === 'MultiChoice'

/** A dish's questions in the form; a copy of a dish gets them as new questions. */
export const questionsForm = (questions: DishQuestion[], copy = false): QuestionForm[] =>
  questions.map((q) => ({
    key: formKey(),
    id: copy ? null : q.id,
    text: q.text,
    kind: q.kind,
    choices: q.choices.join('\n'),
    showAsDropdown: q.showAsDropdown,
    isRequired: q.isRequired,
    defaultAnswer: q.defaultAnswer ?? '',
  }))

/** The choices of a question, as the client sees them, by the value its answer carries. */
export function answerChoices(kind: QuestionKind, choices: string, yes: string, no: string): { value: string; label: string }[] {
  if (kind === 'YesNo')
    return [
      { value: 'yes', label: yes },
      { value: 'no', label: no },
    ]
  if (!hasChoices(kind)) return []
  return choiceList(choices).map((c) => ({ value: c, label: c }))
}

const choiceList = (choices: string) => [...new Set(choices.split('\n').map((c) => c.trim()).filter((c) => c !== ''))]

/** The default answer to send: only one the question can still take (its choices may have changed since). */
function defaultInput(q: QuestionForm): string | null {
  if (q.defaultAnswer === '') return null
  if (q.kind === 'YesNo') return q.defaultAnswer === 'yes' || q.defaultAnswer === 'no' ? q.defaultAnswer : null
  return hasChoices(q.kind) && choiceList(q.choices).includes(q.defaultAnswer) ? q.defaultAnswer : null
}

export const questionsInput = (questions: QuestionForm[]): NonNullable<DishInput['questions']> =>
  questions.map((q) => ({
    id: q.id,
    text: q.text,
    kind: q.kind,
    choices: hasChoices(q.kind) ? q.choices.split('\n').map((c) => c.trim()).filter((c) => c !== '') : [],
    showAsDropdown: q.kind === 'SingleChoice' && q.showAsDropdown,
    isRequired: q.isRequired,
    defaultAnswer: defaultInput(q),
  }))
