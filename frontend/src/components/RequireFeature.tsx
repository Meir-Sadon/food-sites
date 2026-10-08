import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { Feature } from '../api/site'
import { useFeature } from '../site/useSite'

/** A page of a feature the site may not have: when it's off, the page goes to the order page (or `to`) instead. */
export function RequireFeature({ feature, to = '/', children }: { feature: Feature; to?: string; children: ReactNode }) {
  return useFeature(feature) ? children : <Navigate to={to} replace />
}
