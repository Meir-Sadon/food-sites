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
  }))

export const questionsInput = (questions: QuestionForm[]): NonNullable<DishInput['questions']> =>
  questions.map((q) => ({
    id: q.id,
    text: q.text,
    kind: q.kind,
    choices: hasChoices(q.kind) ? q.choices.split('\n').map((c) => c.trim()).filter((c) => c !== '') : [],
    showAsDropdown: q.kind === 'SingleChoice' && q.showAsDropdown,
    isRequired: q.isRequired,
  }))
