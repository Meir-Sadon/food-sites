import { useTranslation } from 'react-i18next'
import { ClosedDatesSection } from './ClosedDatesSection'
import { GeneralSection } from './GeneralSection'
import { PasswordSection } from './PasswordSection'
import { SupplyDaysSection } from './SupplyDaysSection'

export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t('admin.settings.title')}</h1>
      <SupplyDaysSection />
      <ClosedDatesSection />
      <GeneralSection />
      <PasswordSection />
    </>
  )
}
