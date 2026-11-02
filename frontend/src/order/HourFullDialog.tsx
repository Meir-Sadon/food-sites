import { useTranslation } from 'react-i18next'
import type { Fulfillment } from '../api/site'
import { Modal } from '../components/Modal'

interface Props {
  /** The way of receiving the client chose, which has no room left in the hour. */
  fulfillment: Fulfillment
  hour: string
  /** The other way still has room in this hour (and the site and the hour offer it). */
  canSwitch: boolean
  onSwitch: () => void
  onOtherHour: () => void
  /** Keep the full hour: the order is sent and waits for the owner to call. Also what closing the dialog does. */
  onKeep: () => void
}

/** Shown when the hour the client picked is full for their way of receiving: switch the way, pick another hour, or send it anyway. */
export function HourFullDialog({ fulfillment, hour, canSwitch, onSwitch, onOtherHour, onKeep }: Props) {
  const { t } = useTranslation()
  return (
    <Modal title={t('order.hourFullDialog.title')} onClose={onKeep}>
      <p>{t(fulfillment === 'Delivery' ? 'order.hourFullDialog.textDelivery' : 'order.hourFullDialog.textPickup', { hour })}</p>
      <div className="modal__actions">
        {canSwitch && (
          <button type="button" onClick={onSwitch}>
            {t(fulfillment === 'Delivery' ? 'order.hourFullDialog.switchToPickup' : 'order.hourFullDialog.switchToDelivery')}
          </button>
        )}
        <button type="button" onClick={onOtherHour}>
          {t('order.hourFullDialog.otherHour')}
        </button>
        <button type="button" className="button-quiet" onClick={onKeep}>
          {t('order.hourFullDialog.sendAnyway')}
        </button>
      </div>
    </Modal>
  )
}
