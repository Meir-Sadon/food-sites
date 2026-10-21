import { useTranslation } from 'react-i18next'
import type { MenuDish } from '../api/site'
import { useSite } from '../site/useSite'
import { isAlmostOut } from './model'

/**
 * The marks beside a dish's name: on sale (ticked on the dish), new (the admin turned that badge on and the dish is young
 * enough) and almost out (the admin turned that badge on and what is left on the chosen date is low). A main dish card
 * also shows what its variants carry, since the variants have no card of their own in the tiles style.
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
  if (marks.length === 0) return null
  return (
    <ul className={`item-badges${className ? ` ${className}` : ''}`} aria-label={t('order.badges.label', { name: dish.name })}>
      {marks.map((mark) => (
        <li key={mark} className={`item-badge item-badge--${mark}`}>
          {t(`order.badges.${mark}`)}
        </li>
      ))}
    </ul>
  )
}
