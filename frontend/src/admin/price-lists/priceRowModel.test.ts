import { describe, expect, it } from 'vitest'
import { clientPrice, discounted } from './priceRowModel'

const noDates = { from: '', to: '' }
const discount = (rule: 'general' | 'dish' | 'higher' | 'lower', from: string | null = null, to: string | null = null) =>
  ({ percent: 10, from, to, rule })

describe('the general discount', () => {
  it('rounds up to a whole shekel and never raises a price', () => {
    expect(discounted(70, 15)).toBe(60)
    expect(discounted(100, 10)).toBe(90)
    expect(discounted(0, 10)).toBe(0)
    expect(discounted(1, 10)).toBe(1)
  })

  it('applies to a price without a discount of its own, whatever the rule', () => {
    for (const rule of ['general', 'dish', 'higher', 'lower'] as const) expect(clientPrice(70, 70, noDates, discount(rule), '2026-11-01')).toBe(63)
  })

  it('picks between the dish’s own discount and the general one by the rule', () => {
    expect(clientPrice(70, 50, noDates, discount('general'), '2026-11-01')).toBe(63)
    expect(clientPrice(70, 50, noDates, discount('dish'), '2026-11-01')).toBe(50)
    expect(clientPrice(70, 50, noDates, discount('higher'), '2026-11-01')).toBe(50)
    expect(clientPrice(70, 50, noDates, discount('lower'), '2026-11-01')).toBe(63)
  })

  it('follows its own dates and the row’s', () => {
    const november = discount('general', '2026-11-01', '2026-11-30')
    expect(clientPrice(70, 50, noDates, november, '2026-12-01')).toBe(50)
    expect(clientPrice(70, 50, { from: '2026-12-05', to: '' }, november, '2026-12-01')).toBeNull()
    expect(clientPrice(70, 50, { from: '2026-12-05', to: '' }, november, '2026-11-10')).toBe(63)
    expect(clientPrice(70, 50, noDates, { ...november, percent: null }, '2026-11-10')).toBe(50)
  })
})
