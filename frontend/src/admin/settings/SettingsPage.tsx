import { useTranslation } from 'react-i18next'
import { BackgroundSection } from './BackgroundSection'
import { ClosedDatesSection } from './ClosedDatesSection'
import { GeneralSection } from './GeneralSection'
import { PasswordSection } from './PasswordSection'
import { StyleSection } from './StyleSection'
import { SupplyDaysSection } from './SupplyDaysSection'

export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t('admin.settings.title')}</h1>
      <StyleSection />
      <BackgroundSection />
      <SupplyDaysSection />
      <ClosedDatesSection />
      <GeneralSection />
      <PasswordSection />
    </>
  )
}
