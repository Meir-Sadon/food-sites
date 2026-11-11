import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { OrderBanner } from '../../api/banner'
import { orderBanner, settings, site } from '../../test/catalogData'
import { adminSession, fakeApi, invalid } from '../../test/fakeApi'
import { renderAt } from '../../test/render'
import { openSection } from '../../test/sections'

const frames = [
  { id: 1, url: 'https://img.test/1.jpg' },
  { id: 2, url: 'https://img.test/2.jpg' },
  { id: 3, url: 'https://img.test/3.jpg' },
]

const base = {
  ...adminSession,
  'GET /api/site': () => site({ features: ['bannerAnimation'] }),
  'GET /api/admin/settings': () => settings(),
}

describe('Banner and animation', () => {
  it('saves the own banner with its colours, texts and ovals', async () => {
    let saved = orderBanner()
    const api = fakeApi({
      ...base,
      'GET /api/admin/banner': () => saved,
      'PUT /api/admin/banner': (_, body) => (saved = { ...saved, ...(body as object) } as OrderBanner),
    })
    renderAt('/admin/banner')
    const user = userEvent.setup()
    const form = await openSection('הבאנר העליון')

    await user.click(within(form).getByRole('checkbox', { name: /באנר משלי/ }))
    await user.type(within(form).getByLabelText('כותרת'), 'ברוכים הבאים')
    await user.type(within(form).getByLabelText('משפט מתחת לכותרת'), 'קובה כמו בבית')
    fireEvent.change(within(form).getByLabelText('צבע הרקע'), { target: { value: '#112233' } })
    await user.click(within(form).getByRole('button', { name: 'הוספת אליפסה' }))
    await user.type(within(form).getByLabelText('אליפסה 1'), 'חם מהסיר')
    await user.click(within(form).getByRole('button', { name: 'שמירה' }))

    await waitFor(() => expect(api.sent('PUT', '/api/admin/banner')).toHaveLength(1))
    expect(api.sent('PUT', '/api/admin/banner')[0].body).toEqual({
      enabled: true,
      title: 'ברוכים הבאים',
      tagline: 'קובה כמו בבית',
      chips: ['חם מהסיר'],
      background: '#112233',
      textColor: null,
      animationEnabled: false,
      animationScreens: 4,
    })
  })

  it('lists the pictures in order and reorders and removes them', async () => {
    let current = orderBanner({ frames })
    const api = fakeApi({
      ...base,
      'GET /api/admin/banner': () => current,
      'POST /api/admin/banner/frames/(\\d+)/move': () => (current = { ...current, frames: [frames[1], frames[0], frames[2]] }),
      'DELETE /api/admin/banner/frames/(\\d+)': () => (current = { ...current, frames: [frames[0], frames[2]] }),
    })
    renderAt('/admin/banner')
    const user = userEvent.setup()
    const section = await openSection('אנימציית גלילה')

    expect(within(section).getAllByRole('img').map((img) => img.getAttribute('src'))).toEqual(frames.map((f) => f.url))
    expect(within(section).getByRole('button', { name: 'הזזת תמונה 1 למעלה' })).toBeDisabled()

    await user.click(within(section).getByRole('button', { name: 'הזזת תמונה 1 למטה' }))
    await waitFor(() => expect(api.sent('POST', '/api/admin/banner/frames/1/move')[0].body).toEqual({ direction: 'Down' }))
    await waitFor(() => expect(within(section).getAllByRole('img')[0]).toHaveAttribute('src', frames[1].url))

    await user.click(within(section).getByRole('button', { name: 'הסרת תמונה 3' }))
    await waitFor(() => expect(api.sent('DELETE', '/api/admin/banner/frames/3')).toHaveLength(1))
  })

  it('cannot turn the animation on with fewer than two pictures', async () => {
    fakeApi({ ...base, 'GET /api/admin/banner': () => orderBanner({ frames: [frames[0]] }) })
    renderAt('/admin/banner')
    const section = await openSection('אנימציית גלילה')
    expect(within(section).getByRole('checkbox', { name: /להציג את האנימציה/ })).toBeDisabled()
    expect(within(section).getByText(/שתי תמונות לפחות/)).toBeInTheDocument()
  })

  it('shows what the server refused', async () => {
    fakeApi({
      ...base,
      'GET /api/admin/banner': () => orderBanner({ frames }),
      'PUT /api/admin/banner': () => invalid({ animationScreens: ['invalid'] }),
    })
    renderAt('/admin/banner')
    const user = userEvent.setup()
    const section = await openSection('אנימציית גלילה')

    await user.click(within(section).getByRole('checkbox', { name: /להציג את האנימציה/ }))
    await user.click(within(section).getByRole('button', { name: 'שמירה' }))
    expect(await within(section).findByText('ערך לא תקין.')).toBeInTheDocument()
  })

  it('has no Banner page while the feature is off for the site', async () => {
    fakeApi({ ...base, 'GET /api/site': () => site({ features: [] }), 'GET /api/admin/banner': () => orderBanner() })
    renderAt('/admin/banner')
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('באנר ואנימציה בדף ההזמנה')
  })
})
