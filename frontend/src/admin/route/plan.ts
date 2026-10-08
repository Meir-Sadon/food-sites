import type { AdminOrder } from '../../api/operations'

/**
 * How long the driver's legs take, in minutes. There is no map service, so a leg is guessed from the
 * addresses alone: the same street, the same city, or another city.
 */
export interface TravelEstimate {
  sameCity: number
  otherCity: number
  /** Time at each door: parking, handing over, collecting payment. */
  atStop: number
}

export const defaultEstimate: TravelEstimate = { sameCity: 10, otherCity: 25, atStop: 5 }

/** A stop on the route, with the times worked out for it (minutes from midnight). */
export interface Stop {
  order: AdminOrder
  /** Minutes from the previous stop (or the kitchen for the first). */
  travel: number
  /** When to leave the previous stop (or the kitchen) to get here on time. */
  leave: number
  arrive: number
  /** The hour the client asked for, as minutes, or null. */
  windowFrom: number | null
  /** Arriving after the hour the client asked for has passed. */
  late: boolean
}

/** One hour slot; the last slot of a day may be shorter, which the order doesn't record. */
const SLOT_MINUTES = 60
/** Leave the kitchen at this time when no order asks for an hour. */
export const DEFAULT_START = 9 * 60

export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export const formatMinutes = (minutes: number) => {
  const day = ((Math.round(minutes) % 1440) + 1440) % 1440
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(day / 60))}:${pad(day % 60)}`
}

/**
 * The parts of an order's address line ("Herzl 12, apartment 5, Haifa"): the city is the last part,
 * the street the first one without its house number. An address the admin typed freely may have neither.
 */
export function addressParts(address: string) {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  const city = parts.length > 1 ? parts[parts.length - 1] : ''
  const street = (parts[0] ?? '').replace(/\s*\d+\S*$/, '')
  return { city: city.toLowerCase(), street: street.toLowerCase() }
}

/** The guessed minutes between two addresses; from null is from the kitchen. */
export function travelMinutes(from: string | null, to: string, estimate: TravelEstimate): number {
  if (from === null) return estimate.sameCity
  const a = addressParts(from)
  const b = addressParts(to)
  if (a.city !== b.city) return estimate.otherCity
  // On the same street the next door is close by.
  if (a.street && a.street === b.street) return Math.max(1, Math.round(estimate.sameCity / 3))
  return estimate.sameCity
}

/**
 * The order to drive in: by the hour asked for (orders without an hour last), and within each hour
 * always the closest next address, starting from wherever the previous hour ended.
 */
export function routeOrder(orders: AdminOrder[], kitchen: string | null, estimate: TravelEstimate): AdminOrder[] {
  const hourOf = (o: AdminOrder) => (o.deliveryHour ? toMinutes(o.deliveryHour) : Number.POSITIVE_INFINITY)
  const hours = [...new Set(orders.map(hourOf))].sort((a, b) => a - b)
  const route: AdminOrder[] = []
  let at = kitchen
  for (const hour of hours) {
    const left = orders.filter((o) => hourOf(o) === hour).sort((a, b) => a.id - b.id)
    while (left.length > 0) {
      let best = 0
      for (let i = 1; i < left.length; i++)
        if (travelMinutes(at, left[i].address, estimate) < travelMinutes(at, left[best].address, estimate)) best = i
      const [next] = left.splice(best, 1)
      route.push(next)
      at = next.address
    }
  }
  return route
}

/**
 * Times for a route in the given order. The first stop is reached at the start of its hour (or the
 * driver leaves at `start` when set); each later stop is reached as soon as the driver can get there,
 * but not before its hour starts.
 */
export function schedule(
  route: AdminOrder[], kitchen: string | null, estimate: TravelEstimate, start: number | null = null,
): Stop[] {
  const stops: Stop[] = []
  let at = kitchen
  let free: number | null = start
  for (const order of route) {
    const travel = travelMinutes(at, order.address, estimate)
    const windowFrom = order.deliveryHour ? toMinutes(order.deliveryHour) : null
    // The driver's first leg is timed to reach the first stop as its hour starts.
    if (free === null) free = (windowFrom ?? (firstHour(route) ?? DEFAULT_START)) - travel
    const arrive = Math.max(free + travel, windowFrom ?? Number.NEGATIVE_INFINITY)
    stops.push({
      order,
      travel,
      leave: arrive - travel,
      arrive,
      windowFrom,
      late: windowFrom !== null && arrive > windowFrom + SLOT_MINUTES,
    })
    free = arrive + estimate.atStop
    at = order.address
  }
  return stops
}

function firstHour(route: AdminOrder[]): number | null {
  const hours = route.filter((o) => o.deliveryHour).map((o) => toMinutes(o.deliveryHour!))
  return hours.length > 0 ? Math.min(...hours) : null
}

/** The address as a navigation app should search it: the apartment part (e.g. "דירה 4") left out. */
export function navigationAddress(address: string, apartmentPrefix: string): string {
  return address
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !(apartmentPrefix && p.startsWith(`${apartmentPrefix} `)))
    .join(', ')
}

export const wazeUrl = (address: string) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
