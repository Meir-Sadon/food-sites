import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** A list laid out top to bottom, or a grid filled row by row in the reading direction. */
export type SortLayout = 'list' | 'grid'

interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * Where the dragged item lands: the number of other items that come before the pointer. In a list an item comes
 * before when its middle is above the pointer; in a grid, when its row is above or it is earlier in the pointer's
 * row (to the right of it in RTL). Measuring midpoints keeps a tall neighbour from swapping back and forth.
 */
export function dropIndex(others: Box[], x: number, y: number, layout: SortLayout, rtl: boolean): number {
  return others.filter((box) => {
    if (layout === 'list') return (box.top + box.bottom) / 2 < y
    if (box.bottom <= y) return true
    if (box.top > y) return false
    const middle = (box.left + box.right) / 2
    return rtl ? middle > x : middle < x
  }).length
}

/** The ids with the one at `index` swapped with its neighbour, for the up and down buttons. */
export function moved(ids: number[], index: number, direction: 'Up' | 'Down'): number[] {
  const target = direction === 'Up' ? index - 1 : index + 1
  if (target < 0 || target >= ids.length) return ids
  const result = [...ids]
  ;[result[index], result[target]] = [result[target], result[index]]
  return result
}

const EDGE = 64
const SCROLL_STEP = 12

/**
 * Drag to reorder with a mouse, a finger or a pen (pointer events), started from a handle so the rest of the row
 * still scrolls on a phone. While dragging, `items` comes back in the new order; `onReorder` gets the ids when the
 * item is dropped somewhere new. Each item element takes `itemRef(id)`, its handle `handleProps(id)`.
 */
export function useDragSort<T>(items: T[], idOf: (item: T) => number, onReorder: (ids: number[]) => void, layout: SortLayout = 'list') {
  const [order, setOrder] = useState<{ dragging: number; ids: number[] } | null>(null)
  const elements = useRef(new Map<number, HTMLElement>())
  const ids = items.map(idOf)
  const latest = useRef({ order, ids, onReorder, layout })
  useLayoutEffect(() => {
    latest.current = { order, ids, onReorder, layout }
  })

  // While dragging, follow the pointer on the window: reordering moves the rows in the page, which can drop the
  // pointer capture on the handle. A finger resting near the top or bottom of the screen scrolls long lists.
  const dragging = order !== null
  useEffect(() => {
    if (!dragging) return
    let at: { x: number; y: number } | null = null

    function place() {
      const { order: current, layout } = latest.current
      const dragged = current && elements.current.get(current.dragging)
      if (!at || !current || !dragged) return
      const others = current.ids.filter((id) => id !== current.dragging)
      const boxes = others.map((id) => elements.current.get(id)?.getBoundingClientRect())
      if (boxes.some((box) => !box)) return
      const index = dropIndex(boxes as DOMRect[], at.x, at.y, layout, getComputedStyle(dragged).direction === 'rtl')
      const next = [...others.slice(0, index), current.dragging, ...others.slice(index)]
      if (next.some((id, i) => id !== current.ids[i])) setOrder({ dragging: current.dragging, ids: next })
    }

    function finish(drop: boolean) {
      const { order: current, ids, onReorder } = latest.current
      setOrder(null)
      if (drop && current && current.ids.some((id, i) => id !== ids[i])) onReorder(current.ids)
    }

    const move = (event: PointerEvent) => {
      at = { x: event.clientX, y: event.clientY }
      place()
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    let frame = requestAnimationFrame(function scroll() {
      if (at && (at.y < EDGE || at.y > window.innerHeight - EDGE)) {
        window.scrollBy(0, at.y < EDGE ? -SCROLL_STEP : SCROLL_STEP)
        place()
      }
      frame = requestAnimationFrame(scroll)
    })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [dragging])

  const shown = order && sameMembers(order.ids, ids) ? order.ids.map((id) => items[ids.indexOf(id)]) : items

  return {
    items: shown,
    dragging: order?.dragging ?? null,
    itemRef: (id: number) => (element: HTMLElement | null) => {
      if (element) elements.current.set(id, element)
      else elements.current.delete(id)
    },
    handleProps: (id: number) => ({
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0) return
        // Keeps the browser from selecting text or starting its own drag.
        event.preventDefault()
        setOrder({ dragging: id, ids })
      },
    }),
  }
}

function sameMembers(a: number[], b: number[]) {
  return a.length === b.length && a.every((id) => b.includes(id))
}
