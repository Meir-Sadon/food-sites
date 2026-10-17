import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Modal } from '../components/Modal'
import { GuardContext, type Entry } from './unsaved'

function isInternalLink(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return null
  const href = anchor.getAttribute('href') ?? ''
  return href.startsWith('/') && !href.startsWith('//') ? anchor : null
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const entries = useRef(new Set<RefObject<Entry>>())
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [saving, setSaving] = useState(false)

  const anyDirty = () => [...entries.current].some((e) => e.current?.dirty)

  const leave = useCallback((proceed: () => void) => {
    if ([...entries.current].some((e) => e.current?.dirty)) setPending(() => proceed)
    else proceed()
  }, [])

  // Links are caught before the router sees them; the page stays where it is until the admin decides.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = isInternalLink(event)
      if (!anchor || !anyDirty()) return
      const href = anchor.getAttribute('href')!
      if (href === window.location.pathname + window.location.search) return
      event.preventDefault()
      event.stopPropagation()
      setPending(() => () => navigate(href))
    }
    document.addEventListener('click', onClick, true)
    const warn = (event: BeforeUnloadEvent) => {
      if (anyDirty()) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', warn)
    }
  }, [navigate])

  async function saveAndLeave() {
    if (!pending) return
    setSaving(true)
    let allSaved = true
    for (const entry of [...entries.current]) {
      if (!entry.current?.dirty) continue
      if (!(await entry.current.save().catch(() => false))) {
        allSaved = false
        break
      }
    }
    setSaving(false)
    const proceed = pending
    setPending(null)
    // A form that could not save shows its own errors, so the admin stays on it.
    if (allSaved) proceed()
  }

  const stay = () => setPending(null)

  return (
    <GuardContext.Provider value={{ entries, leave }}>
      {children}
      {pending && (
        <Modal title={t('admin.unsaved.title')} onClose={stay} wide>
          <p>{t('admin.unsaved.text')}</p>
          <div className="row modal__actions modal__actions--inline">
            <button type="button" disabled={saving} onClick={saveAndLeave}>
              {saving ? t('admin.saving') : t('admin.unsaved.save')}
            </button>
            <button
              type="button"
              className="button-quiet"
              disabled={saving}
              onClick={() => {
                const proceed = pending
                setPending(null)
                proceed()
              }}
            >
              {t('admin.unsaved.discard')}
            </button>
            <button type="button" className="button-quiet" disabled={saving} onClick={stay}>
              {t('admin.unsaved.stay')}
            </button>
          </div>
        </Modal>
      )}
    </GuardContext.Provider>
  )
}

