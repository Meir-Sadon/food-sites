import { useTranslation } from 'react-i18next'
import { AccessibilitySection } from './AccessibilitySection'
import { MainContactSection } from './MainContactSection'
import { NotifyPhonesSection } from './NotifyPhonesSection'
import { SectionGroup, SectionSlot } from '../sectionGroup'

export function ContactsPage() {
  const { t } = useTranslation()
  return (
    <SectionGroup>
      <h1>{t('admin.contacts.title')}</h1>
      <SectionSlot>
        <MainContactSection />
      </SectionSlot>
      <SectionSlot>
        <NotifyPhonesSection />
      </SectionSlot>
      <SectionSlot>
        <AccessibilitySection />
      </SectionSlot>
    </SectionGroup>
  )
}
