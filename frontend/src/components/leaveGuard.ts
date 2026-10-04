import { createContext, useContext, useEffect, type RefObject } from 'react'

/** Returns true when it takes over the navigation (for example to ask about saving a draft). */
export type LeaveGuard = (to: string) => boolean

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
  return (to) => ref?.current?.(to) ?? false
}
