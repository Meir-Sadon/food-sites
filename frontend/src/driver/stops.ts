import { useOutletContext } from 'react-router'
import type { DriverRoute, DriverStop } from '../api/driver'

export interface DriverContext {
  token: string
  route: DriverRoute
  /** Puts a stop the API sent back in place. */
  updateStop: (stop: DriverStop) => void
}

export const useDriver = () => useOutletContext<DriverContext>()

/** Still to visit: not reported and not cancelled. */
export const isOpen = (stop: DriverStop) => stop.outcome === null && !stop.cancelled

/** What the driver collects at this door: nothing once paid, unless the driver recorded the payment. */
export const toCollect = (stop: DriverStop) => (stop.isPaid && !stop.paidByDriver) || stop.cancelled ? 0 : stop.total
