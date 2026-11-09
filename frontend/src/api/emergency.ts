import { apiJson, send } from './client'

/** Emergency mode (FoodSite.Api `EmergencyController`): `phone` and `message` are what was saved (null: the default); `effectivePhone` is the number clients are told to call. */
export interface Emergency {
  enabled: boolean
  phone: string | null
  message: string | null
  effectivePhone: string | null
}

export type EmergencyInput = Pick<Emergency, 'enabled' | 'phone' | 'message'>

export const EMERGENCY_MESSAGE_MAX = 500

export const emergencyApi = {
  get: () => apiJson<Emergency>('/api/admin/emergency'),
  save: (input: EmergencyInput) => apiJson<Emergency>('/api/admin/emergency', send('PUT', input)),
}

/** The number as a `tel:` address: digits and a leading plus only. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
