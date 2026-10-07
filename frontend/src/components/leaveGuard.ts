import { createContext, useContext, useEffect, type RefObject } from 'react'

/** Returns true when it takes over the navigation (for example to ask about saving a draft). */
/** `proceed` runs instead of a plain navigation once the user has decided (logout, for example). */
export type LeaveGuard = (to: string, proceed?: () => void | Promise<void>) => boolean

export const GuardContext = createContext<RefObject<LeaveGuard | null> | null>(null)

/** A page registers a guard while it has unsaved work; the top bar asks it before navigating away. */
export function useRegisterLeaveGuard(guard: LeaveGuard) {
  const ref = useContext(GuardContext)
  useEffect(() => {
    if (!ref) return
    ref.current = guard
    return () => {
      ref.current = null
    }
  })
}

export function useLeaveCheck(): LeaveGuard {
  const ref = useContext(GuardContext)
  return (to, proceed) => ref?.current?.(to, proceed) ?? false
}
