import { useTranslation } from 'react-i18next'
import { siteLogo } from '../site/config'
import { useFeature, useSite } from '../site/useSite'
import { ScrollAnimation } from './ScrollAnimation'

/**
 * What opens the order page: the standard banner, or the admin's own (logo, colours, texts and ovals; anything left empty
 * keeps the standard one), and under it the scroll animation when it is on.
 */
export function OrderHero() {
  const { t } = useTranslation()
  const on = useFeature('bannerAnimation')
  const banner = useSite()?.banner
  const own = on && banner?.enabled ? banner : null
  const logo = own?.logoUrl ?? siteLogo
  const chips = own?.chips.length ? own.chips : [t('order.hero.fresh'), t('order.hero.homemade'), t('order.hero.kosher')]
  const style = own && (own.background || own.textColor) ? { background: own.background ?? undefined, color: own.textColor ?? undefined } : undefined
  const frames = on && banner?.animationEnabled && banner.frames.length >= 2 ? banner.frames : null

  return (
    <>
      <header className="order-hero" style={style}>
        {logo && <img className="order-hero__logo" src={logo} alt="" />}
        <h1>{own?.title || t('pages.order.title')}</h1>
        <p className="order-hero__tagline">{own?.tagline || t('order.hero.tagline')}</p>
        <ul className="order-hero__chips">
          {chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      </header>
      {frames && banner && <ScrollAnimation frames={frames} screens={banner.animationScreens} />}
    </>
  )
}
