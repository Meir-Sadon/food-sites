import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClosedDatesSection } from './ClosedDatesSection'
import { ConsoleTokenSection } from './ConsoleTokenSection'
import { GeneralSection } from './GeneralSection'
import { PasswordSection } from './PasswordSection'
import { SocialLinksSection } from './SocialLinksSection'
import { SupplyDaysSection } from './SupplyDaysSection'
import { TrackingSection } from './TrackingSection'
import { DeliveryZonesSection } from '../delivery/DeliveryZonesSection'
import type { DeliveryPricing } from '../../api/site'
import { useAdminSession } from '../session'

export function SettingsPage() {
  const { t } = useTranslation()
  const { actor } = useAdminSession()
  const [pricing, setPricing] = useState<DeliveryPricing | null>(null)
  return (
    <>
      <h1>{t('admin.settings.title')}</h1>
      <SupplyDaysSection />
      <ClosedDatesSection />
      <GeneralSection onPricing={setPricing} />
      {pricing === 'zones' && <DeliveryZonesSection />}
      <TrackingSection />
      <SocialLinksSection />
      <PasswordSection />
      {actor === 'master' && <ConsoleTokenSection />}
    </>
  )
}
