import { describe, expect, it } from 'vitest'
import type { AdminOrder } from '../../api/operations'
import {
  addressParts,
  defaultEstimate,
  formatMinutes,
  navigationAddress,
  routeOrder,
  schedule,
  travelMinutes,
  wazeUrl,
} from './plan'

const order = (id: number, address: string, deliveryHour: string | null = null): AdminOrder => ({
  id,
  phone: '0501234567',
  name: `לקוח ${id}`,
  address,
  supplyDate: '2030-01-06',
  fulfillmentMethod: 'Delivery',
  notes: null,
  paymentMethod: 'OnDelivery',
  isPaid: false,
  paidWith: null,
  paymentComment: null,
  status: 'New',
  total: 100,
  createdAt: '2030-01-01T10:00:00Z',
  isGuest: false,
  needsReview: false,
  deliveryHour,
  hourFull: false,
  items: [],
})

const kitchen = 'הנשיא 3, אשקלון'

describe('route plan', () => {
  it('reads the city and street from an order address', () => {
    expect(addressParts('הרצל 12, דירה 5, אשקלון')).toEqual({ city: 'אשקלון', street: 'הרצל' })
    expect(addressParts('הרצל 12')).toEqual({ city: '', street: 'הרצל' })
  })

  it('guesses a leg from the addresses: same street, same city or another city', () => {
    expect(travelMinutes('הרצל 1, אשקלון', 'הרצל 9, אשקלון', defaultEstimate)).toBe(3)
    expect(travelMinutes('הרצל 1, אשקלון', 'בן גוריון 2, אשקלון', defaultEstimate)).toBe(10)
    expect(travelMinutes('הרצל 1, אשקלון', 'הרצל 1, אשדוד', defaultEstimate)).toBe(25)
    expect(travelMinutes(null, 'הרצל 1, אשדוד', defaultEstimate)).toBe(10)
  })

  it('drives by the hour asked for, then to the closest next address, with no-hour orders last', () => {
    const orders = [
      order(1, 'הרצל 1, אשדוד', '09:00:00'),
      order(2, 'בן גוריון 2, אשקלון'),
      order(3, 'רוטשילד 4, אשקלון', '09:00:00'),
      order(4, 'הרצל 7, אשדוד', '08:00:00'),
      order(5, 'הרצל 3, אשדוד', '09:00:00'),
    ]
    // At 9:00 the driver is in Ashdod after order 4, so the Ashdod stops come before Ashkelon.
    expect(routeOrder(orders, kitchen, defaultEstimate).map((o) => o.id)).toEqual([4, 1, 5, 3, 2])
  })

  it('times the first stop for the start of its hour and later stops as soon as the driver gets there', () => {
    const route = [order(1, 'הרצל 1, אשקלון', '09:00:00'), order(2, 'הרצל 5, אשקלון', '09:00:00'), order(3, 'הרצל 1, אשדוד', '11:00:00')]
    const stops = schedule(route, kitchen, defaultEstimate)

    expect(stops.map((s) => [formatMinutes(s.leave), formatMinutes(s.arrive), s.late])).toEqual([
      ['08:50', '09:00', false],
      // 5 minutes at the door, then 3 minutes down the street.
      ['09:05', '09:08', false],
      // Free at 09:13, but the client asked for 11:00: leave in time to get there at 11:00.
      ['10:35', '11:00', false],
    ])
  })

  it('flags a stop reached after the hour asked for, and starts at the time given', () => {
    const route = [order(1, 'הרצל 1, אשקלון', '09:00:00'), order(2, 'הרצל 1, אשדוד', '09:00:00')]
    const stops = schedule(route, kitchen, { sameCity: 10, otherCity: 70, atStop: 5 }, 9 * 60 + 30)
    expect(stops.map((s) => [formatMinutes(s.arrive), s.late])).toEqual([
      ['09:40', false],
      ['10:55', true],
    ])
  })

  it('starts at nine when no order asks for an hour', () => {
    expect(formatMinutes(schedule([order(1, 'הרצל 1, אשקלון')], kitchen, defaultEstimate)[0].arrive)).toBe('09:00')
  })

  it('builds a Waze link without the apartment', () => {
    const address = navigationAddress('הרצל 12, דירה 5, אשקלון', 'דירה')
    expect(address).toBe('הרצל 12, אשקלון')
    expect(wazeUrl(address)).toBe(`https://waze.com/ul?q=${encodeURIComponent('הרצל 12, אשקלון')}&navigate=yes`)
  })
})
