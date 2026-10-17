import type { ReactElement } from 'react'
import type { SocialKind } from '../api/social'

// Simple stroke icons (24x24, currentColor), like the navbar's, so no icon library is needed.
const paths: Record<SocialKind, ReactElement> = {
  facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
  instagram: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  tiktok: <path d="M9 12a4 4 0 1 0 4 4V3c.3 2.5 2 4.5 5 4.8" />,
  youtube: (
    <>
      <path d="M22.5 7.2a2.5 2.5 0 0 0-1.8-1.8C19.2 5 12 5 12 5s-7.2 0-8.7.4A2.5 2.5 0 0 0 1.5 7.2C1 8.7 1 12 1 12s0 3.3.5 4.8a2.5 2.5 0 0 0 1.8 1.8C4.8 19 12 19 12 19s7.2 0 8.7-.4a2.5 2.5 0 0 0 1.8-1.8c.5-1.5.5-4.8.5-4.8s0-3.3-.5-4.8z" />
      <path d="m10 15 5-3-5-3z" />
    </>
  ),
  custom: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
}

export function SocialIcon({ kind }: { kind: SocialKind }) {
  return (
    <svg
      className="social-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[kind]}
    </svg>
  )
}
