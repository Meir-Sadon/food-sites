import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deliveryZonesApi, type DeliveryZone } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'
import { ConfirmRemove, FieldError, Info, Loading, MoveButtons, Section, Status } from '../ui'
import { fieldErrorsOf, useFormErrorMessage, useLoad } from '../hooks'

// The map library is large and only this section needs it.
const ZonesMap = lazy(() => import('./ZonesMap'))

const loadZones = () => deliveryZonesApi.get()

const emptyZone = (): DeliveryZone => ({ id: null, name: '', fee: 0, isBlocked: false, polygon: [] })

/**
 * The advanced delivery setting's editor: areas drawn on a map, each with its fee or no delivery at all. The settings
 * page shows it only while "advanced" is the saved pricing (picked in the general settings).
 */
export function DeliveryZonesSection() {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  const { saved, flash } = useSavedFlash()
  const { data, setData, failed } = useLoad(loadZones)
  const [zones, setZones] = useState<DeliveryZone[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const list = zones ?? data ?? []
  const update = (next: DeliveryZone[]) => {
    setZones(next)
    setError(null)
  }
  const patch = (index: number, change: Partial<DeliveryZone>) => update(list.map((z, i) => (i === index ? { ...z, ...change } : z)))

  async function save() {
    setSaving(true)
    setErrors({})
    try {
      const saved = await deliveryZonesApi.save(list)
      setData(saved)
      setZones(null)
      setSelected(null)
      setError(null)
      flash()
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (index: number, field: string) => (
    <FieldError errors={errors} field={`zones[${index}].${field}`} id={`zone-${index}-${field}-error`} />
  )

  return (
    <Section title={t('admin.zones.title')} defaultOpen>
      {!data ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          {(
            <>
              <span className="with-info">
                <h3 id="zones-list-title">{t('admin.zones.areas')}</h3>
                <Info text={t('admin.zones.areasInfo')} about={t('admin.zones.areas')} />
              </span>
              {list.length === 0 && <p>{t('admin.zones.empty')}</p>}
              <ol className="list" aria-labelledby="zones-list-title">
                {list.map((zone, index) => {
                  const label = zone.name || t('admin.zones.unnamed')
                  return (
                    <li key={zone.id ?? `new-${index}`} className={`zone-row${selected === index ? ' zone-row--selected' : ''}`}>
                      <div className="row">
                        <span className="field">
                          <label htmlFor={`zone-${index}-name`}>{t('admin.zones.name')}</label>
                          <input
                            id={`zone-${index}-name`}
                            value={zone.name}
                            maxLength={60}
                            aria-describedby={`zone-${index}-name-error`}
                            onChange={(e) => patch(index, { name: e.target.value })}
                          />
                          {fieldError(index, 'name')}
                        </span>
                        {!zone.isBlocked && (
                          <span className="field">
                            <label htmlFor={`zone-${index}-fee`}>{t('admin.zones.fee')}</label>
                            <input
                              id={`zone-${index}-fee`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              dir="ltr"
                              value={zone.fee}
                              aria-describedby={`zone-${index}-fee-error`}
                              onChange={(e) => patch(index, { fee: Number(e.target.value) })}
                            />
                            {fieldError(index, 'fee')}
                          </span>
                        )}
                        <span className="with-info">
                          <label className="checkbox">
                            <input type="checkbox" checked={zone.isBlocked} onChange={(e) => patch(index, { isBlocked: e.target.checked })} />
                            {t('admin.zones.blocked')}
                          </label>
                          <Info text={t('admin.zones.blockedInfo')} about={t('admin.zones.blocked')} />
                        </span>
                      </div>
                      <p className="hint">
                        {zone.polygon.length >= 3 ? t('admin.zones.corners', { count: zone.polygon.length }) : t('admin.zones.noShape')}
                      </p>
                      {fieldError(index, 'polygon')}
                      <div className="row">
                        <button
                          type="button"
                          className="button-quiet"
                          aria-pressed={selected === index}
                          aria-label={t(selected === index ? 'admin.zones.stopDrawing' : 'admin.zones.draw', { name: label })}
                          onClick={() => setSelected(selected === index ? null : index)}
                        >
                          {t(selected === index ? 'admin.zones.stopDrawing' : 'admin.zones.draw', { name: '' }).trim()}
                        </button>
                        {selected === index && zone.polygon.length > 0 && (
                          <>
                            <button
                              type="button"
                              className="button-quiet"
                              onClick={() => patch(index, { polygon: zone.polygon.slice(0, -1) })}
                            >
                              {t('admin.zones.undoPoint')}
                            </button>
                            <button type="button" className="button-quiet" onClick={() => patch(index, { polygon: [] })}>
                              {t('admin.zones.clearShape')}
                            </button>
                          </>
                        )}
                        <MoveButtons
                          name={label}
                          first={index === 0}
                          last={index === list.length - 1}
                          onMove={(direction) => {
                            const target = index + (direction === 'Up' ? -1 : 1)
                            const next = [...list]
                            ;[next[index], next[target]] = [next[target], next[index]]
                            update(next)
                            if (selected === index) setSelected(target)
                          }}
                        />
                        <ConfirmRemove
                          name={label}
                          onConfirm={() => {
                            update(list.filter((_, i) => i !== index))
                            setSelected(null)
                          }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ol>
              <div className="row">
                <button
                  type="button"
                  className="button-quiet"
                  onClick={() => {
                    update([...list, emptyZone()])
                    setSelected(list.length)
                  }}
                >
                  {t('admin.zones.add')}
                </button>
              </div>
              <p className="hint" role="status">
                {selected === null ? t('admin.zones.mapHintIdle') : t('admin.zones.mapHintDrawing')}
              </p>
              <Suspense fallback={<Loading />}>
                <ZonesMap
                  zones={list}
                  selected={selected}
                  onAddPoint={(point) => selected !== null && patch(selected, { polygon: [...list[selected].polygon, point] })}
                  onMovePoint={(pointIndex, point) =>
                    selected !== null &&
                    patch(selected, { polygon: list[selected].polygon.map((p, i) => (i === pointIndex ? point : p)) })
                  }
                />
              </Suspense>
              <div className="row">
                <button type="button" onClick={save} disabled={saving || zones === null}>
                  {saving ? t('admin.saving') : t('admin.save')}
                </button>
                <SavedNote show={saved} />
              </div>
            </>
          )}
          <Status message={error} error />
        </div>
      )}
    </Section>
  )
}
