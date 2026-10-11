import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import { QUESTION_KINDS, type QuestionKind } from '../../api/site'
import { FieldError, MoveButtons } from '../ui'
import { moved } from '../sortable'
import { formKey } from './addOnForm'
import { hasChoices, type QuestionForm } from './questionForm'

interface Props {
  questions: QuestionForm[]
  /** The main dish's questions, asked before this dish's own (for a variant). */
  inherited: string[]
  errors: FieldErrors
  onChange: (questions: QuestionForm[]) => void
}

/** The questions the client answers when ordering the dish: free text, a number, a date, yes/no, or one or several choices. */
export function QuestionsSection({ questions, inherited, errors, onChange }: Props) {
  const { t } = useTranslation()
  const fieldError = (field: string) => <FieldError errors={errors} field={field} id={`dish-${field}-error`} />
  const described = (field: string) => ({ 'aria-describedby': `dish-${field}-error` })
  const set = (key: number, patch: Partial<QuestionForm>) => onChange(questions.map((q) => (q.key === key ? { ...q, ...patch } : q)))
  const keys = questions.map((q) => q.key)

  return (
    <fieldset className="stack" aria-describedby="dish-questions-hint dish-questions-error">
      <legend>{t('admin.dishes.questions')}</legend>
      <p id="dish-questions-hint" className="hint">
        {t('admin.dishes.questionsHint')}
      </p>
      {inherited.length > 0 && <p className="hint">{t('admin.dishes.inheritedQuestions', { names: inherited.join(', ') })}</p>}
      {questions.length === 0 && <p>{t('admin.dishes.noQuestions')}</p>}

      {questions.map((question, index) => {
        const n = index + 1
        const field = (name: string) => `questions[${index}].${name}`
        const prefix = `question-${question.key}`
        return (
          <div key={question.key} className="question-row stack" role="group" aria-label={t('admin.dishes.questionN', { n })}>
            <div className="row row--end">
              <span className="field field--grow">
                <label htmlFor={`${prefix}-text`}>{t('admin.dishes.questionText')}</label>
                <input
                  id={`${prefix}-text`}
                  maxLength={100}
                  value={question.text}
                  onChange={(e) => set(question.key, { text: e.target.value })}
                  {...described(field('text'))}
                />
                {fieldError(field('text'))}
              </span>
              <span className="field">
                <label htmlFor={`${prefix}-kind`}>{t('admin.dishes.questionKind')}</label>
                <select
                  id={`${prefix}-kind`}
                  value={question.kind}
                  onChange={(e) => set(question.key, { kind: e.target.value as QuestionKind })}
                >
                  {QUESTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`admin.dishes.questionKinds.${kind}`)}
                    </option>
                  ))}
                </select>
              </span>
            </div>

            {hasChoices(question.kind) && (
              <span className="field">
                <label htmlFor={`${prefix}-choices`}>{t('admin.dishes.questionChoices')}</label>
                <textarea
                  id={`${prefix}-choices`}
                  rows={3}
                  value={question.choices}
                  onChange={(e) => set(question.key, { choices: e.target.value })}
                  {...described(field('choices'))}
                />
                {fieldError(field('choices'))}
              </span>
            )}

            <div className="row">
              {question.kind === 'SingleChoice' && (
                <fieldset className="row">
                  <legend className="visually-hidden">{t('admin.dishes.questionShowAs')}</legend>
                  {[false, true].map((dropdown) => (
                    <label key={String(dropdown)} className="checkbox">
                      <input
                        type="radio"
                        name={`${prefix}-showAs`}
                        checked={question.showAsDropdown === dropdown}
                        onChange={() => set(question.key, { showAsDropdown: dropdown })}
                      />
                      {t(dropdown ? 'admin.dishes.questionDropdown' : 'admin.dishes.questionRadio')}
                    </label>
                  ))}
                </fieldset>
              )}
              <label className="checkbox">
                <input type="checkbox" checked={question.isRequired} onChange={(e) => set(question.key, { isRequired: e.target.checked })} />
                {t('admin.dishes.questionRequired')}
              </label>
              {questions.length > 1 && (
                <MoveButtons
                  name={question.text || t('admin.dishes.questionN', { n })}
                  first={index === 0}
                  last={index === questions.length - 1}
                  onMove={(direction) => {
                    const order = moved(keys, index, direction)
                    onChange(order.map((key) => questions.find((q) => q.key === key)!))
                  }}
                />
              )}
              <button
                type="button"
                className="button-quiet"
                aria-label={t('admin.dishes.removeQuestion', { n })}
                onClick={() => onChange(questions.filter((q) => q.key !== question.key))}
              >
                {t('admin.remove')}
              </button>
            </div>
            {fieldError(field('id'))}
          </div>
        )
      })}
      {fieldError('questions')}
      <button
        type="button"
        className="button-quiet"
        onClick={() =>
          onChange([...questions, { key: formKey(), id: null, text: '', kind: 'Text', choices: '', showAsDropdown: false, isRequired: false }])
        }
      >
        {t('admin.dishes.addQuestion')}
      </button>
    </fieldset>
  )
}
