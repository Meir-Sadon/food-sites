import { useEffect, useRef, useState } from 'react'
import { deliveryApi, type DeliveryQuote } from '../api/site'

/** Waits for the client to stop typing before asking, so one quote is asked for a finished address, not for every key. */
const QUOTE_DELAY_MS = 600

export type QuoteState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; quote: DeliveryQuote }

/** A quote already known for an address, e.g. the one "find my location" brought with it. */
export interface SeededQuote {
  city: string
  street: string
  houseNumber: string
  quote: DeliveryQuote
}

export const addressKeyOf = (city: string, street: string, houseNumber: string) => `${city.trim()}|${street.trim()}|${houseNumber.trim()}`

/**
 * The delivery fee for the address typed so far (the server works it out from the zones the admin drew), once the
 * city, street and house number are all filled in. `enabled` is off for pickup and for sites without zones. `seed` is
 * a quote already known for an address, used instead of asking while the address is still that one. `refresh`
 * changes when the client presses "calculate": the quote is then asked for at once. `typedKey` is the address key
 * (`addressKeyOf`) the client last typed: only that one waits for the typing to stop, while an address that arrived
 * whole (a restored draft, a reordered past order, the saved address) is asked for at once.
 */
export function useDeliveryQuote(
  enabled: boolean,
  city: string,
  street: string,
  houseNumber: string,
  seed: SeededQuote | null = null,
  refresh = 0,
  typedKey: string | null = null,
): QuoteState {
  const [result, setResult] = useState<{ key: string; value: QuoteState } | null>(null)
  const complete = enabled && !!city.trim() && !!street.trim() && !!houseNumber.trim()
  const addressKey = addressKeyOf(city, street, houseNumber)
  const seeded = !!seed && addressKeyOf(seed.city, seed.street, seed.houseNumber) === addressKey
  const key = `${addressKey}|${refresh}`
  const lastRefresh = useRef(refresh)

  useEffect(() => {
    if (!complete || (seeded && refresh === 0)) return
    let current = true
    const pressed = lastRefresh.current !== refresh || typedKey !== addressKey
    lastRefresh.current = refresh
    const timer = setTimeout(
      () => {
        deliveryApi
          .quote({ city: city.trim(), street: street.trim(), houseNumber: houseNumber.trim() })
          .then((quote) => current && setResult({ key, value: { state: 'ready', quote } }))
          .catch(() => current && setResult({ key, value: { state: 'failed' } }))
      },
      pressed ? 0 : QUOTE_DELAY_MS,
    )
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [complete, key, seeded, city, street, houseNumber, refresh, typedKey, addressKey])

  if (!complete) return { state: 'idle' }
  if (seeded && refresh === 0 && seed) return { state: 'ready', quote: seed.quote }
  return result?.key === key ? result.value : { state: 'loading' }
}
