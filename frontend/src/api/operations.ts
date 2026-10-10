import { apiJson, apiUrl, send } from './client'
import type { Fulfillment, Payment } from './site'

export type OrderStatus = 'New' | 'Confirmed' | 'Ready' | 'Delivered' | 'Cancelled'
export const orderStatuses: OrderStatus[] = ['New', 'Confirmed', 'Ready', 'Delivered', 'Cancelled']

/** How a paid order was paid. Unknown is only on orders marked paid before this was recorded. */
export type PaidWith = 'Unknown' | 'Cash' | 'Bit' | 'PayBox' | 'BankTransfer' | 'CreditCard' | 'Other'
/** What the admin can pick when marking an order paid. */
export const paidWithChoices: PaidWith[] = ['Cash', 'Bit', 'PayBox', 'BankTransfer', 'CreditCard', 'Other']

export interface PaidInput {
  isPaid: boolean
  paidWith?: PaidWith
  paymentComment?: string
}

export interface AdminOrderItem {
  id: number
  parentItemId: number | null
  dishName: string
  optionLabel: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface AdminOrder {
  id: number
  phone: string
  name: string
  address: string
  /** "yyyy-MM-dd" */
  supplyDate: string
  fulfillmentMethod: Fulfillment
  notes: string | null
  paymentMethod: Payment
  isPaid: boolean
  /** Set while the order is paid. */
  paidWith: PaidWith | null
  paymentComment: string | null
  status: OrderStatus
  total: number
  createdAt: string
  isGuest: boolean
  /** Delivery outside the service city, waiting for the admin's approval. */
  needsReview: boolean
  items: AdminOrderItem[]
  /** The start of the hour the client asked for, "HH:mm:ss", or null. */
  deliveryHour: string | null
  /** The order came after its hour was already full: call the client to move it. */
  hourFull: boolean
}

export interface AdminOrderInput {
  name: string
  phone: string
  address: string
  supplyDate: string
  fulfillmentMethod: Fulfillment
  paymentMethod: Payment
  notes: string
  items: { id: number; quantity: number }[]
  deliveryHour: string | null
}

export interface OrderFilter {
  from?: string
  to?: string
  status?: OrderStatus | ''
}

export interface CookingSummary {
  date: string
  orderCount: number
  deliveryCount: number
  pickupCount: number
  /** Dishes ordered on their own, not side dishes; add-ons count as part of their dish. */
  mainDishCount: number
  /** Kinds of side dish ordered on their own, however many of each; one added to a dish counts zero. */
  sideDishCount: number
  rows: { dishId: number; dishName: string; optionLabel: string | null; quantity: number; orders: number }[]
}

export interface DishSales {
  dishId: number
  dishName: string
  quantity: number
  sales: number
}

export interface Report {
  orders: number
  sales: number
  weeks: { weekStart: string; orders: number; sales: number; dishes: DishSales[] }[]
  dishes: DishSales[]
}

export interface ReportFilter {
  from?: string
  to?: string
  dishId?: string
  categoryId?: string
  paymentMethod?: Payment | ''
}

/** "?a=1&b=2" from the filters that are filled in, or "". */
export function queryString(filter: object): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filter)) if (value) params.set(key, String(value))
  const text = params.toString()
  return text ? `?${text}` : ''
}

const orders = '/api/admin/orders'

export const ordersAdminApi = {
  list: (filter: OrderFilter) => apiJson<AdminOrder[]>(`${orders}${queryString(filter)}`),
  summary: (date: string) => apiJson<CookingSummary>(`${orders}/summary?date=${date}`),
  setStatus: (id: number, status: OrderStatus) => apiJson<void>(`${orders}/${id}/status`, send('PUT', { status })),
  approve: (id: number) => apiJson<void>(`${orders}/${id}/approve`, send('PUT')),
  setPaid: (id: number, input: PaidInput) => apiJson<void>(`${orders}/${id}/paid`, send('PUT', input)),
  update: (id: number, input: AdminOrderInput) => apiJson<AdminOrder>(`${orders}/${id}`, send('PUT', input)),
}

export const reportsApi = {
  get: (filter: ReportFilter) => apiJson<Report>(`/api/admin/reports${queryString(filter)}`),
  exportUrl: (filter: ReportFilter) => apiUrl(`/api/admin/reports/export${queryString(filter)}`),
}

// ---------- Site usage ----------

export interface UsageFunnel {
  /** Devices that opened the site. */
  visitors: number
  /** Of them, devices seen for the first time in the range. */
  newVisitors: number
  started: number
  submitted: number
}

export interface UsageDay {
  day: string
  visitors: number
  started: number
  submitted: number
  orders: number
}

export interface UsageOrders {
  orders: number
  sales: number
  averageOrder: number
  customers: number
  /** Customers in the range who have ordered more than once. */
  returningCustomers: number
  newCustomerOrders: number
  returningCustomerOrders: number
}

export interface UsageReport {
  from: string
  to: string
  /** The range reaches days whose per-device events were pruned: a device seen on several of them counts more than once. */
  approximate: boolean
  keptSince: string
  totalDevices: number
  funnel: UsageFunnel
  registered: { total: number; new: number }
  orders: UsageOrders
  days: UsageDay[]
  /** Sunday first. */
  ordersByWeekday: number[]
  ordersByHour: number[]
  topDishes: { dishName: string; quantity: number; sales: number }[]
}

export const usageApi = {
  get: (from: string, to: string) => apiJson<UsageReport>(`/api/admin/usage${queryString({ from, to })}`),
}
