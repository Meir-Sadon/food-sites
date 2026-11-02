import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { Feature } from '../api/site'
import { useFeature, useSiteSettled } from '../site/useSite'

/**
 * A page of a feature the site may not have: when it's off, the page goes to the order page (or `to`) instead.
 * Until the site info answers, a feature the build has off waits rather than leaves, since the server may have it on.
 */
export function RequireFeature({ feature, to = '/', children }: { feature: Feature; to?: string; children: ReactNode }) {
  const on = useFeature(feature)
  const settled = useSiteSettled()
  if (on) return children
  return settled ? <Navigate to={to} replace /> : null
}
