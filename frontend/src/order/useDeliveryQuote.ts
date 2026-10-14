import { useEffect, useState } from 'react'
import { deliveryApi, type DeliveryQuote } from '../api/site'

/** Waits for the client to stop typing before asking, so one quote is asked for a finished address, not for every key. */
const QUOTE_DELAY_MS = 600

export type QuoteState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; quote: DeliveryQuote }

/**
 * The delivery fee for the address typed so far (the server works it out from the zones the admin drew), once the
 * city, street and house number are all filled in. `enabled` is off for pickup and for sites without zones.
 */
export function useDeliveryQuote(enabled: boolean, city: string, street: string, houseNumber: string): QuoteState {
  const [result, setResult] = useState<{ key: string; value: QuoteState } | null>(null)
  const complete = enabled && !!city.trim() && !!street.trim() && !!houseNumber.trim()
  const key = `${city.trim()}|${street.trim()}|${houseNumber.trim()}`

  useEffect(() => {
    if (!complete) return
    let current = true
    const timer = setTimeout(() => {
      deliveryApi
        .quote({ city: city.trim(), street: street.trim(), houseNumber: houseNumber.trim() })
        .then((quote) => current && setResult({ key, value: { state: 'ready', quote } }))
        .catch(() => current && setResult({ key, value: { state: 'failed' } }))
    }, QUOTE_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [complete, key, city, street, houseNumber])

  if (!complete) return { state: 'idle' }
  return result?.key === key ? result.value : { state: 'loading' }
}
