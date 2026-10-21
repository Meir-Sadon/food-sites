import { useTranslation } from 'react-i18next'
import { SectionGroup, SectionSlot } from '../sectionGroup'
import { SocialLinksSection } from './SocialLinksSection'
import { TrackingSection } from './TrackingSection'

/** Social network links and the marketing tracking tools. */
export function SocialPage() {
  const { t } = useTranslation()
  return (
    <SectionGroup>
      <h1>{t('admin.social.page')}</h1>
      <SectionSlot>
        <SocialLinksSection />
      </SectionSlot>
      <SectionSlot>
        <TrackingSection />
      </SectionSlot>
    </SectionGroup>
  )
}
