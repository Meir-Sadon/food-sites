import type { TrackingIds } from '../api/site'
import { EXCLUDED_KEY } from '../usage/track'
import { getConsent } from './consent'

/**
 * The owner's marketing tools (Meta Pixel, Google Analytics 4, Google Tag Manager, TikTok pixel), connected by an id in
 * the admin settings. A tool's script is added to the page only when its id is set; with no ids nothing is loaded and
 * nothing is sent. The ids are checked by the server (digits, `G-…`, `GTM-…`, letters and digits), so they are safe to
 * put in a script. Only client pages call this, never the admin, and a device the admin logged in on is left out.
 */

/** Off in tests unless a test turns it on, since a loaded script would try to reach the network. */
export const marketingTracking = { enabled: import.meta.env.MODE !== 'test' }

/** What the order page reports. Each tool gets it in its own words (Meta `ViewContent`, Google `view_item`, ...). */
export type MarketingEvent =
  | { name: 'PageView'; path: string }
  | { name: 'ViewContent'; dishId: number; dishName: string }
  | { name: 'AddToCart'; dishId: number; dishName: string }
  | { name: 'InitiateCheckout'; value: number }
  | { name: 'Purchase'; orderId: number; value: number }

const CURRENCY = 'ILS'

type Tool = 'meta' | 'analytics' | 'tagManager' | 'tikTok' | 'ads'

interface Loaded {
  /** The last path this tool was told about, so a re-render never repeats a page view. */
  lastPath: string | null
}

const loaded = new Map<Tool, Loaded>()
/** Events that count once per page load (a client who starts checking out twice is one checkout). */
const sentOnce = new Set<string>()

// The tools put their functions on the window.
type Win = Window & Record<string, unknown>
const win = () => window as unknown as Win

function addScript(src: string) {
  const script = document.createElement('script')
  script.async = true
  script.src = src
  document.head.appendChild(script)
}

function ownerDevice(): boolean {
  try {
    return !!localStorage.getItem(EXCLUDED_KEY)
  } catch {
    return false
  }
}

function dataLayer(): unknown[] {
  const w = win()
  return (w.dataLayer ??= []) as unknown[]
}

/** Google's `gtag` pushes its `arguments` object itself, which is what the script looks for. */
function gtag(..._args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  dataLayer().push(arguments)
}

function loadMeta(id: string) {
  const w = win()
  if (!w.fbq) {
    const fbq = function (...args: unknown[]) {
      const call = fbq as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] }
      if (call.callMethod) call.callMethod(...args)
      else call.queue.push(args)
    }
    Object.assign(fbq, { push: fbq, loaded: true, version: '2.0', queue: [] })
    w.fbq = fbq
    w._fbq = fbq
    addScript('https://connect.facebook.net/en_US/fbevents.js')
  }
  ;(w.fbq as (...a: unknown[]) => void)('init', id)
}

/** Google's one `gtag.js` serves Analytics and Ads: set it up once, then add each id with `config`. */
function ensureGtag(firstId: string) {
  const w = win()
  if (w.gtag) return
  w.gtag = gtag
  gtag('js', new Date())
  addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(firstId)}`)
}

function loadAnalytics(id: string) {
  ensureGtag(id)
  // A single-page site sends its own page views as the client moves between pages.
  gtag('config', id, { send_page_view: false })
}

/** The Ads tag counts visits for remarketing by itself; the order is counted by `Purchase`. */
function loadAds(id: string) {
  ensureGtag(id)
  gtag('config', id)
}

function loadTagManager(id: string) {
  dataLayer().push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  addScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`)
}

/** TikTok's own loader, written out: it queues calls until `events.js` arrives and replays them. */
function loadTikTok(id: string) {
  const w = win()
  type Ttq = unknown[] & Record<string, unknown>
  const ttq = ((w.ttq as Ttq | undefined) ??= [] as unknown as Ttq)
  w.TiktokAnalyticsObject = 'ttq'
  const methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie']
  ttq.methods = methods
  for (const method of methods) ttq[method] = (...args: unknown[]) => ttq.push([method, ...args])
  const src = 'https://analytics.tiktok.com/i18n/pixel/events.js'
  ttq._i = { [id]: [] }
  ;(ttq._i as Record<string, Record<string, unknown>>)[id]._u = src
  ttq._t = { [id]: Date.now() }
  ttq._o = { [id]: {} }
  addScript(`${src}?sdkid=${encodeURIComponent(id)}&lib=ttq`)
}

/** Adds the script of every tool that has an id and is not on the page yet. Safe to call again with the same ids. */
let adsConversion = ''

export function initMarketing(ids: TrackingIds | null | undefined) {
  if (!ids || !marketingTracking.enabled || ownerDevice() || getConsent() !== 'granted') return
  if (typeof navigator !== 'undefined' && navigator.webdriver) return
  const start = (tool: Tool, id: string, load: (id: string) => void) => {
    if (!id || loaded.has(tool)) return
    loaded.set(tool, { lastPath: null })
    load(id)
  }
  start('meta', ids.metaPixelId, loadMeta)
  start('analytics', ids.googleAnalyticsId, loadAnalytics)
  start('tagManager', ids.googleTagManagerId, loadTagManager)
  start('tikTok', ids.tikTokPixelId, loadTikTok)
  start('ads', ids.googleAdsId, loadAds)
  adsConversion = ids.googleAdsId && ids.googleAdsPurchaseLabel ? `${ids.googleAdsId}/${ids.googleAdsPurchaseLabel}` : ''
}

