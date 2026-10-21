import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'

/** What a form with a save button tells the admin area: whether it has unsaved changes, and how to save them. */
export interface Entry {
  dirty: boolean
  /** Saves the form's changes. False when it could not (the form shows its own errors). */
  save: () => Promise<boolean>
}

export interface Guard {
  entries: RefObject<Set<RefObject<Entry>>>
  /** Runs `proceed` at once when nothing is unsaved, else asks the admin first. */
  leave: (proceed: () => void) => void
  /** Saves every form with unsaved changes, one after the other. False when one could not (it shows its own errors). */
  saveAll: () => Promise<boolean>
}

/** What a `SectionSlot` offers the form of the section inside it, so its unsaved changes show beside it in the side menu. */
export const SectionContext = createContext<{ id: string; setDirty: (key: string, dirty: boolean) => void } | null>(null)

export const GuardContext = createContext<Guard | null>(null)

/**
 * A form with a save button registers here while it is on screen. Leaving the page (a link, the top bar, logging out,
 * closing the tab) then asks about the changes that were not saved.
 */
export function useUnsavedChanges(dirty: boolean, save: () => Promise<boolean>) {
  const guard = useContext(GuardContext)
  const entry = useRef<Entry>({ dirty, save })
  const section = useContext(SectionContext)
  const key = useId()
  useEffect(() => {
    entry.current = { dirty, save }
  })
  // A form inside a foldable section tells it, so the side menu can show the save button beside that section.
  useEffect(() => {
    section?.setDirty(key, dirty)
    return () => section?.setDirty(key, false)
  }, [section, key, dirty])
  useEffect(() => {
    const entries = guard?.entries.current
    if (!entries) return
    entries.add(entry)
    return () => {
      entries.delete(entry)
    }
  }, [guard])
}

/** For buttons that leave the admin area without a link (log out): `leave(() => ...)` asks first when needed. */
export function useAdminLeave() {
  return useContext(GuardContext)?.leave ?? ((proceed: () => void) => proceed())
}

/**
 * Whether `value` differs from what was first loaded or last saved. Call the returned `markSaved` with what a save
 * returned; `value` is null until it has loaded.
 */
export function useDirty<T>(value: T | null) {
  const [baseline, setBaseline] = useState<string | null>(null)
  const json = useMemo(() => (value === null ? null : JSON.stringify(value)), [value])
  if (baseline === null && json !== null) setBaseline(json)
  return { dirty: baseline !== null && json !== baseline, markSaved: (saved: T) => setBaseline(JSON.stringify(saved)) }
}

export function useGuard() {
  return useContext(GuardContext)
}
