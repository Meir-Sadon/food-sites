import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { cardPaymentsApi } from '../api/site'
import { useSite } from '../site/useSite'
import { formatMoney } from '../order/format'
import { trackMarketing } from '../tracking/marketing'

const ATTEMPTS = 10
const WAIT_MS = 3000

/**
 * Where the clearing company's page sends the client back to. The address alone proves nothing, so the page asks the
 * server whether the order is paid (the server checks with the clearing company) and waits a little for the answer.
 */
export function CardReturnPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const order = Number(params.get('order'))
  const sig = params.get('sig') ?? ''
  const site = useSite()
  const [state, setState] = useState<{ phase: 'checking' | 'paid' | 'unpaid'; total?: number }>({ phase: 'checking' })
  const reported = useRef(false)

  useEffect(() => {
    if (!order || !sig) {
      setState({ phase: 'unpaid' })
      return
    }
    let cancelled = false
    async function check(attempt: number) {
      try {
        const status = await cardPaymentsApi.status(order, sig)
        if (cancelled) return
        if (status.paid) {
          setState({ phase: 'paid', total: status.total })
          if (!reported.current) {
            reported.current = true
            trackMarketing({ name: 'Purchase', orderId: order, value: status.total })
          }
          return
        }
      } catch {
        // A lookup that fails is tried again like one that says "not yet".
      }
      if (cancelled) return
      if (attempt + 1 >= ATTEMPTS) setState({ phase: 'unpaid' })
      else setTimeout(() => void check(attempt + 1), WAIT_MS)
    }
    void check(0)
    return () => {
      cancelled = true
    }
  }, [order, sig])

  const phone = site?.contact.phone
  return (
    <section className="stack card-return" aria-live="polite">
      {state.phase === 'checking' && (
        <>
          <h1>{t('cardReturn.checkingTitle')}</h1>
          <p>{t('cardReturn.checking')}</p>
        </>
      )}
      {state.phase === 'paid' && (
        <>
          <h1>{t('cardReturn.paidTitle')}</h1>
          <p>{t('cardReturn.paid', { total: formatMoney(state.total ?? 0), id: order })}</p>
        </>
      )}
      {state.phase === 'unpaid' && (
        <>
          <h1>{t('cardReturn.unpaidTitle')}</h1>
          <p>{t('cardReturn.unpaid')}</p>
          {phone && (
            <p>
              {t('cardReturn.call')} <a href={`tel:${phone}`} dir="ltr">{phone}</a>
            </p>
          )}
        </>
      )}
      {state.phase !== 'checking' && (
        <Link className="button" to="/">
          {t('cardReturn.back')}
        </Link>
      )}
    </section>
  )
}
