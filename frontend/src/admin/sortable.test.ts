import { describe, expect, it } from 'vitest'
import { dropIndex, moved } from './sortable'

const box = (top: number, left: number, size = 100) => ({ top, bottom: top + size, left, right: left + size })

describe('dropIndex', () => {
  it('counts the list rows whose middle is above the pointer', () => {
    const rows = [box(0, 0, 40), box(40, 0, 120), box(160, 0, 40)]
    expect(dropIndex(rows, 0, 10, 'list', true)).toBe(0)
    expect(dropIndex(rows, 0, 30, 'list', true)).toBe(1)
    // Inside the tall row but above its middle: still before it.
    expect(dropIndex(rows, 0, 90, 'list', true)).toBe(1)
    expect(dropIndex(rows, 0, 110, 'list', true)).toBe(2)
    expect(dropIndex(rows, 0, 500, 'list', true)).toBe(3)
  })

  it('reads a right-to-left grid from the right', () => {
    // Two rows of two: right then left.
    const cells = [box(0, 100), box(0, 0), box(100, 100), box(100, 0)]
    expect(dropIndex(cells, 190, 50, 'grid', true)).toBe(0)
    expect(dropIndex(cells, 90, 50, 'grid', true)).toBe(1)
    expect(dropIndex(cells, 10, 50, 'grid', true)).toBe(2)
    expect(dropIndex(cells, 120, 150, 'grid', true)).toBe(3)
  })

  it('reads a left-to-right grid from the left', () => {
    const cells = [box(0, 0), box(0, 100)]
    expect(dropIndex(cells, 10, 50, 'grid', false)).toBe(0)
    expect(dropIndex(cells, 60, 50, 'grid', false)).toBe(1)
    expect(dropIndex(cells, 190, 50, 'grid', false)).toBe(2)
  })
})

describe('moved', () => {
  it('swaps with the neighbour and stays put at either end', () => {
    expect(moved([1, 2, 3], 1, 'Up')).toEqual([2, 1, 3])
    expect(moved([1, 2, 3], 1, 'Down')).toEqual([1, 3, 2])
    expect(moved([1, 2, 3], 0, 'Up')).toEqual([1, 2, 3])
    expect(moved([1, 2, 3], 2, 'Down')).toEqual([1, 2, 3])
  })
})
