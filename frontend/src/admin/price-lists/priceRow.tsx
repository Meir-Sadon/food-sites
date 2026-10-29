import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldErrors } from '../../api/client'
import type { PriceList, PriceListDish } from '../../api/priceLists'
import { Modal } from '../../components/Modal'
import { FieldError } from '../ui'
import { clientPrice, patchRow, patchSub, type Row } from './priceRowModel'

/** Today in Israel, "yyyy-MM-dd", the day the server prices an order by. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())

/**
 * One dish's prices in one list: the base price, the list price and the dates, and its other prices behind a
 * "sub-prices" button. In the default list only the regular prices are edited. `read` shows them without fields.
 */
export function PriceRowFields({
  list,
  dish,
  row,
  onChange,
  errors,
  field,
  idPrefix,
  heading,
  readOnly,
}: {
  list: PriceList
  dish: PriceListDish
  row: Row
  onChange: (row: Row) => void
  errors: FieldErrors
  /** The row's error path, e.g. "dishes[3]". */
  field: string
  idPrefix: string
  /** The row's title: the dish's name and picture, or the list's name in the dish's window. */
  heading: { title: string; imageUrl?: string | null; showImage: boolean }
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const discount = !list.isDefault && Number(row.price) < Number(row.basePrice)
  const subDiscounts = !list.isDefault && row.subs.some((s) => Number(s.price) < Number(s.basePrice))
  const subsId = `${idPrefix}-subs`
  // With a general discount, what a client on the list pays today, since it is not one of the fields.
  const pays = (basePrice: string, price: string) => {
    if (list.isDefault || list.discount.percent === null || basePrice === '' || price === '') return null
    const value = clientPrice(Number(basePrice), Number(price), row, list.discount, today())
    return value === null ? null : t('admin.priceLists.clientPays', { price: value })
  }
  const rowPays = pays(row.basePrice, row.price)
  const subLabel = (key: string) => {
    const sub = dish.subPrices.find((s) => s.key === key)!
    return t(`admin.priceLists.subKinds.${sub.kind}`, { name: sub.name })
  }

  return (
    <li className="price-list-dish">
      <span className="price-list-dish__head">
        {heading.showImage &&
          (heading.imageUrl ? <img src={heading.imageUrl} alt="" className="price-list-dish__image" /> : <span className="price-list-dish__image" />)}
        <strong>{heading.title}</strong>
        {discount && <span className="price-list-dish__tag">{t('admin.priceLists.discount')}</span>}
        {!dish.inList && !list.isDefault && <span className="muted">{t('admin.priceLists.notSaved')}</span>}
      </span>
      {readOnly ? (
        <p className="muted">
          {t('admin.priceLists.regularSummary', { price: row.price })}
          {row.subs.length > 0 && ` · ${row.subs.map((s) => `${subLabel(s.key)}: ₪${s.price}`).join(' · ')}`}
        </p>
      ) : (
        <>
          <span className="row row--end">
            {!list.isDefault && (
              <PriceField id={`${idPrefix}-base`} label={t('admin.priceLists.basePrice')} value={row.basePrice}
                onChange={(basePrice) => onChange(patchRow(row, { basePrice }))} errors={errors} field={`${field}.basePrice`} />
            )}
            <PriceField id={`${idPrefix}-price`} label={t(list.isDefault ? 'admin.priceLists.regularPrice' : 'admin.priceLists.listPrice')}
              value={row.price} onChange={(price) => onChange(patchRow(row, { price }))} errors={errors} field={`${field}.price`} />
            {!list.isDefault && (
              <>
                <span className="field field--narrow">
                  <label htmlFor={`${idPrefix}-from`}>{t('admin.priceLists.from')}</label>
                  <input id={`${idPrefix}-from`} type="date" value={row.from} onChange={(e) => onChange(patchRow(row, { from: e.target.value }))} />
                </span>
                <span className="field field--narrow">
                  <label htmlFor={`${idPrefix}-to`}>{t('admin.priceLists.to')}</label>
                  <input id={`${idPrefix}-to`} type="date" value={row.to} onChange={(e) => onChange(patchRow(row, { to: e.target.value }))}
                    aria-describedby={`${idPrefix}-to-error`} />
                  <FieldError errors={errors} field={`${field}.to`} id={`${idPrefix}-to-error`} />
                </span>
              </>
            )}
          </span>
          {rowPays && <span className="hint">{rowPays}</span>}
          {row.subs.length > 0 && (
            <>
              <span className="row">
                <button type="button" className="button-quiet" aria-expanded={open} aria-controls={subsId} onClick={() => setOpen(!open)}>
                  {t('admin.priceLists.subPrices', { count: row.subs.length })}
                </button>
                {subDiscounts && !open && <span className="price-list-dish__tag">{t('admin.priceLists.discount')}</span>}
              </span>
              {open && (
                <ul id={subsId} className="price-list-subs">
                  {row.subs.map((sub, j) => (
                    <li key={sub.key} className="row row--end">
                      <span className="price-list-subs__name">{subLabel(sub.key)}</span>
                      {!list.isDefault && (
                        <PriceField id={`${idPrefix}-sub-${j}-base`} label={t('admin.priceLists.basePrice')} value={sub.basePrice}
                          onChange={(basePrice) => onChange(patchSub(row, sub.key, { basePrice }))} errors={errors}
                          field={`${field}.subPrices[${j}].basePrice`} describedName={subLabel(sub.key)} />
                      )}
                      <PriceField id={`${idPrefix}-sub-${j}-price`}
                        label={t(list.isDefault ? 'admin.priceLists.regularPrice' : 'admin.priceLists.listPrice')} value={sub.price}
                        onChange={(price) => onChange(patchSub(row, sub.key, { price }))} errors={errors}
                        field={`${field}.subPrices[${j}].price`} describedName={subLabel(sub.key)} />
                      {pays(sub.basePrice, sub.price) && <span className="hint">{pays(sub.basePrice, sub.price)}</span>}
                    </li>
                  ))}
                  {!list.isDefault && <li className="hint">{t('admin.priceLists.subPricesHint')}</li>}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </li>
  )
}

function PriceField({ id, label, value, onChange, errors, field, describedName }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  errors: FieldErrors
  field: string
  /** For a sub-price, which price the field is (the label alone repeats on every line). */
  describedName?: string
}) {
  return (
    <span className="field field--narrow">
      <label htmlFor={id}>
        {label}
        {describedName && <span className="visually-hidden">{` · ${describedName}`}</span>}
      </label>
      <input id={id} type="number" inputMode="decimal" min="0" step="any" value={value} onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-error`} />
      <FieldError errors={errors} field={field} id={`${id}-error`} />
    </span>
  )
}

/** Asks whether a changed price should also become the base price in the lists based on the list(s) changed. */
export function LinkedListsQuestion({ names, onAnswer, onCancel }: {
  names: string[]
  onAnswer: (updateLinked: boolean) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal title={t('admin.priceLists.linkedTitle')} onClose={onCancel}>
      <p>{t('admin.priceLists.linkedText', { names: names.join(', ') })}</p>
      <span className="row">
        <button type="button" onClick={() => onAnswer(true)}>
          {t('admin.priceLists.linkedYes')}
        </button>
        <button type="button" className="button-quiet" onClick={() => onAnswer(false)}>
          {t('admin.priceLists.linkedNo')}
        </button>
      </span>
    </Modal>
  )
}
