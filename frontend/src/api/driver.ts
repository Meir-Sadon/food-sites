import { apiJson, send } from './client'
import type { PaidWith } from './operations'
import type { Payment } from './site'

export const DELIVERY_NOTE_MAX_LENGTH = 300
export const DRIVER_PAYMENT_COMMENT_MAX_LENGTH = 200

export type DeliveryOutcome = 'Delivered' | 'NotDelivered'

export interface DriverItem {
  id: number
  parentItemId: number | null
  dishName: string
  optionLabel: string | null
  quantity: number
}

/** One stop on the driver's page: only what the driver needs at the door. */
export interface DriverStop {
  orderId: number
  position: number
  /** When the admin's report expected the driver here, "HH:mm:ss", or null. */
  plannedArrival: string | null
  name: string
  phone: string
  address: string
  deliveryHour: string | null
  notes: string | null
  items: DriverItem[]
  total: number
  paymentMethod: Payment
  isPaid: boolean
  paidWith: PaidWith | null
  /** Only the driver's own comment; the admin's stays in the admin. */
  paymentComment: string | null
  paidByDriver: boolean
  cancelled: boolean
  outcome: DeliveryOutcome | null
  reportedAt: string | null
  deliveryNote: string | null
  proofUrl: string | null
}

export interface DriverRoute {
  /** "yyyy-MM-dd" */
  date: string
  /** The last day the link works, "yyyy-MM-dd". */
  validThrough: string
  stops: DriverStop[]
}

export interface DeliveryInput {
  outcome: DeliveryOutcome
  /** How the driver collected the payment; null when nothing was collected. */
  paidWith: PaidWith | null
  paymentComment: string
  note: string
}

const driver = (token: string, path = '') => `/api/driver/${encodeURIComponent(token)}${path}`

export const driverApi = {
  route: (token: string) => apiJson<DriverRoute>(driver(token)),
  report: (token: string, orderId: number, input: DeliveryInput) =>
    apiJson<DriverStop>(driver(token, `/orders/${orderId}/delivery`), send('PUT', input)),
  undo: (token: string, orderId: number) => apiJson<DriverStop>(driver(token, `/orders/${orderId}/delivery`), send('DELETE')),
  addProof: (token: string, orderId: number, file: Blob, fileName: string) => {
    const form = new FormData()
    form.append('file', file, fileName)
    return apiJson<DriverStop>(driver(token, `/orders/${orderId}/proof`), { method: 'POST', body: form })
  },
  removeProof: (token: string, orderId: number) => apiJson<DriverStop>(driver(token, `/orders/${orderId}/proof`), send('DELETE')),
}

/** A link the admin sent a driver, as the admin's report lists it. */
export interface DriverLink {
  id: number
  token: string
  date: string
  validThrough: string
  createdAt: string
  /** The stops' orders, in driving order. */
  orderIds: number[]
  /** How many stops the driver reported. */
  reported: number
}

export interface DriverLinkInput {
  date: string
  stops: { orderId: number; plannedArrival: string | null }[]
}

const links = '/api/admin/driver-routes'

export const driverLinksApi = {
  list: (date: string) => apiJson<DriverLink[]>(`${links}?date=${date}`),
  create: (input: DriverLinkInput) => apiJson<DriverLink>(links, send('POST', input)),
  remove: (id: number) => apiJson<void>(`${links}/${id}`, send('DELETE')),
}

/** The address of a driver's page on this site; with an order, that stop's page. */
export const driverUrl = (token: string, orderId?: number, origin = window.location.origin) =>
  `${origin}/d/${token}${orderId === undefined ? '' : `/${orderId}`}`
