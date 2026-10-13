import { createContext, useContext, useEffect, useRef } from 'react'

/** What the order page tells the top bar about the basket: how much is in it, and how to open it. */
export interface CartNav {
  count: number
  total: number
  open: () => void
}

export interface CartNavStore {
  cart: CartNav | null
  set: (cart: CartNav | null) => void
}

export const CartNavContext = createContext<CartNavStore | null>(null)

/** The basket the page registered, or null on pages with no basket. */
export const useCartNav = () => useContext(CartNavContext)?.cart ?? null

/** The order page registers its basket while it is shown, so the top bar can carry the basket button. */
export function useRegisterCart(count: number, total: number, open: () => void, enabled: boolean) {
  const store = useContext(CartNavContext)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  })
  const set = store?.set
  useEffect(() => {
    if (!set || !enabled) return
    set({ count, total, open: () => openRef.current() })
  }, [set, count, total, enabled])
  useEffect(() => () => set?.(null), [set])
}
