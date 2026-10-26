import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClosedDatesSection } from './ClosedDatesSection'
import { ConsoleTokenSection } from './ConsoleTokenSection'
import { GeneralSection } from './GeneralSection'
import { InactiveAfterSection } from './InactiveAfterSection'
import { PasswordSection } from './PasswordSection'
import { ShabbatRulesSection } from './ShabbatRulesSection'
import { SupplyDaysSection } from './SupplyDaysSection'
import { DeliveryZonesSection } from '../delivery/DeliveryZonesSection'
import type { DeliveryPricing } from '../../api/site'
import { useAdminSession } from '../session'
import { SectionGroup, SectionSlot } from '../sectionGroup'

export function SettingsPage() {
  const { t } = useTranslation()
  const { actor } = useAdminSession()
  const [pricing, setPricing] = useState<DeliveryPricing | null>(null)
  return (
    <SectionGroup>
      <h1>{t('admin.settings.title')}</h1>
      <SectionSlot>
        <SupplyDaysSection />
      </SectionSlot>
      <SectionSlot>
        <ShabbatRulesSection />
      </SectionSlot>
      <SectionSlot>
        <ClosedDatesSection />
      </SectionSlot>
      <SectionSlot>
        <GeneralSection onPricing={setPricing} />
      </SectionSlot>
      <SectionSlot>
        <InactiveAfterSection />
      </SectionSlot>
      {pricing === 'zones' && (
        <SectionSlot>
          <DeliveryZonesSection />
        </SectionSlot>
      )}
      <SectionSlot>
        <PasswordSection />
      </SectionSlot>
      {actor === 'master' && (
        <SectionSlot>
          <ConsoleTokenSection />
        </SectionSlot>
      )}
    </SectionGroup>
  )
}
