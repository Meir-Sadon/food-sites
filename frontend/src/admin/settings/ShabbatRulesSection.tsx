import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  shabbatRulesApi,
  type ShabbatEveMode,
  type ShabbatKindRules,
  type ShabbatRules,
  type ShabbatSide,
  type ShabbatStartMode,
} from '../../api/catalog'
import { Loading, Section, Status } from '../ui'
import { useErrorMessage, useLoad } from '../hooks'
import { useDirty, useUnsavedChanges } from '../unsaved'
import { SavedNote, useSavedFlash } from '../../components/savedFlash'

type Kind = 'shabbat' | 'holiday'

const EVE_MODES: ShabbatEveMode[] = ['none', 'closed', 'fixed', 'before']
const START_MODES: ShabbatStartMode[] = ['none', 'closed', 'fixed', 'after']

function needsCity(rules: ShabbatRules) {
  return (['shabbat', 'holiday'] as const).some(
    (k) => rules[k].eve.mode === 'before' || rules[k].start.mode === 'after',
  )
}

export function ShabbatRulesSection() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { data, setData, failed } = useLoad(shabbatRulesApi.get)
  const [error, setError] = useState<string | null>(null)
  const { saved, flash } = useSavedFlash()
  const [saving, setSaving] = useState(false)
  const rules = data?.rules ?? null

  function update(next: ShabbatRules) {
    setData((current) => current && { ...current, rules: next })
    setError(null)
  }

  const { dirty, markSaved } = useDirty(rules)
  useUnsavedChanges(dirty, save)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save(): Promise<boolean> {
    if (!rules) return false
    if (needsCity(rules) && !rules.city) {
      setError(t('admin.settings.shabbat.needCity'))
      return false
    }
    setSaving(true)
    try {
      const result = await shabbatRulesApi.save(rules)
      setData(result)
      markSaved(result.rules)
      setError(null)
      flash()
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title={t('admin.settings.shabbat.title')} hint={t('admin.settings.shabbat.hint')}>
      {!data || !rules ? (
        <Loading failed={failed} />
      ) : (
        <form onSubmit={handleSubmit} className="stack">
          <label>
            {t('admin.settings.shabbat.city')}
            <select value={rules.city ?? ''} onChange={(e) => update({ ...rules, city: e.target.value || null })}>
              <option value="">{t('admin.settings.shabbat.cityNone')}</option>
              {data.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {data.preview && (
            <p className="muted">
              {t('admin.settings.shabbat.preview', {
                date: data.preview.eve.split('-').reverse().join('.'),
                candle: data.preview.candleLighting,
                ends: data.preview.shabbatEnds,
              })}
            </p>
          )}
          {(['shabbat', 'holiday'] as const).map((kind) => (
            <KindFields
              key={kind}
              kind={kind}
              value={rules[kind]}
              onChange={(next) => update({ ...rules, [kind]: next })}
            />
          ))}
          <div className="row">
            <button type="submit" disabled={saving}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
            <SavedNote show={saved} />
            {error && <Status message={error} error />}
          </div>
        </form>
      )}
    </Section>
  )
}

function KindFields({
  kind,
  value,
  onChange,
}: {
  kind: Kind
  value: ShabbatKindRules
  onChange: (next: ShabbatKindRules) => void
}) {
  const { t } = useTranslation()
  const base = 'admin.settings.shabbat'
  const kindName = t(`${base}.kindNames.${kind}`)
  const heading = t(`${base}.kinds.${kind}`)
  return (
    <fieldset className="shabbat-kind">
      <legend>{heading}</legend>
      <SideFields
        label={t(`${base}.eve`, { kind: kindName })}
        modes={EVE_MODES}
        side={value.eve}
        kindName={kindName}
        onChange={(eve) => onChange({ ...value, eve })}
      />
      <SideFields
        label={t(`${base}.start`, { kind: kindName })}
        modes={START_MODES}
        side={value.start}
        kindName={kindName}
        onChange={(start) => onChange({ ...value, start })}
      />
    </fieldset>
  )
}

function SideFields<Mode extends string>({
  label,
  modes,
  side,
  kindName,
  onChange,
}: {
  label: string
  modes: Mode[]
  side: ShabbatSide<Mode>
  kindName: string
  onChange: (next: ShabbatSide<Mode>) => void
}) {
  const { t } = useTranslation()
  const base = 'admin.settings.shabbat'
  const relative = side.mode === 'before' || side.mode === 'after'
  return (
    <div className="row shabbat-side">
      <label>
        {label}
        <select value={side.mode} onChange={(e) => onChange({ ...side, mode: e.target.value as Mode })}>
          {modes.map((m) => (
            <option key={m} value={m}>
              {t(`${base}.modes.${m}`, { kind: kindName })}
            </option>
          ))}
        </select>
      </label>
      {side.mode === 'fixed' && (
        <input
          type="time"
          aria-label={`${label}: ${t(`${base}.time`)}`}
          value={side.time ?? ''}
          required
          onChange={(e) => onChange({ ...side, time: e.target.value || null })}
        />
      )}
      {relative && (
        <input
          type="number"
          min={0}
          max={12}
          step={0.5}
          aria-label={`${label}: ${t(`${base}.hours`)}`}
          value={side.hours}
          onChange={(e) => onChange({ ...side, hours: Number(e.target.value) })}
        />
      )}
    </div>
  )
}
