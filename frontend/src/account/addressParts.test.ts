import { describe, expect, it } from 'vitest'
import { addressOf, emptyAddress, formatAddress, sameAddress } from './addressParts'

const apartment = (a: string) => `דירה ${a}`
const building = (type: string) => (type === 'Building' ? 'בנין' : 'בית פרטי')
const herzl = { ...emptyAddress(), city: 'חיפה', street: 'הרצל', houseNumber: '12', apartment: '5' }

describe('formatAddress', () => {
  it('adds the building type after the apartment when it was chosen', () => {
    expect(formatAddress({ ...herzl, buildingType: 'Building' }, apartment, building)).toBe('הרצל 12, דירה 5, בנין, חיפה')
    expect(formatAddress({ ...herzl, apartment: '', buildingType: 'PrivateHouse' }, apartment, building)).toBe('הרצל 12, בית פרטי, חיפה')
  })

  it('adds an office, and "other" with the text the client wrote', () => {
    const label = (type: string) => ({ Building: 'בנין', PrivateHouse: 'בית פרטי', Office: 'משרד', Other: 'אחר' })[type] ?? ''
    expect(formatAddress({ ...herzl, apartment: '', buildingType: 'Office' }, apartment, label)).toBe('הרצל 12, משרד, חיפה')
    expect(formatAddress({ ...herzl, apartment: '', buildingType: 'Other', buildingOther: ' חנות, קומה 2 ' }, apartment, label)).toBe('הרצל 12, אחר: חנות קומה 2, חיפה')
    expect(formatAddress({ ...herzl, apartment: '', buildingType: 'Other', buildingOther: '' }, apartment, label)).toBe('הרצל 12, אחר, חיפה')
  })

  it('drops the text of "other" when another type is chosen', () => {
    expect(addressOf({ ...herzl, buildingType: 'Office', buildingOther: 'חנות' }).buildingOther).toBe('')
  })

  it('skips it when not set', () => {
    expect(formatAddress(herzl, apartment, building)).toBe('הרצל 12, דירה 5, חיפה')
  })
})

describe('sameAddress', () => {
  it('tells addresses apart by building type', () => {
    expect(sameAddress(herzl, { ...herzl, buildingType: 'Building' })).toBe(false)
    expect(sameAddress(herzl, { ...herzl })).toBe(true)
    const other = { ...herzl, buildingType: 'Other' as const, buildingOther: 'חנות' }
    expect(sameAddress(other, { ...other, buildingOther: 'מחסן' })).toBe(false)
  })
})
