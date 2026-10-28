import { apiJson, send } from './client'

/** The sizes of the entry pop-up (FoodSite.Api `EntryPopup.Sizes`). */
export const POPUP_SIZES = ['small', 'medium', 'large'] as const
export type PopupSize = (typeof POPUP_SIZES)[number]

/** `always`: on every page load; `session`: once until the browser tab is closed. */
export const POPUP_FREQUENCIES = ['always', 'session'] as const
export type PopupFrequency = (typeof POPUP_FREQUENCIES)[number]

/** `load`: when the page has loaded; `exit`: only when the visitor seems about to leave. */
export const POPUP_TRIGGERS = ['load', 'exit'] as const
export type PopupTrigger = (typeof POPUP_TRIGGERS)[number]

export const POPUP_MAX_DELAY_SECONDS = 120

/** How many pop-ups the admin can set up (FoodSite.Api `EntryPopup.MaxPopups`). */
export const POPUP_SLOTS = [1, 2, 3] as const

/** Condition: whether the visitor is logged in. `both` is the same as no condition. */
export const POPUP_LOGIN_CHOICES = ['loggedIn', 'loggedOut', 'both'] as const
export type PopupLogin = (typeof POPUP_LOGIN_CHOICES)[number]

/** Condition: whether a logged-in client ordered within the site's inactivity period (`Site.inactiveAfter`). */
export const POPUP_ACTIVITY_CHOICES = ['active', 'inactive', 'both'] as const
export type PopupActivity = (typeof POPUP_ACTIVITY_CHOICES)[number]

/** Condition: an order was restored from the browser's draft, or filled from the last or a favorite order (`any`: one of them). */
export const POPUP_ORDER_SOURCES = ['any', 'draft', 'last', 'favorite'] as const
export type PopupOrderSource = (typeof POPUP_ORDER_SOURCES)[number]

export const POPUP_MAX_TOTAL = 100000

export const POPUP_LIMITS = { title: 80, body: 600, buttonText: 30, buttonUrl: 500 } as const

/** The window shown when the site opens. In `GET /api/site` it is there only while it is on and has something to say. */
export interface Popup {
  /** Which of the pop-ups this is, from 1. */
  slot: number
  enabled: boolean
  size: PopupSize
  frequency: PopupFrequency
  trigger: PopupTrigger
  /** Seconds to wait before it opens (or before leaving is watched for). */
  delaySeconds: number
  title: string | null
  body: string | null
  imageUrl: string | null
  buttonText: string | null
  buttonUrl: string | null
  /**
   * The conditions: a visitor is shown the pop-up only when every one that is on matches. `null` means the condition is off
   * (`orderTotal` false). The trigger `exit` is the condition "when the visitor seems about to leave".
   */
  login: PopupLogin | null
  activity: PopupActivity | null
  orderSource: PopupOrderSource | null
  /** Only while there is an order in progress whose total is above `minTotal` and below `maxTotal` (a missing limit is no limit). */
  orderTotal: boolean
  minTotal: number | null
  maxTotal: number | null
}

export type PopupInput = Pick<
  Popup,
  'enabled' | 'size' | 'frequency' | 'trigger' | 'delaySeconds' | 'title' | 'body' | 'buttonText' | 'buttonUrl' | 'login' | 'activity' | 'orderSource' | 'orderTotal' | 'minTotal' | 'maxTotal'
>

function upload(file: File): RequestInit {
  const form = new FormData()
  form.append('file', file)
  return { method: 'PUT', body: form }
}

const slotUrl = (slot: number) => `/api/admin/popups/${slot}`

export const popupApi = {
  list: () => apiJson<Popup[]>('/api/admin/popups'),
  save: (slot: number, input: PopupInput) => apiJson<Popup>(slotUrl(slot), send('PUT', input)),
  uploadImage: (slot: number, file: File) => apiJson<Popup>(`${slotUrl(slot)}/image`, upload(file)),
  removeImage: (slot: number) => apiJson<Popup>(`${slotUrl(slot)}/image`, send('DELETE')),
}
