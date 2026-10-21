import { useTranslation } from 'react-i18next'
import { SectionGroup, SectionSlot } from '../sectionGroup'
import { PopupSection } from './PopupSection'

/** The entry pop-up has a tab of its own. */
export function PopupPage() {
  const { t } = useTranslation()
  return (
    <SectionGroup>
      <h1>{t('admin.popup.page')}</h1>
      <SectionSlot>
        <PopupSection defaultOpen />
      </SectionSlot>
    </SectionGroup>
  )
}
