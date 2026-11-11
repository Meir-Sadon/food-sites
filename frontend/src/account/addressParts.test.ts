import { describe, expect, it } from 'vitest'
import { emptyAddress, formatAddress, sameAddress } from './addressParts'

const apartment = (a: string) => `דירה ${a}`
const building = (type: string) => (type === 'Building' ? 'בניין' : 'בית פרטי')
const herzl = { ...emptyAddress(), city: 'חיפה', street: 'הרצל', houseNumber: '12', apartment: '5' }

describe('formatAddress', () => {
  it('adds the building type after the apartment when it was chosen', () => {
    expect(formatAddress({ ...herzl, buildingType: 'Building' }, apartment, building)).toBe('הרצל 12, דירה 5, בניין, חיפה')
    expect(formatAddress({ ...herzl, apartment: '', buildingType: 'PrivateHouse' }, apartment, building)).toBe('הרצל 12, בית פרטי, חיפה')
  })

  it('skips it when not set', () => {
    expect(formatAddress(herzl, apartment, building)).toBe('הרצל 12, דירה 5, חיפה')
  })
})

describe('sameAddress', () => {
  it('tells addresses apart by building type', () => {
    expect(sameAddress(herzl, { ...herzl, buildingType: 'Building' })).toBe(false)
    expect(sameAddress(herzl, { ...herzl })).toBe(true)
  })
})
