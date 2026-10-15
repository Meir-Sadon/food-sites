import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** How long the "saved" note stays next to the save button. */
const SAVED_FLASH_MS = 4000

/** Remembers that something was just saved, for a few seconds. Show it with `SavedNote` next to the save button. */
export function useSavedFlash() {
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flash = useCallback(() => {
    clearTimeout(timer.current)
    setSaved(true)
    timer.current = setTimeout(() => setSaved(false), SAVED_FLASH_MS)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return { saved, flash }
}

/** The "saved" message, right beside the save button. Always rendered so screen readers hear it appear. */
export function SavedNote({ show }: { show: boolean }) {
  const { t } = useTranslation()
  return (
    <span aria-live="polite" className="saved-note">
      {show ? t('admin.saved') : ''}
    </span>
  )
}
