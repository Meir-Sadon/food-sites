import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { telHref } from '../api/emergency'
import { useSite } from '../site/useSite'
import { Modal } from './Modal'

/** The window an emergency-mode visitor sees on entering: the message and a button that opens the phone's dialer. */
export function EmergencyView({ phone, message, onClose }: { phone: string; message: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal title={t('emergency.title')} onClose={onClose} closeButton className="emergency-dialog">
      <p className="emergency-dialog__body">{message ?? t('emergency.defaultMessage')}</p>
      <a className="button-link emergency-dialog__call" href={telHref(phone)}>
        {t('emergency.call', { phone })}
      </a>
      <button type="button" className="button-quiet emergency-dialog__dismiss" onClick={onClose}>
        {t('dialog.close')}
      </button>
    </Modal>
  )
}

/** Opens on every page load while the site is in emergency mode (the visitor can close it). */
export function EmergencyDialog() {
  const emergency = useSite()?.emergency
  const [closed, setClosed] = useState(false)
  if (!emergency || closed) return null
  return <EmergencyView phone={emergency.phone} message={emergency.message} onClose={() => setClosed(true)} />
}
