import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import { AskContext, RegistryContext, type UnsavedEntry } from './unsavedChanges'

/** True when the click is on a link that goes somewhere else inside the app. */
function isLeavingLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const link = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
  if (!link || link.target === '_blank' || link.hasAttribute('download') || link.origin !== window.location.origin) return null
  if (link.pathname + link.search === window.location.pathname + window.location.search) return null
  return link
}

/** Provides the registry and asks "save the changes?" before the admin leaves a page with unsaved ones. */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const registry = useRef(new Set<UnsavedEntry>())
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const anyDirty = useCallback(() => [...registry.current].some((entry) => entry.dirty), [])

  const ask = useCallback(
    (proceed: () => void) => {
      if (anyDirty()) {
        setFailed(false)
        setPending(() => proceed)
      } else proceed()
    },
    [anyDirty],
  )

  // Closing or reloading the tab warns too.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (anyDirty()) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [anyDirty])

  // Any link inside the admin (the menus, "back" links, links in a page) asks first; the same click goes on once decided.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = isLeavingLink(event)
      if (!link || !anyDirty()) return
      event.preventDefault()
      event.stopPropagation()
      setFailed(false)
      setPending(() => () => link.click())
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [anyDirty])

  async function saveAndLeave() {
    setSaving(true)
    setFailed(false)
    let ok = true
    for (const entry of [...registry.current]) {
      if (!entry.dirty) continue
      if (!(await entry.save().catch(() => false))) ok = false
    }
    setSaving(false)
    if (ok) leave()
    else setFailed(true)
  }

  function leave() {
    const proceed = pending
    // The decision is made: the page may now be left without asking again.
    for (const entry of registry.current) entry.dirty = false
    setPending(null)
    proceed?.()
  }

  return (
    <RegistryContext.Provider value={registry}>
      <AskContext.Provider value={ask}>
        {children}
        {pending && (
          <Modal title={t('admin.unsaved.title')} onClose={() => setPending(null)}>
            <p>{t('admin.unsaved.text')}</p>
            {failed && (
              <p role="alert" className="form-error">
                {t('admin.unsaved.failed')}
              </p>
            )}
            <div className="modal__actions">
              <button type="button" disabled={saving} onClick={saveAndLeave}>
                {saving ? t('admin.saving') : t('admin.unsaved.save')}
              </button>
              <button type="button" className="button-quiet" disabled={saving} onClick={leave}>
                {t('admin.unsaved.discard')}
              </button>
              <button type="button" className="button-quiet" disabled={saving} onClick={() => setPending(null)}>
                {t('admin.unsaved.stay')}
              </button>
            </div>
          </Modal>
        )}
      </AskContext.Provider>
    </RegistryContext.Provider>
  )
}
