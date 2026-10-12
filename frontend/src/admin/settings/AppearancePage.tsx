import { useTranslation } from 'react-i18next'
import { BackgroundSection } from './BackgroundSection'
import { CornersSection } from './CornersSection'
import { OrderLayoutSection } from './OrderLayoutSection'
import { StyleSection } from './StyleSection'

/** How the client site looks: its style, corners, the order page's layout and the main background picture. */
export function AppearancePage() {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t('admin.appearance.title')}</h1>
      <StyleSection />
      <CornersSection />
      <OrderLayoutSection />
      <BackgroundSection />
    </>
  )
}
