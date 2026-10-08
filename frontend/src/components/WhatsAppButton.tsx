import { useTranslation } from 'react-i18next'
import { normalizePhone } from '../order/phone'
import { useSite } from '../site/useSite'

/** A small floating button that opens a WhatsApp chat with one of the configured phones, picked at random. */
export function WhatsAppButton() {
  const { t } = useTranslation()
  const phones = (useSite()?.whatsAppPhones ?? []).map(normalizePhone).filter((p): p is string => p !== null)
  if (phones.length === 0) return null

  const open = () => {
    const phone = phones[Math.floor(Math.random() * phones.length)]
    const url = `https://wa.me/972${phone.slice(1)}?text=${encodeURIComponent(t('whatsapp.message'))}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <button type="button" className="fab whatsapp-fab" onClick={open} aria-label={t('whatsapp.button')} title={t('whatsapp.button')}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l4.9-1.3A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.4.6.6-2.3-.2-.3A8 8 0 0 1 12 4Zm-3 3.5c-.3 0-.6.3-.8.6-.5.8-.4 1.800.3 3 1 1.700 2.400 3 4.200 3.800 1.100.5 1.800.4 2.300-.2.300-.3.400-.7.300-1l-1.800-.9-.8.900c-1-.4-2.300-1.600-2.700-2.600l.8-.8-.8-2c-.1-.4-.4-.8-1-.8Z" fill-rule="evenodd" />
      </svg>
    </button>
  )
}
