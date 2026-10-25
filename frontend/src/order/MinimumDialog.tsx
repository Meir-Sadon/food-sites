import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import { formatMoney } from './format'

interface Props {
  minimum: number
  missing: number
  onAddDish: () => void
  onSend: () => void
  onCancel: () => void
}

/** Asked when "send the order" is pressed under the site's minimum: add a dish, or send it and pay the minimum. */
export function MinimumDialog({ minimum, missing, onAddDish, onSend, onCancel }: Props) {
  const { t } = useTranslation()
  return (
    <Modal title={t('order.minimumAsk.title')} onClose={onCancel} wide>
      <p>{t('order.minimumAsk.text', { missing: formatMoney(missing) })}</p>
      <p className="hint">{t('order.minimumAsk.charge', { minimum: formatMoney(minimum) })}</p>
      <div className="row modal__actions modal__actions--inline">
        <button type="button" onClick={onAddDish}>
          {t('order.minimumAsk.add')}
        </button>
        <button type="button" className="button-quiet" onClick={onSend}>
          {t('order.minimumAsk.send', { minimum: formatMoney(minimum) })}
        </button>
        <button type="button" className="button-quiet" onClick={onCancel}>
          {t('order.minimumAsk.cancel')}
        </button>
      </div>
    </Modal>
  )
}
