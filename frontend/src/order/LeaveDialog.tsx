import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'

interface Props {
  onSave: () => void
  onDiscard: () => void
  onStay: () => void
}

/** Asked when leaving the page with an order in progress. */
export function LeaveDialog({ onSave, onDiscard, onStay }: Props) {
  const { t } = useTranslation()
  return (
    <Modal title={t('order.leave.title')} onClose={onStay} wide>
      <p>{t('order.leave.text')}</p>
      <div className="row modal__actions modal__actions--inline">
        <button type="button" onClick={onSave}>
          {t('order.leave.save')}
        </button>
        <button type="button" className="button-quiet" onClick={onDiscard}>
          {t('order.leave.discard')}
        </button>
        <button type="button" className="button-quiet" onClick={onStay}>
          {t('order.leave.stay')}
        </button>
      </div>
    </Modal>
  )
}
