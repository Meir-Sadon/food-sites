import { useTranslation } from 'react-i18next'
import { MainContactSection } from './MainContactSection'
import { NotifyPhonesSection } from './NotifyPhonesSection'

export function ContactsPage() {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t('admin.contacts.title')}</h1>
      <MainContactSection />
      <NotifyPhonesSection />
    </>
  )
}
