import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const slash = <path d="M4 20 20 4" />

/** One drawing per mark, on a 24 x 24 grid; "free of" marks have the thing crossed out. */
const ICONS: Record<string, ReactNode> = {
  glutenFree: (
    <>
      <path d="M12 21V9M12 9c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Zm0 5c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z" />
      {slash}
    </>
  ),
  vegetarian: <path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15ZM5 19l8-8" />,
  vegan: <path d="M12 21v-9M12 12c0-4-2.5-6-6-6 0 4 2.5 6 6 6Zm0 2c0-3 2-5 6-5 0 3-2 5-6 5Z" />,
  parve: (
    <>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
      {slash}
    </>
  ),
  lactoseFree: (
    <>
      <path d="M9 3h6v3l2 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l2-3V3Z" />
      {slash}
    </>
  ),
  sugarFree: (
    <>
      <path d="M5 8l7-4 7 4v8l-7 4-7-4V8Zm0 0 7 4 7-4m-7 4v8" />
      {slash}
    </>
  ),
  nutFree: (
    <>
      <path d="M12 4c4 0 7 3 7 7 0 5-3.5 9-7 9s-7-4-7-9c0-4 3-7 7-7ZM9 4.5C9 3.5 10.5 3 12 3s3 .5 3 1.5" />
      {slash}
    </>
  ),
  eggFree: (
    <>
      <path d="M12 3c3.5 0 6 5 6 9.5a6 6 0 0 1-12 0C6 8 8.5 3 12 3Z" />
      {slash}
    </>
  ),
  kosherForPassover: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01" />
    </>
  ),
}

function TagIcon({ tag }: { tag: string }) {
  return (
    <svg className="dietary-tags__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[tag]}
    </svg>
  )
}

/** The dish's special-diet marks, each with its own icon, in a block of their own; nothing when it has none. */
export function DietaryTags({ tags }: { tags?: string[] }) {
  const { t } = useTranslation()
  if (!tags?.length) return null
  return (
    <ul className="dietary-tags" aria-label={t('order.dietaryTags')}>
      {tags.map((tag) => (
        <li key={tag}>
          <TagIcon tag={tag} />
          {t(`dietaryTags.${tag}`)}
        </li>
      ))}
    </ul>
  )
}
