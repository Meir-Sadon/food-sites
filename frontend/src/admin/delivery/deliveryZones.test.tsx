import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DeliveryZone } from '../../api/catalog'
import { settings } from '../../test/catalogData'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

// The map needs a real browser; the section is tested through its zone list.
vi.mock('./ZonesMap', () => ({
  default: ({ onAddPoint }: { onAddPoint: (p: [number, number]) => void }) => (
    <button type="button" onClick={() => onAddPoint([32, 34])}>
      מפה
    </button>
  ),
}))

const zone = (patch: Partial<DeliveryZone> = {}): DeliveryZone => ({
  id: 1, name: 'קרוב', fee: 15, isBlocked: false, polygon: [[0, 0], [0, 1], [1, 1]], ...patch,
})

function api(zones: DeliveryZone[] = [], mode: 'simple' | 'zones' = 'zones') {
  let current = settings({ deliveryPricing: mode, deliveryZonesAvailable: true })
  let saved = zones
  return fakeApi({
    ...adminSession,
    'GET /api/admin/settings': () => current,
    'GET /api/admin/supply-days': () => [],
    'GET /api/admin/closed-dates': () => [],
    'PUT /api/admin/settings': (_, body) => (current = { ...current, ...(body as object) }),
    'GET /api/admin/delivery-zones': () => saved,
    'PUT /api/admin/delivery-zones': (_, body) => (saved = (body as { zones: DeliveryZone[] }).zones.map((z, i) => ({ ...z, id: z.id ?? 10 + i }))),
  })
}

async function section() {
  const region = await screen.findByRole('region', { name: 'דמי משלוח לפי אזורים' })
  await waitFor(() => expect(within(region).queryByText('טוען…')).not.toBeInTheDocument())
  return region
}

describe('Delivery zones settings', () => {
  it('switches between the simple and the advanced setting', async () => {
    const mock = api([], 'simple')
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const region = await section()
    expect(within(region).getByRole('radio', { name: /רגילה/ })).toBeChecked()
    expect(within(region).queryByRole('button', { name: 'הוספת אזור' })).not.toBeInTheDocument()

    await user.click(within(region).getByRole('radio', { name: /מתקדמת/ }))

    expect(await within(region).findByRole('button', { name: 'הוספת אזור' })).toBeInTheDocument()
    expect(mock.sent('PUT', '/api/admin/settings')[0].body).toMatchObject({ deliveryPricing: 'zones' })
  })

  it('draws a new zone on the map, names it, gives it a fee and saves the list', async () => {
    const mock = api()
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const region = await section()

    await user.click(within(region).getByRole('button', { name: 'הוספת אזור' }))
    await user.type(within(region).getByLabelText('שם האזור'), 'כל העיר')
    await user.clear(within(region).getByLabelText('דמי משלוח (₪)'))
    await user.type(within(region).getByLabelText('דמי משלוח (₪)'), '30')
    for (let i = 0; i < 3; i++) await user.click(within(region).getByRole('button', { name: 'מפה' }))
    expect(within(region).getByText('3 פינות')).toBeInTheDocument()
    await user.click(within(region).getByRole('button', { name: 'שמירה' }))

    await screen.findByText('נשמר.')
    expect(mock.sent('PUT', '/api/admin/delivery-zones')[0].body).toMatchObject({
      zones: [{ name: 'כל העיר', fee: 30, isBlocked: false, polygon: [[32, 34], [32, 34], [32, 34]] }],
    })
  })

  it('marks a zone as no delivery, and hides its fee', async () => {
    api([zone()])
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const region = await section()
    expect(await within(region).findByLabelText('דמי משלוח (₪)')).toBeInTheDocument()

    await user.click(within(region).getByRole('checkbox', { name: 'אין משלוחים לאזור הזה' }))

    expect(within(region).queryByLabelText('דמי משלוח (₪)')).not.toBeInTheDocument()
  })

  it('shows what the server rejects', async () => {
    const mock = fakeApi({
      ...adminSession,
      'GET /api/admin/settings': () => settings({ deliveryPricing: 'zones', deliveryZonesAvailable: true }),
      'GET /api/admin/supply-days': () => [],
      'GET /api/admin/closed-dates': () => [],
      'GET /api/admin/delivery-zones': () => [zone({ name: '' })],
      'PUT /api/admin/delivery-zones': () => invalid({ 'zones[0].name': ['required'] }),
    })
    renderAt('/admin/settings')
    const user = userEvent.setup()
    const region = await section()
    await user.type(await within(region).findByLabelText('שם האזור'), ' ')
    await user.click(within(region).getByRole('button', { name: 'שמירה' }))
    expect(await within(region).findByText('שדה חובה.')).toBeInTheDocument()
    expect(mock.sent('PUT', '/api/admin/delivery-zones')).toHaveLength(1)
  })
})
