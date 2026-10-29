import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import { DISCOUNT_RULES, hasStatuses, priceListsApi, type DiscountRule, type PriceList, type PriceListDiscount } from '../../api/priceLists'
import { ConfirmRemove, FieldError, Info, Loading, Status } from '../ui'
import { fieldErrorsOf, useErrorMessage, useLoad } from '../hooks'
import { useUnsavedChanges } from '../unsaved'

/** The list's name as shown: the default list's comes from the site's texts. */
export function useListName() {
  const { t } = useTranslation()
  return (list: PriceList | undefined) => (!list ? '' : list.isDefault ? t('admin.priceLists.defaultName') : (list.name ?? ''))
}

/** A list can be a base when it is the default list or has no base itself (one level only). */
export const canBeBase = (list: PriceList) => list.isDefault || list.baseListId === null

export function PriceListsPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const nameOf = useListName()
  const { data, setData, failed } = useLoad(priceListsApi.getAll)
  const [error, setError] = useState<string | null>(null)

  async function remove(list: PriceList) {
    setError(null)
    try {
      await priceListsApi.remove(list.id)
      setData((current) => current && current.filter((l) => l.id !== list.id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <>
      <span className="with-info">
        <h1>{t('admin.priceLists.title')}</h1>
        <Info text={t('admin.priceLists.info')} about={t('admin.priceLists.title')} />
      </span>
      {!data ? (
        <Loading failed={failed} />
      ) : (
        <div className="stack">
          <ol className="list">
            {data.map((list) => {
              const baseList = data.find((l) => (list.baseListId === null ? l.isDefault : l.id === list.baseListId))
              return (
                <li key={list.id} className="list__row">
                  <span className="list__main">
                    <Link to={`/admin/price-lists/${list.id}`}>
                      <strong>{nameOf(list)}</strong>
                    </Link>
                    <span className="muted">
                      {list.isDefault
                        ? t('admin.priceLists.defaultHint')
                        : `${t('admin.priceLists.basedOn', { name: nameOf(baseList) })} · ${t('admin.priceLists.phoneCount', { count: list.phones.length })}${hasStatuses(list.statuses) ? ` · ${t('admin.priceLists.statusCount')}` : ''}`}
                    </span>
                  </span>
                  <span className="row">
                    <Link className="button-quiet" to={`/admin/price-lists/${list.id}`} aria-label={`${t('admin.priceLists.open')}: ${nameOf(list)}`}>
                      {t('admin.priceLists.open')}
                    </Link>
                    {!list.isDefault && <ConfirmRemove name={nameOf(list)} onConfirm={() => remove(list)} />}
                  </span>
                </li>
              )
            })}
          </ol>
          {error && <Status message={error} error />}
          <section className="stack" aria-labelledby="new-price-list-title">
            <h2 id="new-price-list-title">{t('admin.priceLists.newTitle')}</h2>
            <PriceListForm
              idPrefix="new-price-list"
              lists={data}
              initialName=""
              initialBaseId={null}
              submitLabel={t('admin.add')}
              resetOnSave
              onSave={async (name, baseListId) => {
                const created = await priceListsApi.create(name, baseListId)
                setData((current) => current && [...current, created])
              }}
            />
          </section>
        </div>
      )}
    </>
  )
}

/**
 * A list's name and base, and on a list's own page its general discount. Changing the base copies the new base's
 * prices over the list's own.
 */
export function PriceListForm({
  idPrefix,
  lists,
  selfId,
  initialName,
  initialBaseId,
  initialDiscount,
  submitLabel,
  resetOnSave,
  onSave,
}: {
  idPrefix: string
  lists: PriceList[]
  selfId?: number
  initialName: string
  initialBaseId: number | null
  /** Shows the general discount's fields. */
  initialDiscount?: PriceListDiscount
  submitLabel: string
  resetOnSave?: boolean
  onSave: (name: string, baseListId: number | null, discount?: PriceListDiscount) => Promise<void>
}) {
  const { t } = useTranslation()
  const nameOf = useListName()
  const errorMessage = useErrorMessage()
  const [name, setName] = useState(initialName)
  const defaultId = lists.find((l) => l.isDefault)?.id ?? null
  const [baseId, setBaseId] = useState<number | null>(initialBaseId ?? defaultId)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // A list others are based on cannot get a base of its own, so it keeps the default one.
  const isBase = selfId !== undefined && lists.some((l) => l.baseListId === selfId)
  const bases = lists.filter((l) => l.id !== selfId && canBeBase(l) && (!isBase || l.isDefault))
  const baseChanged = selfId !== undefined && (baseId === defaultId ? null : baseId) !== initialBaseId
  const [percent, setPercent] = useState(initialDiscount?.percent === null || !initialDiscount ? '' : String(initialDiscount.percent))
  const [from, setFrom] = useState(initialDiscount?.from ?? '')
  const [to, setTo] = useState(initialDiscount?.to ?? '')
  const [rule, setRule] = useState<DiscountRule>(initialDiscount?.rule ?? 'dish')
  const discount: PriceListDiscount | undefined = initialDiscount && {
    percent: percent.trim() === '' ? null : Number(percent),
    from: from || null,
    to: to || null,
    rule,
  }
  // Editing a list (not making one) asks before leaving with a changed name, base or discount.
  const [saved, setSavedState] = useState({ name: initialName, discount: JSON.stringify(initialDiscount ?? null) })
  useUnsavedChanges(
    selfId !== undefined && (name !== saved.name || baseChanged || JSON.stringify(discount ?? null) !== saved.discount),
    save,
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    void save()
  }

  async function save() {
    setErrors({})
    setError(null)
    setDone(false)
    try {
      await onSave(name, baseId === defaultId ? null : baseId, discount)
      if (resetOnSave) {
        setName('')
        setBaseId(defaultId)
      }
      setSavedState({ name, discount: JSON.stringify(discount ?? null) })
      setDone(true)
      return true
    } catch (err) {
      const fields = fieldErrorsOf(err)
      setErrors(fields)
      if (!Object.keys(fields).some((f) => ['name', 'baselistid', 'discount.percent', 'discount.to', 'discount.rule'].includes(f)))
        setError(errorMessage(err))
      return false
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <span className="field">
        <label htmlFor={`${idPrefix}-name`}>{t('admin.priceLists.name')}</label>
        <input
          id={`${idPrefix}-name`}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          aria-describedby={`${idPrefix}-name-error`}
        />
        <FieldError errors={errors} field="name" id={`${idPrefix}-name-error`} />
      </span>
      <span className="field">
        <span className="with-info">
          <label htmlFor={`${idPrefix}-base`}>{t('admin.priceLists.base')}</label>
          <Info text={t('admin.priceLists.baseHint')} about={t('admin.priceLists.base')} />
        </span>
        <select
          id={`${idPrefix}-base`}
          value={baseId ?? ''}
          onChange={(e) => setBaseId(Number(e.target.value))}
          aria-describedby={`${idPrefix}-base-error`}
        >
          {bases.map((l) => (
            <option key={l.id} value={l.id}>
              {nameOf(l)}
            </option>
          ))}
        </select>
        <FieldError errors={errors} field="baseListId" id={`${idPrefix}-base-error`} />
        {baseChanged && <p className="hint hint--warning">{t('admin.priceLists.baseChangeWarning')}</p>}
      </span>
      {discount && (
        <fieldset className="stack">
          <legend className="with-info">
            {t('admin.priceLists.generalDiscount')}
            <Info text={t('admin.priceLists.generalDiscountHint')} about={t('admin.priceLists.generalDiscount')} />
          </legend>
          <span className="row row--end">
            <span className="field field--narrow">
              <label htmlFor={`${idPrefix}-discount`}>{t('admin.priceLists.discountPercent')}</label>
              <input id={`${idPrefix}-discount`} type="number" inputMode="decimal" min="0" max="99.99" step="any" value={percent}
                onChange={(e) => setPercent(e.target.value)} aria-describedby={`${idPrefix}-discount-error`} />
              <FieldError errors={errors} field="discount.percent" id={`${idPrefix}-discount-error`} />
            </span>
            <span className="field field--narrow">
              <label htmlFor={`${idPrefix}-discount-from`}>{t('admin.priceLists.from')}</label>
              <input id={`${idPrefix}-discount-from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </span>
            <span className="field field--narrow">
              <label htmlFor={`${idPrefix}-discount-to`}>{t('admin.priceLists.to')}</label>
              <input id={`${idPrefix}-discount-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)}
                aria-describedby={`${idPrefix}-discount-to-error`} />
              <FieldError errors={errors} field="discount.to" id={`${idPrefix}-discount-to-error`} />
            </span>
          </span>
          <span className="field">
            <span className="with-info">
              <label htmlFor={`${idPrefix}-discount-rule`}>{t('admin.priceLists.discountRule')}</label>
              <Info text={t('admin.priceLists.discountRuleHint')} about={t('admin.priceLists.discountRule')} />
            </span>
            <select id={`${idPrefix}-discount-rule`} value={rule} onChange={(e) => setRule(e.target.value as DiscountRule)}>
              {DISCOUNT_RULES.map((r) => (
                <option key={r} value={r}>
                  {t(`admin.priceLists.discountRules.${r}`)}
                </option>
              ))}
            </select>
          </span>
        </fieldset>
      )}
      {error && <Status message={error} error />}
      {done && !resetOnSave && <Status message={t('admin.saved')} />}
      <span className="row">
        <button type="submit" disabled={!name.trim()}>
          {submitLabel}
        </button>
      </span>
    </form>
  )
}
