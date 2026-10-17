import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrackingIds } from '../api/site'
import { confirmNoAdjustments } from '../test/adjust'
import { publicApi, settings, site } from '../test/catalogData'
import { adminSession, fakeApi, invalid } from '../test/fakeApi'
import { renderAt } from '../test/render'
import { EXCLUDED_KEY } from '../usage/track'
import { CONSENT_KEY } from './consent'
import { marketingTracking, resetMarketingForTests } from './marketing'

const none: TrackingIds = { metaPixelId: '', googleAnalyticsId: '', googleTagManagerId: '', tikTokPixelId: '', googleAdsId: '', googleAdsPurchaseLabel: '', metaServerEvents: false }
const all: TrackingIds = { metaPixelId: '123456789012345', googleAnalyticsId: 'G-ABC123XYZ9', googleTagManagerId: 'GTM-ABC123', tikTokPixelId: 'C1ABCDEF2GHIJKLMN3OP', googleAdsId: 'AW-123456789', googleAdsPurchaseLabel: 'AbC-dEf_123', metaServerEvents: true }

const confirmation = {
  id: 7,
  supplyDate: '2026-10-09',
  fulfillmentMethod: 'Delivery',
  paymentMethod: 'OnDelivery',
  total: 70,
  paymentPhone: null,
  needsReview: false,
  items: [{ dishName: 'עוף בתנור', optionLabel: 'שלם', quantity: 1, unitPrice: 70, lineTotal: 70, isAddOn: false }],
}

type Win = Window & { fbq?: { queue: unknown[][] }; dataLayer?: unknown[]; ttq?: unknown[][] }
const win = () => window as unknown as Win

/** What each tool was told, as name + payload. */
const metaCalls = () => (win().fbq?.queue ?? []).map(([method, name, data]) => [method, name, data])
const googleCalls = () => (win().dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>)).filter((call) => call[0] === 'event')
const tikTokCalls = () => (win().ttq ?? []).map((call) => (call as unknown[]).slice(0, 2))
const scripts = () => Array.from(document.head.querySelectorAll('script[src]')).map((el) => el.getAttribute('src') ?? '')

beforeEach(() => {
  localStorage.clear()
  // These tests are about what loads after a "yes"; the question itself is tested below.
  localStorage.setItem(CONSENT_KEY, 'granted')
  resetMarketingForTests()
  marketingTracking.enabled = true
})

afterEach(() => {
  marketingTracking.enabled = false
  resetMarketingForTests()
})

const withTracking = (tracking: TrackingIds) => ({ ...publicApi, 'GET /api/site': () => site({ tracking }), 'POST /api/orders': () => confirmation })

