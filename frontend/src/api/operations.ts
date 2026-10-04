import { apiJson, apiUrl, send } from './client'
import type { Fulfillment, Payment } from './site'

export type OrderStatus = 'New' | 'Confirmed' | 'Ready' | 'Delivered' | 'Cancelled'
export const orderStatuses: OrderStatus[] = ['New', 'Confirmed', 'Ready', 'Delivered', 'Cancelled']

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
  status: OrderStatus
  total: number
  createdAt: string
  isGuest: boolean
  items: AdminOrderItem[]
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
  setPaid: (id: number, isPaid: boolean) => apiJson<void>(`${orders}/${id}/paid`, send('PUT', { isPaid })),
  update: (id: number, input: AdminOrderInput) => apiJson<AdminOrder>(`${orders}/${id}`, send('PUT', input)),
}

export const reportsApi = {
  get: (filter: ReportFilter) => apiJson<Report>(`/api/admin/reports${queryString(filter)}`),
  exportUrl: (filter: ReportFilter) => apiUrl(`/api/admin/reports/export${queryString(filter)}`),
}