const fbq = (...args: unknown[]) => (win().fbq as ((...a: unknown[]) => void) | undefined)?.(...args)
const gtagCall = (...args: unknown[]) => (win().gtag as ((...a: unknown[]) => void) | undefined)?.(...args)
const ttq = (method: string, ...args: unknown[]) => (win().ttq as Record<string, ((...a: unknown[]) => void) | undefined> | undefined)?.[method]?.(...args)

function sendMeta(event: MarketingEvent) {
  switch (event.name) {
    case 'PageView':
      return fbq('track', 'PageView')
    case 'ViewContent':
    case 'AddToCart':
      return fbq('track', event.name, { content_type: 'product', content_ids: [String(event.dishId)], content_name: event.dishName })
    case 'InitiateCheckout':
      return fbq('track', 'InitiateCheckout', { value: event.value, currency: CURRENCY })
    case 'Purchase':
      // The order id lets Meta drop a repeat of the same order.
      return fbq('track', 'Purchase', { value: event.value, currency: CURRENCY }, { eventID: `order-${event.orderId}` })
  }
}

/** Google's names for the same events (Analytics 4 e-commerce, which Tag Manager reads from the data layer too). */
function googleEvent(event: MarketingEvent): { name: string; params: Record<string, unknown> } {
  switch (event.name) {
    case 'PageView':
      return { name: 'page_view', params: { page_path: event.path, page_location: window.location.href, page_title: document.title } }
    case 'ViewContent':
      return { name: 'view_item', params: { items: [{ item_id: String(event.dishId), item_name: event.dishName }] } }
    case 'AddToCart':
      return { name: 'add_to_cart', params: { currency: CURRENCY, items: [{ item_id: String(event.dishId), item_name: event.dishName }] } }
    case 'InitiateCheckout':
      return { name: 'begin_checkout', params: { currency: CURRENCY, value: event.value } }
    case 'Purchase':
      return { name: 'purchase', params: { transaction_id: String(event.orderId), currency: CURRENCY, value: event.value } }
  }
}

function sendTikTok(event: MarketingEvent) {
  switch (event.name) {
    case 'PageView':
      return ttq('page')
    case 'ViewContent':
    case 'AddToCart':
      return ttq('track', event.name, { content_type: 'product', contents: [{ content_id: String(event.dishId), content_name: event.dishName }] })
    case 'InitiateCheckout':
      return ttq('track', 'InitiateCheckout', { value: event.value, currency: CURRENCY })
    case 'Purchase':
      return ttq('track', 'CompletePayment', { value: event.value, currency: CURRENCY })
  }
}

/** Tells every connected tool about `event`. Never throws: a blocked or broken tool must not break ordering. */
export function trackMarketing(event: MarketingEvent) {
  if (loaded.size === 0) return
  try {
    if (event.name === 'InitiateCheckout') {
      if (sentOnce.has(event.name)) return
      sentOnce.add(event.name)
    }
    if (event.name === 'PageView') {
      // Each tool hears about a page once, however often the page renders.
      const fresh = [...loaded.entries()].filter(([, state]) => state.lastPath !== event.path)
      for (const [tool, state] of fresh) {
        state.lastPath = event.path
        if (tool === 'meta') sendMeta(event)
        if (tool === 'tikTok') sendTikTok(event)
      }
      if (fresh.some(([tool]) => tool === 'analytics' || tool === 'tagManager')) sendGoogle(event, fresh.map(([tool]) => tool))
      return
    }
    if (loaded.has('meta')) sendMeta(event)
    if (loaded.has('tikTok')) sendTikTok(event)
    sendGoogle(event, [...loaded.keys()])
    if (event.name === 'Purchase' && loaded.has('ads') && adsConversion)
      gtagCall('event', 'conversion', { send_to: adsConversion, value: event.value, currency: CURRENCY, transaction_id: String(event.orderId) })
  } catch {
    // A tool that fails is simply not reported to.
  }
}

function sendGoogle(event: MarketingEvent, tools: Tool[]) {
  const { name, params } = googleEvent(event)
  if (tools.includes('analytics')) gtagCall('event', name, params)
  // Without Analytics, Tag Manager gets the event from the data layer; with it, gtag has already put it there.
  if (tools.includes('tagManager') && !loaded.has('analytics')) dataLayer().push({ event: name, ...params })
}

/** For tests: forget what was loaded and sent. */
export function resetMarketingForTests() {
  loaded.clear()
  sentOnce.clear()
  adsConversion = ''
  const w = win()
  for (const key of ['fbq', '_fbq', 'gtag', 'dataLayer', 'ttq', 'TiktokAnalyticsObject']) delete w[key]
  document.head.querySelectorAll('script[src*="fbevents"], script[src*="googletagmanager"], script[src*="tiktok"]').forEach((el) => el.remove())
}

/** Whether any tool has an id: the site then asks the visitor for consent and its privacy text names the tools. */
export function hasMarketingTools(ids: TrackingIds | null | undefined): boolean {
  return !!ids && !!(ids.metaPixelId || ids.googleAnalyticsId || ids.googleTagManagerId || ids.tikTokPixelId || ids.googleAdsId)
}

const cookie = (name: string) => document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1)

/** What the server needs to report the order to Meta too: only with the visitor's consent. */
export function marketingForOrder(ids: TrackingIds | null | undefined): { consent: true; fbp?: string; fbc?: string; sourceUrl?: string } | undefined {
  if (!ids?.metaServerEvents || !ids.metaPixelId || !marketingTracking.enabled || ownerDevice() || getConsent() !== 'granted') return undefined
  return { consent: true, fbp: cookie('_fbp'), fbc: cookie('_fbc'), sourceUrl: window.location.origin + window.location.pathname }
}