describe('Marketing tools on the client site', () => {
  it('loads nothing when no id is set', async () => {
    fakeApi(withTracking(none))
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    expect(scripts()).toEqual([])
    expect(win().fbq).toBeUndefined()
    expect(win().dataLayer).toBeUndefined()
  })

  it('loads only the tools that have an id', async () => {
    fakeApi(withTracking({ ...none, metaPixelId: all.metaPixelId }))
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    await waitFor(() => expect(scripts()).toEqual(['https://connect.facebook.net/en_US/fbevents.js']))
    expect(win().dataLayer).toBeUndefined()
    expect(metaCalls()).toEqual([['init', all.metaPixelId, undefined], ['track', 'PageView', undefined]])
  })

  it('reports the page, an added dish, the start of checkout and the sent order to every connected tool', async () => {
    const api = fakeApi(withTracking(all))
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    await waitFor(() => expect(scripts()).toHaveLength(4))
    expect(scripts()).toEqual(expect.arrayContaining([
      'https://connect.facebook.net/en_US/fbevents.js',
      'https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ9',
      'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123',
      'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=C1ABCDEF2GHIJKLMN3OP&lib=ttq',
    ]))

    const user = userEvent.setup()
    const card = screen.getByRole('article', { name: 'עוף בתנור' })
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוף בתנור' }))
    await confirmNoAdjustments(user)
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    await screen.findByRole('dialog')

    // Meta: the order id is also its event id, so a repeated purchase is dropped.
    expect(metaCalls()).toEqual([
      ['init', all.metaPixelId, undefined],
      ['track', 'PageView', undefined],
      ['track', 'AddToCart', { content_type: 'product', content_ids: ['1'], content_name: 'עוף בתנור' }],
      ['track', 'InitiateCheckout', { value: expect.any(Number), currency: 'ILS' }],
      ['track', 'Purchase', { value: 70, currency: 'ILS' }],
    ])
    expect(win().fbq?.queue.at(-1)?.[3]).toEqual({ eventID: 'order-7' })
    expect(googleCalls().map(([, name]) => name)).toEqual(['page_view', 'add_to_cart', 'begin_checkout', 'purchase', 'conversion'])
    expect(googleCalls().at(-2)).toEqual(['event', 'purchase', { transaction_id: '7', currency: 'ILS', value: 70 }])
    // The Ads conversion for a sent order, with the label the owner entered.
    expect(googleCalls().at(-1)).toEqual(['event', 'conversion', { send_to: 'AW-123456789/AbC-dEf_123', value: 70, currency: 'ILS', transaction_id: '7' }])
    // The server also reports the order to Meta, with the same event id the pixel used.
    expect(api.sent('POST', '/api/orders')[0].body).toMatchObject({ marketing: { consent: true, sourceUrl: expect.stringContaining('http') } })
    expect(tikTokCalls()).toEqual([['page'], ['track', 'AddToCart'], ['track', 'InitiateCheckout'], ['track', 'CompletePayment']])
  })

  it('counts a checkout once however often the client returns to the details', async () => {
    fakeApi(withTracking({ ...none, metaPixelId: all.metaPixelId }))
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    const user = userEvent.setup()
    const card = screen.getByRole('article', { name: 'עוף בתנור' })
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוף בתנור' }))
    await confirmNoAdjustments(user)
    await user.click(screen.getByLabelText('שם מלא'))
    await user.click(screen.getByLabelText('רחוב'))
    await user.click(screen.getByLabelText('שם מלא'))
    expect(metaCalls().filter(([, name]) => name === 'InitiateCheckout')).toHaveLength(1)
  })

  it('sends nothing from the admin’s device', async () => {
    localStorage.setItem(EXCLUDED_KEY, '1')
    fakeApi(withTracking(all))
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    expect(scripts()).toEqual([])
    expect(win().fbq).toBeUndefined()
  })

  it('does not load into the admin pages', async () => {
    fakeApi({ ...adminSession, ...withTracking(all), 'GET /api/admin/settings': () => settings({ tracking: all }), 'GET /api/admin/supply-days': () => [], 'GET /api/admin/closed-dates': () => [] })
    renderAt('/admin/settings')
    await screen.findByRole('heading', { level: 1, name: 'הגדרות כלליות' })
    expect(scripts()).toEqual([])
  })
})

describe('Cookie consent and the privacy text', () => {
  beforeEach(() => localStorage.clear())

  it('asks first, and loads nothing until the visitor agrees', async () => {
    fakeApi(withTracking(all))
    renderAt('/')
    const user = userEvent.setup()
    const banner = await screen.findByRole('region', { name: 'עוגיות ופרסום' })
    expect(banner).toHaveTextContent('Meta (פייסבוק ואינסטגרם), Google Analytics, Google Tag Manager, Google Ads, TikTok')
    expect(scripts()).toEqual([])

    await user.click(within(banner).getByRole('button', { name: 'אישור' }))
    await waitFor(() => expect(scripts()).toHaveLength(4))
    expect(screen.queryByRole('region', { name: 'עוגיות ופרסום' })).not.toBeInTheDocument()
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted')
  })

  it('keeps everything off after a "no" and does not ask again', async () => {
    fakeApi(withTracking(all))
    renderAt('/')
    const user = userEvent.setup()
    const banner = await screen.findByRole('region', { name: 'עוגיות ופרסום' })
    await user.click(within(banner).getByRole('button', { name: 'לא עכשיו' }))
    expect(scripts()).toEqual([])
    expect(win().fbq).toBeUndefined()
    expect(screen.queryByRole('region', { name: 'עוגיות ופרסום' })).not.toBeInTheDocument()
    // The footer lets the visitor change their mind.
    await user.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: 'הגדרות עוגיות' }))
    expect(await screen.findByRole('region', { name: 'עוגיות ופרסום' })).toBeInTheDocument()
  })

  it('shows no question when no tool is connected, and the policy says there is none', async () => {
    fakeApi(withTracking(none))
    renderAt('/')
    const user = userEvent.setup()
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    expect(screen.queryByRole('region', { name: 'עוגיות ופרסום' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('contentinfo')).queryByRole('button', { name: 'הגדרות עוגיות' })).not.toBeInTheDocument()
    await user.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: 'תנאי שימוש ומדיניות' }))
    expect(await screen.findByText(/אינו משתמש בשירותי מעקב או פרסום של צד שלישי/)).toBeInTheDocument()
  })

  it('writes the connected tools into the policy by itself', async () => {
    localStorage.setItem(CONSENT_KEY, 'denied')
    fakeApi(withTracking({ ...none, metaPixelId: all.metaPixelId, tikTokPixelId: all.tikTokPixelId, metaServerEvents: true }))
    renderAt('/')
    const user = userEvent.setup()
    await user.click(await within(await screen.findByRole('contentinfo')).findByRole('button', { name: 'תנאי שימוש ומדיניות' }))
    const policy = await screen.findByRole('dialog', { name: 'תנאי שימוש ומדיניות האתר' })
    expect(policy).toHaveTextContent('בשירותי מדידה ופרסום של צד שלישי: Meta (פייסבוק ואינסטגרם), TikTok')
    expect(policy).toHaveTextContent('מדווח עליה גם ל־Meta משרת האתר')
    expect(policy).not.toHaveTextContent('Google')
  })

  it('sends no marketing details with an order the visitor did not agree to', async () => {
    localStorage.setItem(CONSENT_KEY, 'denied')
    const api = fakeApi(withTracking(all))
    renderAt('/')
    await screen.findByRole('heading', { level: 2, name: 'עופות' })
    const user = userEvent.setup()
    const card = screen.getByRole('article', { name: 'עוף בתנור' })
    await user.click(within(card).getByRole('button', { name: /הוספה להזמנה/ }))
    await user.click(within(card).getByRole('button', { name: 'הוספה: עוף בתנור' }))
    await confirmNoAdjustments(user)
    await user.type(screen.getByLabelText('שם מלא'), 'דנה')
    await user.type(screen.getByLabelText('רחוב'), 'הרצל')
    await user.type(screen.getByLabelText('מספר בית'), '1')
    await user.type(screen.getByLabelText('טלפון'), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'שליחת ההזמנה' }))
    await screen.findByRole('dialog')
    expect(api.sent('POST', '/api/orders')[0].body).not.toHaveProperty('marketing')
    expect(scripts()).toEqual([])
  })
})

