import { useEffect, useRef, useState } from 'react'
import { accountApi } from '../api/account'
import type { Selection } from './model'

/** How long the selections must stay unchanged before they are saved, so a run of clicks is one request. */
export const CART_SAVE_DELAY = 1000

/**
 * A logged-in client's cart is also kept on the server, so it follows them to another device (and marks them as being
 * in the middle of an order, for the price lists). Once the menu is in, a saved cart is brought back when this browser
 * has none (`onRestore`); after that every change is saved, and an emptied cart is removed. The server removes it when
 * the order is sent. Requests that fail are left alone: the browser's own draft still holds the cart.
 */
export function useServerCart({ userId, menuLoaded, selections, count, paused, onRestore, onFirstItem }: {
  userId: number | null
  menuLoaded: boolean
  selections: Record<number, Selection>
  count: number
  /** While the confirmation shows, nothing is saved. */
  paused: boolean
  onRestore: (selections: Record<number, Selection>) => void
  /** The saved cart got its first dish. */
  onFirstItem: () => void
}) {
  const [readyFor, setReadyFor] = useState<number | null>(null)
  // What the server holds, as compared with `content`: '' for no cart.
  const saved = useRef('')
  const hadItems = useRef(false)
  const content = count > 0 ? JSON.stringify(selections) : ''
  const latest = useRef({ content, count, paused, onRestore, onFirstItem })
  useEffect(() => {
    latest.current = { content, count, paused, onRestore, onFirstItem }
  })

  useEffect(() => {
    if (!userId || !menuLoaded || readyFor === userId) return
    let active = true
    accountApi
      .cart()
      .then((cart) => {
        if (!active) return
        saved.current = cart && cart.itemCount > 0 ? cart.content : ''
        hadItems.current = saved.current !== ''
        // The cart in this browser wins: it is the one being worked on.
        if (cart && cart.itemCount > 0 && latest.current.count === 0) latest.current.onRestore(JSON.parse(cart.content))
      })
      .catch(() => {})
      .finally(() => active && setReadyFor(userId))
    return () => {
      active = false
    }
  }, [userId, menuLoaded, readyFor])

  useEffect(() => {
    if (!userId || readyFor !== userId || paused || content === saved.current) return
    const timer = setTimeout(() => {
      saved.current = content
      accountApi.saveCart(content || '{}', count).then(
        () => {
          if (count > 0 && !hadItems.current) latest.current.onFirstItem()
          hadItems.current = count > 0
        },
        () => {
          saved.current = '\0'
        },
      )
    }, CART_SAVE_DELAY)
    return () => clearTimeout(timer)
  }, [userId, readyFor, paused, content, count])

  // Leaving the page saves a change still waiting for its delay.
  useEffect(
    () => () => {
      const { content, count, paused } = latest.current
      if (userId && readyFor === userId && !paused && content !== saved.current) void accountApi.saveCart(content || '{}', count).catch(() => {})
    },
    [userId, readyFor],
  )

  return {
    /** The order was sent: the server removed the cart. */
    sent() {
      saved.current = ''
      hadItems.current = false
    },
    /** The client chose not to keep the cart. */
    discard() {
      if (!userId) return
      saved.current = latest.current.content
      hadItems.current = false
      void accountApi.clearCart().catch(() => {})
    },
  }
}
