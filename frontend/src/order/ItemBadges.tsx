import { useTranslation } from 'react-i18next'
import type { MenuDish } from '../api/site'
import { useSite } from '../site/useSite'
import { availabilityLines } from './availability'
import { isAlmostOut } from './model'

/**
 * The marks beside a dish's name: on sale (ticked on the dish), new (the admin turned that badge on and the dish is young
 * enough) and almost out (the admin turned that badge on and what is left on the chosen date is low). A main dish card
 * also shows what its variants carry, since the variants have no card of their own in the tiles style.
 * A dish sold only at set times also carries a clock; hovering it shows when (the dish card and the tile's dialog spell it out).
 */
export function ItemBadges({ dish, variants = [], date, className = '' }: { dish: MenuDish; variants?: MenuDish[]; date?: string; className?: string }) {
  const { t } = useTranslation()
  const badges = useSite()?.badges
  const all = [dish, ...variants]
  const marks = [
    all.some((d) => d.onSale) && 'onSale',
    all.some((d) => d.isNew) && 'new',
    all.some((d) => isAlmostOut(d, date, badges)) && 'almostOut',
  ].filter((mark): mark is 'onSale' | 'new' | 'almostOut' => !!mark)
  const times = dish.availability?.length ? availabilityLines(dish.availability, t) : []
  if (marks.length === 0 && times.length === 0) return null
  return (
    <ul className={`item-badges${className ? ` ${className}` : ''}`} aria-label={t('order.badges.label', { name: dish.name })}>
      {marks.map((mark) => (
        <li key={mark} className={`item-badge item-badge--${mark}`}>
          {t(`order.badges.${mark}`)}
        </li>
      ))}
      {times.length > 0 && (
        <li className="item-badge item-badge--availability" title={times.join('\n')} role="img" aria-label={`${t('order.availability.title')}: ${times.join(', ')}`}>
          <ClockIcon />
        </li>
      )}
    </ul>
  )
}

/** The clock on a dish that is sold only at set times. */
export function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.6V8l2.3 1.5" />
    </svg>
  )
}

/** When the dish is sold, spelled out under its details; nothing for a dish sold whenever the business works. */
export function AvailabilityNote({ dish }: { dish: MenuDish }) {
  const { t } = useTranslation()
  if (!dish.availability?.length) return null
  return (
    <div className="dish__availability">
      <p>
        <ClockIcon /> <strong>{t('order.availability.title')}</strong>
      </p>
      <ul>
        {availabilityLines(dish.availability, t).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
