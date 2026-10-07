import { useRef, type ReactNode } from 'react'
import { GuardContext, type LeaveGuard } from './leaveGuard'

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const ref = useRef<LeaveGuard | null>(null)
  return <GuardContext.Provider value={ref}>{children}</GuardContext.Provider>
}
