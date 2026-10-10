import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { driverLinksApi, driverUrl, type DriverLink } from '../../api/driver'
import { useToast } from '../../components/toast'
import { formatDate } from '../format'
import { useErrorMessage } from '../hooks'
import { ConfirmRemove, Status } from '../ui'
import { formatMinutes, type Stop } from './plan'

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })

/**
 * The links the admin sends a driver for this day: each opens the route as it was when the link was made, and
 * lets the driver report every stop. The newest link goes into the WhatsApp message to the driver.
 */
export function DriverLinks({
  date,
  stops,
  links,
  onChange,
}: {
  date: string
  stops: Stop[]
  links: DriverLink[]
  onChange: (links: DriverLink[]) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const errorMessage = useErrorMessage()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const newest = links[0]
  const outdated = newest && newest.orderIds.join(',') !== stops.map((s) => s.order.id).join(',')

  async function create() {
    setError(null)
    setCreating(true)
    try {
      const link = await driverLinksApi.create({
        date,
        stops: stops.map((s) => ({ orderId: s.order.id, plannedArrival: `${formatMinutes(s.arrive)}:00` })),
      })
      onChange([link, ...links])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  async function remove(id: number) {
    setError(null)
    try {
      await driverLinksApi.remove(id)
      onChange(links.filter((l) => l.id !== id))
      toast(t('admin.route.linkRemoved'))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast(t('admin.route.copied'))
    } catch {
      window.prompt(t('admin.route.copyLink'), url)
    }
  }

  return (
    <section className="driver-links no-print" aria-labelledby="driver-links-title">
      <h2 id="driver-links-title">{t('admin.route.driverLink')}</h2>
      <p className="hint">{t('admin.route.driverLinkHint', { date: formatDate(newest?.validThrough ?? nextDay(date)) })}</p>
      {outdated && (
        <p role="status" className="notice notice--warning">
          {t('admin.route.linkOutdated')}
        </p>
      )}
      {links.length > 0 && (
        <ul className="list">
          {links.map((link) => {
            const url = driverUrl(link.token)
            return (
              <li key={link.id} className="stack">
                <span>
                  {t('admin.route.linkFor', { count: link.orderIds.length, time: timeOf(link.createdAt) })}
                  {' · '}
                  {t('admin.route.linkProgress', { reported: link.reported, count: link.orderIds.length })}
                </span>
                <span className="row">
                  <button type="button" className="button-quiet" onClick={() => void copy(url)}>
                    {t('admin.route.copyLink')}
                  </button>
                  <a className="button-quiet" href={url} target="_blank" rel="noreferrer">
                    {t('admin.route.openLink')}
                  </a>
                  <ConfirmRemove
                    name={t('admin.route.driverLink')}
                    label={t('admin.route.removeLink')}
                    question={t('admin.route.confirmRemoveLink')}
                    confirmLabel={t('admin.route.yesRemoveLink')}
                    onConfirm={() => remove(link.id)}
                  />
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {stops.length > 0 && (!newest || outdated) && (
        <div>
          <button type="button" onClick={() => void create()} disabled={creating}>
            {creating ? t('admin.route.creating') : t('admin.route.createLink')}
          </button>
        </div>
      )}
      {error && <Status message={error} error />}
    </section>
  )
}

function nextDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
