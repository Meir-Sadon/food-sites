import { describe, expect, it } from 'vitest'
import { popup } from '../test/catalogData'
import { conditionsMatch, isActive, type Visitor } from './popupConditions'

const visitor = (patch: Partial<Visitor> = {}): Visitor => ({
  loggedIn: false,
  active: null,
  order: { total: 0, hasOrder: false, sources: [] },
  ...patch,
})

describe('isActive', () => {
  const now = new Date('2026-10-26T12:00:00Z')

  it('counts a last order within the weeks or months as active, and an older one as inactive', () => {
    expect(isActive(new Date('2026-10-05T12:00:00Z'), { amount: 4, unit: 'week' }, now)).toBe(true)
    expect(isActive(new Date('2026-09-20T12:00:00Z'), { amount: 4, unit: 'week' }, now)).toBe(false)
    expect(isActive(new Date('2026-08-01T12:00:00Z'), { amount: 3, unit: 'month' }, now)).toBe(true)
    expect(isActive(new Date('2026-07-01T12:00:00Z'), { amount: 3, unit: 'month' }, now)).toBe(false)
  })

  it('counts a client with no order as inactive', () => {
    expect(isActive(null, { amount: 3, unit: 'month' }, now)).toBe(false)
  })
})

describe('conditionsMatch', () => {
  it('matches a pop-up with no condition for everyone', () => {
    expect(conditionsMatch(popup(), visitor())).toBe(true)
    expect(conditionsMatch(popup(), visitor({ loggedIn: null }))).toBe(true)
  })

  it('does not match a login condition before the session is known', () => {
    expect(conditionsMatch(popup({ login: 'loggedOut' }), visitor({ loggedIn: null }))).toBe(false)
    expect(conditionsMatch(popup({ login: 'both' }), visitor({ loggedIn: null }))).toBe(true)
  })

  it('tells a logged-in visitor from a guest', () => {
    expect(conditionsMatch(popup({ login: 'loggedIn' }), visitor({ loggedIn: true }))).toBe(true)
    expect(conditionsMatch(popup({ login: 'loggedIn' }), visitor())).toBe(false)
    expect(conditionsMatch(popup({ login: 'loggedOut' }), visitor())).toBe(true)
  })

  it('matches an activity condition only for a client whose activity is known', () => {
    expect(conditionsMatch(popup({ activity: 'active' }), visitor({ loggedIn: true, active: true }))).toBe(true)
    expect(conditionsMatch(popup({ activity: 'inactive' }), visitor({ loggedIn: true, active: true }))).toBe(false)
    expect(conditionsMatch(popup({ activity: 'inactive' }), visitor({ loggedIn: true, active: false }))).toBe(true)
    expect(conditionsMatch(popup({ activity: 'inactive' }), visitor())).toBe(false)
    expect(conditionsMatch(popup({ activity: 'both' }), visitor())).toBe(true)
  })

  it('matches the order source asked for, or any of them', () => {
    const withSources = (...sources: ('draft' | 'last' | 'favorite')[]) => visitor({ order: { total: 0, hasOrder: false, sources } })
    expect(conditionsMatch(popup({ orderSource: 'any' }), visitor())).toBe(false)
    expect(conditionsMatch(popup({ orderSource: 'any' }), withSources('favorite'))).toBe(true)
    expect(conditionsMatch(popup({ orderSource: 'last' }), withSources('draft'))).toBe(false)
    expect(conditionsMatch(popup({ orderSource: 'last' }), withSources('last'))).toBe(true)
  })

  it('matches the order total strictly above the minimum and strictly below the maximum', () => {
    const order = (total: number) => visitor({ order: { total, hasOrder: total > 0, sources: [] } })
    const between = popup({ orderTotal: true, minTotal: 50, maxTotal: 100 })
    expect(conditionsMatch(between, order(50))).toBe(false)
    expect(conditionsMatch(between, order(75))).toBe(true)
    expect(conditionsMatch(between, order(100))).toBe(false)
    expect(conditionsMatch(popup({ orderTotal: true, minTotal: 50 }), order(500))).toBe(true)
    expect(conditionsMatch(popup({ orderTotal: true, maxTotal: 50 }), order(20))).toBe(true)
    expect(conditionsMatch(popup({ orderTotal: true }), order(0))).toBe(false)
    expect(conditionsMatch(popup({ orderTotal: true }), order(10))).toBe(true)
  })

  it('needs every condition that is on', () => {
    const p = popup({ login: 'loggedIn', orderTotal: true, minTotal: 50 })
    expect(conditionsMatch(p, visitor({ loggedIn: true, order: { total: 60, hasOrder: true, sources: [] } }))).toBe(true)
    expect(conditionsMatch(p, visitor({ loggedIn: true, order: { total: 40, hasOrder: true, sources: [] } }))).toBe(false)
    expect(conditionsMatch(p, visitor({ loggedIn: false, order: { total: 60, hasOrder: true, sources: [] } }))).toBe(false)
  })
})
