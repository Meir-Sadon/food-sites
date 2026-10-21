import { useTranslation } from 'react-i18next'
import { BackgroundSection } from './BackgroundSection'
import { ColorsSection } from './ColorsSection'
import { CornersSection } from './CornersSection'
import { FinishSection } from './FinishSection'
import { OrderLayoutSection } from './OrderLayoutSection'
import { SectionGroup, SectionSlot } from '../sectionGroup'
import { StyleSection } from './StyleSection'

/** How the client site looks: its style, corners, colours, fonts, shadows and spacing, the order page's layout and the main background picture. */
export function AppearancePage() {
  const { t } = useTranslation()
  return (
    <SectionGroup>
      <h1>{t('admin.appearance.title')}</h1>
      <SectionSlot>
        <StyleSection />
      </SectionSlot>
      <SectionSlot>
        <CornersSection />
      </SectionSlot>
      <SectionSlot>
        <ColorsSection />
      </SectionSlot>
      <SectionSlot>
        <FinishSection />
      </SectionSlot>
      <SectionSlot>
        <OrderLayoutSection />
      </SectionSlot>
      <SectionSlot>
        <BackgroundSection />
      </SectionSlot>
    </SectionGroup>
  )
}
