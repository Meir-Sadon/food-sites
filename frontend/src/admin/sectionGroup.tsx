import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SavedNote } from '../components/savedFlash'
import { SectionContext, useGuard } from './unsaved'

/** How long the "saved" note stays beside the disk icon in the side menu. */
const MENU_SAVED_MS = 2500
/** Below this distance from the top of the window (under the sticky bars) the section being read is the active one. */
const ACTIVE_OFFSET_PX = 140

interface Registered {
  id: string
  title: string
  el: HTMLElement
  heading: HTMLElement | null
}

interface Group {
  isOpen: (id: string, defaultOpen: boolean) => boolean
  toggle: (id: string, defaultOpen: boolean) => void
  register: (item: Registered) => () => void
  setDirty: (sectionId: string, key: string, dirty: boolean) => void
}

const GroupContext = createContext<Group | null>(null)

export function useSectionGroup() {
  return useContext(GroupContext)
}

/**
 * A page made of foldable settings sections with a side menu: sections start folded, the menu follows the scroll,
 * marks the section being read, opens and scrolls to the one picked, and shows a disk button beside a section with
 * unsaved changes that saves every pending change.
 */
export function SectionGroup({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const guard = useGuard()
  const [items, setItems] = useState<Registered[]>([])
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [active, setActive] = useState<string | null>(null)
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const dirtyKeys = useRef(new Map<string, Set<string>>())
  const defaults = useRef(new Map<string, boolean>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const group = useMemo<Group>(
    () => ({
      isOpen: (id, defaultOpen) => {
        defaults.current.set(id, defaultOpen)
        return opened[id] ?? defaultOpen
      },
      toggle: (id, defaultOpen) => setOpened((o) => ({ ...o, [id]: !(o[id] ?? defaultOpen) })),
      register: (item) => {
        setItems((all) => [...all.filter((x) => x.id !== item.id), item])
        return () => setItems((all) => all.filter((x) => x.id !== item.id))
      },
      setDirty: (sectionId, key, dirty) => {
        const keys = dirtyKeys.current.get(sectionId) ?? new Set<string>()
        if (dirty) keys.add(key)
        else keys.delete(key)
        dirtyKeys.current.set(sectionId, keys)
        setDirtyIds(new Set([...dirtyKeys.current].filter(([, k]) => k.size > 0).map(([id]) => id)))
      },
    }),
    [opened],
  )

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)),
    [items],
  )

  // The section being read: the last one whose top has passed the sticky bars.
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      let current: string | null = sorted[0]?.id ?? null
      for (const item of sorted) if (item.el.getBoundingClientRect().top <= ACTIVE_OFFSET_PX) current = item.id
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [sorted])

  function go(item: Registered) {
    setOpened((o) => ({ ...o, [item.id]: true }))
    setActive(item.id)
    // Wait for the section to unfold so the scroll lands on its real position.
    requestAnimationFrame(() => {
      item.el.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      item.heading?.focus({ preventScroll: true })
    })
  }

  async function saveAll(id: string) {
    if (!guard || saving) return
    setSaving(true)
    const ok = await guard.saveAll()
    setSaving(false)
    if (ok) {
      setSavedAt(id)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setSavedAt(null), MENU_SAVED_MS)
    } else {
      // A form that could not save shows its errors inside its section, so unfold the ones with changes.
      setOpened((o) => ({ ...o, ...Object.fromEntries([...dirtyKeys.current].filter(([, k]) => k.size > 0).map(([sid]) => [sid, true])) }))
    }
  }

  return (
    <GroupContext.Provider value={group}>
      <div className="section-layout">
        {sorted.length > 1 && (
          <nav className="section-menu" aria-label={t('admin.sectionMenu.label')}>
            <ul>
              {sorted.map((item) => (
                <li key={item.id} className={item.id === active ? 'section-menu__item active' : 'section-menu__item'}>
                  <button type="button" className="section-menu__link" aria-current={item.id === active ? 'true' : undefined} onClick={() => go(item)}>
                    {item.title}
                  </button>
                  {dirtyIds.has(item.id) && (
                    <button
                      type="button"
                      className="section-menu__save"
                      disabled={saving}
                      aria-label={t('admin.sectionMenu.saveAll', { name: item.title })}
                      title={t('admin.sectionMenu.saveAllTitle')}
                      onClick={() => void saveAll(item.id)}
                    >
                      <DiskIcon />
                    </button>
                  )}
                  {savedAt === item.id && <SavedNote show />}
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="section-layout__content">{children}</div>
      </div>
    </GroupContext.Provider>
  )
}

function DiskIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M8 3v5h7V3M7 21v-7h10v7" />
    </svg>
  )
}

/** For `Section`: registers it in the page's side menu. */
export function useRegisterSection(id: string, title: string, el: HTMLElement | null, heading: HTMLElement | null) {
  const group = useSectionGroup()
  useEffect(() => {
    if (!group || !el) return
    return group.register({ id, title, el, heading })
  }, [group, id, title, el, heading])
}

/**
 * Wraps one settings section component (the one that calls `useUnsavedChanges` and renders a `Section`), so the form's
 * unsaved changes are known to its entry in the side menu.
 */
export function SectionSlot({ children }: { children: ReactNode }) {
  const id = useId()
  const group = useSectionGroup()
  const value = useMemo(() => ({ id, setDirty: (key: string, dirty: boolean) => group?.setDirty(id, key, dirty) }), [group, id])
  return <SectionContext.Provider value={value}>{children}</SectionContext.Provider>
}
