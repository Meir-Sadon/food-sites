import { describe, expect, it } from 'vitest'
import { frameAt, scrollProgress } from './scrollFrames'

describe('scrollProgress', () => {
  it('goes from 0 to 1 while the section scrolls through the screen', () => {
    expect(scrollProgress(100, 2000, 800)).toBe(0)
    expect(scrollProgress(0, 2000, 800)).toBe(0)
    expect(scrollProgress(-600, 2000, 800)).toBe(0.5)
    expect(scrollProgress(-1200, 2000, 800)).toBe(1)
    expect(scrollProgress(-5000, 2000, 800)).toBe(1)
  })

  it('stays at 0 for a section no taller than the screen', () => {
    expect(scrollProgress(-50, 800, 800)).toBe(0)
  })
})

describe('frameAt', () => {
  it('picks a picture and how far the next one has faded in', () => {
    expect(frameAt(0, 5)).toEqual({ index: 0, mix: 0 })
    expect(frameAt(0.125, 5)).toEqual({ index: 0, mix: 0.5 })
    expect(frameAt(0.5, 5)).toEqual({ index: 2, mix: 0 })
  })

  it('ends on the last picture', () => {
    expect(frameAt(1, 5)).toEqual({ index: 3, mix: 1 })
    expect(frameAt(2, 5)).toEqual({ index: 3, mix: 1 })
  })

  it('has nothing to fade between with a single picture', () => {
    expect(frameAt(0.7, 1)).toEqual({ index: 0, mix: 0 })
  })
})