describe('Marketing tracking settings', () => {
  const base = {
    ...adminSession,
    'GET /api/admin/settings': () => settings(),
    'GET /api/admin/supply-days': () => [],
    'GET /api/admin/closed-dates': () => [],
  }

  async function trackingSection() {
    const region = await screen.findByRole('region', { name: 'מעקב שיווקי' })
    await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())
    return region
  }

  it('saves only the ids that were changed, on their own', async () => {
    const api = fakeApi({ ...base, 'PUT /api/admin/settings/tracking': (_, body) => settings({ tracking: { ...none, ...(body as object) } }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await trackingSection()

    expect(within(form).getByRole('button', { name: 'שמירה' })).toBeDisabled()
    await user.type(within(form).getByLabelText('מזהה פיקסל של מטא (פייסבוק ואינסטגרם)'), '123456789012345')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    expect(api.sent('PUT', '/api/admin/settings/tracking')[0].body).toEqual({ metaPixelId: '123456789012345' })
  })

  it('saves the Ads tag and the Meta token without ever showing the token', async () => {
    const api = fakeApi({ ...base, 'GET /api/admin/settings': () => settings({ tracking: { ...none, metaServerEvents: true } }), 'PUT /api/admin/settings/tracking': () => settings({ tracking: { ...none, googleAdsId: 'AW-123456789', metaServerEvents: true } }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await trackingSection()

    const token = within(form).getByLabelText('אסימון גישה ל־Conversions API של מטא (לא חובה)')
    expect(token).toHaveValue('')
    expect(token).toHaveAttribute('placeholder', 'אסימון שמור (לא מוצג)')
    await user.type(within(form).getByRole('textbox', { name: 'מזהה המרות של Google Ads' }), 'AW-123456789')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await screen.findByText('נשמר.')).toBeInTheDocument()
    // An empty token field leaves the saved token alone.
    expect(api.sent('PUT', '/api/admin/settings/tracking')[0].body).toEqual({ googleAdsId: 'AW-123456789' })

    await user.click(within(form).getByRole('button', { name: 'הסרת האסימון' }))
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    await waitFor(() => expect(api.sent('PUT', '/api/admin/settings/tracking')).toHaveLength(2))
    expect(api.sent('PUT', '/api/admin/settings/tracking')[1].body).toEqual({ metaAccessToken: '' })
  })

  it('shows the saved ids and explains an id that has the wrong shape', async () => {
    fakeApi({ ...base, 'GET /api/admin/settings': () => settings({ tracking: all }), 'PUT /api/admin/settings/tracking': () => invalid({ MetaPixelId: ['trackingId'] }) })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const form = await trackingSection()

    const meta = within(form).getByLabelText('מזהה פיקסל של מטא (פייסבוק ואינסטגרם)')
    expect(meta).toHaveValue(all.metaPixelId)
    expect(within(form).getByLabelText('מזהה מדידה של Google Analytics')).toHaveValue('G-ABC123XYZ9')
    await user.clear(meta)
    await user.type(meta, 'https://facebook.com/mypage')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))
    expect(await within(form).findByText(/המזהה לא נראה תקין/)).toBeInTheDocument()
  })
})
