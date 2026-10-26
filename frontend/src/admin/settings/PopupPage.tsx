import { useTranslation } from 'react-i18next'
import { popupApi } from '../../api/popup'
import { useLoad } from '../hooks'
import { Loading } from '../ui'
import { SectionGroup, SectionSlot } from '../sectionGroup'
import { PopupSection } from './PopupSection'

/** The entry pop-ups have a tab of their own: one section for each of the (up to three) pop-ups. */
export function PopupPage() {
  const { t } = useTranslation()
  const { data, setData, failed } = useLoad(popupApi.list)
  return (
    <SectionGroup>
      <h1>{t('admin.popup.page')}</h1>
      {!data ? (
        <Loading failed={failed} />
      ) : (
        data.map((popup) => (
          <SectionSlot key={popup.slot}>
            <PopupSection
              popup={popup}
              onChange={(changed) => setData((current) => (current ?? []).map((p) => (p.slot === changed.slot ? changed : p)))}
            />
          </SectionSlot>
        ))
      )}
    </SectionGroup>
  )
}
