import { useMemo, useState, type ReactNode } from 'react'
import { CartNavContext, type CartNav } from './cartNav'

export function CartNavProvider({ children }: { children: ReactNode }) {
  const [cart, set] = useState<CartNav | null>(null)
  const store = useMemo(() => ({ cart, set }), [cart])
  return <CartNavContext.Provider value={store}>{children}</CartNavContext.Provider>
}
