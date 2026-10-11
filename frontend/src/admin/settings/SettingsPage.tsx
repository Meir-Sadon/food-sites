import { useTranslation } from 'react-i18next'
import { ClosedDatesSection } from './ClosedDatesSection'
import { ConsoleTokenSection } from './ConsoleTokenSection'
import { GeneralSection } from './GeneralSection'
import { PasswordSection } from './PasswordSection'
import { SupplyDaysSection } from './SupplyDaysSection'
import { useAdminSession } from '../session'

export function SettingsPage() {
  const { t } = useTranslation()
  const { actor } = useAdminSession()
  return (
    <>
      <h1>{t('admin.settings.title')}</h1>
      <SupplyDaysSection />
      <ClosedDatesSection />
      <GeneralSection />
      <PasswordSection />
      {actor === 'master' && <ConsoleTokenSection />}
    </>
  )
}
