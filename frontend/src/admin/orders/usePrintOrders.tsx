import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AdminOrder } from '../../api/operations'
import { PrintSheet } from './PrintSheet'

/**
 * Printing one order or a list of them (the browser's print dialog also saves as PDF). The orders are drawn into a
 * sheet outside the app root that only shows in print, one order per page, while the app itself is hidden in print.
 */
export function usePrintOrders(): { print: (orders: AdminOrder[]) => void; sheet: ReactNode } {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null)

  const print = useCallback((list: AdminOrder[]) => {
    if (list.length > 0) setOrders(list)
  }, [])

  useEffect(() => {
    if (!orders) return
    const done = () => {
      document.documentElement.classList.remove('printing-orders')
      setOrders(null)
    }
    document.documentElement.classList.add('printing-orders')
    window.addEventListener('afterprint', done, { once: true })
    window.print()
    return () => window.removeEventListener('afterprint', done)
  }, [orders])

  return { print, sheet: orders ? createPortal(<PrintSheet orders={orders} />, document.body) : null }
}
