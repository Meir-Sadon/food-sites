import { useTranslation } from 'react-i18next'
import { BackgroundSection } from './BackgroundSection'
import { StyleSection } from './StyleSection'

/** How the client site looks: its style and main background picture. */
export function AppearancePage() {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t('admin.appearance.title')}</h1>
      <StyleSection />
      <BackgroundSection />
    </>
  )
}
