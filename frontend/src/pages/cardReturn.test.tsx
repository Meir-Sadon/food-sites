import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

beforeEach(() => localStorage.clear())
afterEach(() => vi.useRealTimers())

describe('Returning from the credit card page', () => {
  it('asks the server and says the payment arrived', async () => {
    const api = fakeApi({
      'GET /api/site': () => site({ cardEnabled: true }),
      'GET /api/payments/card/status.*': () => ({ paid: true, total: 82 }),
    })
    renderAt('/order/card-return?order=7&sig=abc')

    expect(await screen.findByRole('heading', { name: 'התשלום התקבל, תודה!' })).toBeInTheDocument()
    expect(screen.getByText(/ההזמנה מס' 7 התקבלה/)).toBeInTheDocument()
    expect(api.sent('GET', '/api/payments/card/status?order=7&sig=abc')).toHaveLength(1)
  })

  it('does not trust the address alone: a missing signature is an unpaid order', async () => {
    fakeApi({ 'GET /api/site': () => site({}) })
    renderAt('/order/card-return?order=7')

    expect(await screen.findByRole('heading', { name: 'לא הצלחנו לאשר תשלום' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'חזרה להזמנה' })).toBeInTheDocument()
  })

  it('keeps asking while the payment is not confirmed yet', async () => {
    let calls = 0
    fakeApi({
      'GET /api/site': () => site({}),
      'GET /api/payments/card/status.*': () => ({ paid: ++calls >= 2, total: 40 }),
    })
    renderAt('/order/card-return?order=9&sig=abc')

    expect(await screen.findByRole('heading', { name: 'התשלום התקבל, תודה!' }, { timeout: 8000 })).toBeInTheDocument()
    expect(calls).toBe(2)
  }, 12000)
})
