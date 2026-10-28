import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/** How the order in progress got its dishes, other than the client choosing them one by one. */
export type OrderSource = 'draft' | 'last' | 'favorite'

/** What the order page tells the rest of the site about the order in progress (the entry pop-ups' conditions use it). */
export interface OrderSignals {
  /** The dishes total in ₪; 0 when nothing is chosen. */
  total: number
  hasOrder: boolean
  /** A draft restored from this browser, or an order filled from the last order or a favorite. */
  sources: readonly OrderSource[]
}

const none: OrderSignals = { total: 0, hasOrder: false, sources: [] }

interface State {
  signals: OrderSignals
  setSignals: (signals: OrderSignals) => void
}

const OrderSignalsContext = createContext<State>({ signals: none, setSignals: () => {} })

export function OrderSignalsProvider({ children }: { children: ReactNode }) {
  const [signals, setSignals] = useState(none)
  const value = useMemo(() => ({ signals, setSignals }), [signals])
  return <OrderSignalsContext.Provider value={value}>{children}</OrderSignalsContext.Provider>
}

export const useOrderSignals = () => useContext(OrderSignalsContext).signals

/** Called by the order page: tells the site about the order in progress, and that there is none once the page closes. */
export function useReportOrderSignals(total: number, hasOrder: boolean, sources: readonly OrderSource[]) {
  const { setSignals } = useContext(OrderSignalsContext)
  const key = sources.join(',')
  useEffect(() => {
    setSignals({ total, hasOrder, sources: key ? (key.split(',') as OrderSource[]) : [] })
  }, [setSignals, total, hasOrder, key])
  useEffect(() => () => setSignals(none), [setSignals])
}
