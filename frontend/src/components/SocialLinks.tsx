import { useTranslation } from 'react-i18next'
import type { SocialLink } from '../api/social'
import { SocialIcon } from './SocialIcon'

/** The business's pages elsewhere as buttons, each in a new tab. Nothing when none is set. */
export function SocialLinks({ links }: { links: SocialLink[] | undefined }) {
  const { t } = useTranslation()
  if (!links?.length) return null
  return (
    <ul className="social-links" aria-label={t('socialLinks.title')}>
      {links.map((link) => {
        const name = link.kind === 'custom' ? (link.label ?? link.url) : t(`socialLinks.platforms.${link.kind}`)
        return (
          <li key={`${link.kind}-${link.url}`}>
            <a className="social-link" href={link.url} target="_blank" rel="noopener noreferrer">
              <SocialIcon kind={link.kind} />
              {name}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
