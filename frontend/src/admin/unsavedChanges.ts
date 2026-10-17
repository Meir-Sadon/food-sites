import { createContext, useContext, useEffect, type RefObject } from 'react'

/** A form that may hold changes the admin has not saved. `save` returns whether the changes were saved. */
export interface UnsavedEntry {
  dirty: boolean
  save: () => Promise<boolean>
}

export const RegistryContext = createContext<RefObject<Set<UnsavedEntry>> | null>(null)
export const AskContext = createContext<((proceed: () => void) => void) | null>(null)

/**
 * A form tells the admin layout whether it has unsaved changes and how to save them. Leaving the page (a link or the
 * log-out button) then asks first, and closing the tab warns. Outside the admin layout it does nothing.
 */
export function useUnsavedChanges(dirty: boolean, save: () => Promise<boolean>) {
  const registry = useContext(RegistryContext)
  useEffect(() => {
    if (!registry) return
    const entry = { dirty, save }
    const entries = registry.current
    entries.add(entry)
    return () => {
      entries.delete(entry)
    }
  })
}

/** Runs `proceed` at once when nothing is unsaved; otherwise asks the admin first. */
export function useLeaveAdminPage() {
  const ask = useContext(AskContext)
  return (proceed: () => void) => (ask ? ask(proceed) : proceed())
}
