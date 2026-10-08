import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ordersApi, siteApi, type Confirmation, type Menu, type MenuDish, type Fulfillment, type Payment } from '../api/site'
import type { FieldErrors } from '../api/client'
import { FieldError, Loading } from '../admin/ui'
import { fieldErrorsOf, useErrorMessage } from '../admin/hooks'
import { AddressFields } from '../account/AddressFields'
import { addressOf, noAddress } from '../account/addressParts'
import { useAccount } from '../account/useAccount'
import { useRegisterLeaveGuard } from '../components/leaveGuard'
import { useToast } from '../components/toast'
import { useSite, useSiteFailed } from '../site/useSite'
import { DishCard } from '../order/DishCard'
import { clearDraft, loadDraft, saveDraft } from '../order/draft'
import { formatMoney, formatSupplyDate } from '../order/format'
import { LeaveDialog } from '../order/LeaveDialog'
import { QuickFill } from '../order/QuickFill'
import {
  DRINKS_CATEGORY_NAME,
  dishMap,
  emptyOrder,
  dishTotals,
  itemCount,
  clampToDate,
  orderTotal,
  restoreSelections,
  round2,
  standaloneDishes,
  toLines,
  type OrderState,
  type Restored,
  type Selection,
} from '../order/model'
import { normalizePhone } from '../order/phone'
import { PhoneField } from '../order/PhoneField'
import { SuccessDialog } from '../order/SuccessDialog'
import { siteLogo } from '../site/config'

function formatCutoff(iso: string) {
  const [date, time] = iso.split('T')
  const [, m, d] = date.split('-')
  return `${d}/${m} ${time.slice(0, 5)}`
}

export function OrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAccount()
  const site = useSite()
  const siteFailed = useSiteFailed()
  const defaultCity = site?.serviceCities[0]
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [failed, setFailed] = useState(false)

  const [state, setState] = useState<OrderState>(emptyOrder)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [leaveTo, setLeaveTo] = useState<{ to: string; proceed?: () => void | Promise<void> } | null>(null)
  const [prefilledFor, setPrefilledFor] = useState<number | null>(null)

  const dishes = useMemo(() => (menu ? dishMap(menu) : new Map<number, MenuDish>()), [menu])
  const total = orderTotal(state.selections, dishes)
  const count = itemCount(state.selections)
  const drinksCategoryIds = useMemo(
    () => new Set((menu?.categories ?? []).filter((c) => c.name === DRINKS_CATEGORY_NAME).map((c) => c.id)),
    [menu],
  )
  const totals = dishTotals(state.selections, dishes, drinksCategoryIds)
  const dirty = count > 0 && !confirmation
  // Set when the profile page's "Reorder" put a past order in the draft.
  const filledSkipped = (location.state as { filled?: { skipped: number } } | null)?.filled?.skipped

  // A logged-in client's details are prefilled once the menu (and any draft) is in, and the login
  // already confirmed their phone. Adjusting state during render is React's way to derive it from props.
  if (user && menu && prefilledFor !== user.id) {
    setPrefilledFor(user.id)
    setState((current) => ({
      ...current,
      name: current.name || user.fullName,
      phone: current.phone || user.phone,
      // The city may already hold the first service city as a default, which the saved one replaces.
      city: current.city && current.city !== defaultCity ? current.city : user.city || current.city,
      street: current.street || user.street,
      houseNumber: current.houseNumber || user.houseNumber,
      apartment: current.apartment || user.apartment,
    }))
  }

  // Load the menu, then bring back a draft saved in this browser: the menu is needed first so
  // dishes that have vanished since can be skipped.
  useEffect(() => {
    let active = true
    siteApi
      .menu()
      .then((loaded) => {
        if (!active) return
        const draft = loadDraft()
        if (draft) {
          const { selections, skipped } = restoreSelections(draft.selections, loaded)
          setState({ ...draft, selections })
          if (filledSkipped !== undefined)
            toast(filledSkipped > 0 ? t('order.filledSkipped', { count: filledSkipped }) : t('order.filled'))
          else toast(skipped > 0 ? t('order.draftRestoredSkipped', { count: skipped }) : t('order.draftRestored'))
        }
        setMenu(loaded)
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [t, toast, filledSkipped])

  // Ask about saving when leaving by the top bar, and warn when closing the tab.
  useRegisterLeaveGuard((to, proceed) => {
    if (!dirty) return false
    setLeaveTo({ to, proceed })
    return true
  })
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!menu || !site)
    return (
      <div className="order-page">
        <h1>{t('pages.order.title')}</h1>
        <Loading failed={failed || siteFailed} />
      </div>
    )

  // Choices the admin has since switched off fall back to what is still available.
  const supplyDate = menu.supplyDates.find((d) => d.date === state.supplyDate) ?? menu.supplyDates[0]
  const fulfillment: Fulfillment =
    state.fulfillment === 'Delivery' && !site.deliveryEnabled
      ? 'Pickup'
      : state.fulfillment === 'Pickup' && !site.pickupEnabled
        ? 'Delivery'
        : state.fulfillment
  const minimum = fulfillment === 'Pickup' && !site.minimumOrderAppliesToPickup ? 0 : (site.minimumOrderAmount ?? 0)
  const belowMinimum = count > 0 && total < minimum
  const payment: Payment = state.payment === 'Transfer' && !site.paymentPhone ? 'OnDelivery' : state.payment
  const normalizedPhone = normalizePhone(state.phone)

  const change = (patch: Partial<OrderState>) => {
    setState((current) => {
      const next = { ...current, ...patch }
      return patch.supplyDate ? { ...next, selections: clampToDate(next.selections, dishes, patch.supplyDate) } : next
    })
    setSubmitError(null)
  }

  const setSelection = (dishId: number, selection: Selection | undefined) =>
    setState((current) => {
      const selections = { ...current.selections }
      if (selection) selections[dishId] = selection
      else delete selections[dishId]
      return { ...current, selections }
    })

  function reset() {
    setState((current) => ({
      ...emptyOrder(),
      name: current.name,
      phone: current.phone,
      city: current.city,
      street: current.street,
      houseNumber: current.houseNumber,
      apartment: current.apartment,
    }))
    setErrors({})
    setSubmitError(null)
    clearDraft()
  }

  function applyQuickFill({ selections, skipped }: Restored) {
    setState((current) => ({ ...current, selections }))
    toast(skipped > 0 ? t('order.quick.appliedSkipped', { count: skipped }) : t('order.quick.applied'))
    setErrors({})
    setSubmitError(null)
  }

  function leave(save: boolean) {
    if (save) saveDraft(state)
    else clearDraft()
    const to = leaveTo
    setLeaveTo(null)
    if (!to) return
    if (to.proceed) void to.proceed()
    else navigate(to.to)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setSubmitError(null)
    if (!normalizedPhone) {
      setErrors({ phone: ['phone'] })
      setSubmitError(t('errors.checkFields'))
      return
    }
    if (!supplyDate) return

    setSubmitting(true)
    try {
      const result = await ordersApi.create({
        phone: normalizedPhone,
        name: state.name.trim(),
        ...(fulfillment === 'Delivery' ? addressOf(state) : noAddress()),
        supplyDate: supplyDate.date,
        fulfillmentMethod: fulfillment,
        paymentMethod: payment,
        notes: state.notes.trim(),
        items: toLines(state.selections),
      })
      clearDraft()
      setConfirmation(result)
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setSubmitError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const categories = menu.categories
    .map((category) => ({ category, dishes: standaloneDishes(menu, category.id) }))
    .filter((group) => group.dishes.length > 0)

  return (
    <div className="order-page">
      <header className="order-hero">
        {siteLogo && <img className="order-hero__logo" src={siteLogo} alt="" />}
        <h1>{t('pages.order.title')}</h1>
        <p className="order-hero__tagline">{t('order.hero.tagline')}</p>
        <ul className="order-hero__chips">
          <li>{t('order.hero.fresh')}</li>
          <li>{t('order.hero.homemade')}</li>
          <li>{t('order.hero.kosher')}</li>
        </ul>
      </header>

      {user && <QuickFill menu={menu} hasOrder={count > 0} onApply={applyQuickFill} />}

      {categories.length === 0 && <p>{t('order.emptyMenu')}</p>}
      {categories.map(({ category, dishes: list }) => (
        <details key={category.id} open className="category">
          <summary>
            <h2>{category.name}</h2>
          </summary>
          <div className="category__dishes">
            {list.map((dish) => (
              <DishCard
                key={dish.id}
                dish={dish}
                dishes={dishes}
                selection={state.selections[dish.id]}
                date={supplyDate?.date}
                onChange={(selection) => setSelection(dish.id, selection)}
              />
            ))}
          </div>
        </details>
      ))}

      <form className="order-form stack" onSubmit={handleSubmit} aria-labelledby="order-details-title" noValidate>
        <h2 id="order-details-title">{t('order.details')}</h2>

        <span className="field">
          <label htmlFor="order-date">{t('order.supplyDate')}</label>
          {supplyDate ? (
            <select
              id="order-date"
              value={supplyDate.date}
              aria-describedby="order-date-hint order-date-error"
              onChange={(e) => change({ supplyDate: e.target.value })}
            >
              {menu.supplyDates.map((d) => (
                <option key={d.date} value={d.date}>
                  {formatSupplyDate(d.date, t)}
                </option>
              ))}
            </select>
          ) : (
            <p role="alert" className="form-error">
              {t('order.noSupplyDates')}
            </p>
          )}
          {supplyDate && (
            <span id="order-date-hint" className="hint">
              {t('order.cutoff', { when: formatCutoff(supplyDate.cutoff) })}
            </span>
          )}
          <FieldError errors={errors} field="supplyDate" id="order-date-error" />
        </span>

        <fieldset>
          <legend>{t('order.fulfillment')}</legend>
          <div className="row">
            {site.deliveryEnabled && (
              <label className="checkbox">
                <input type="radio" name="fulfillment" checked={fulfillment === 'Delivery'} onChange={() => change({ fulfillment: 'Delivery' })} />
                {t('order.delivery')}
              </label>
            )}
            {site.pickupEnabled && (
              <label className="checkbox">
                <input type="radio" name="fulfillment" checked={fulfillment === 'Pickup'} onChange={() => change({ fulfillment: 'Pickup' })} />
                {t('order.pickup')}
              </label>
            )}
          </div>
          {fulfillment === 'Delivery' && (site.deliveryAreaText || site.deliveryFeeText) && (
            <p className="hint">
              {site.deliveryAreaText && <span>{t('order.deliveryArea')}: {site.deliveryAreaText}. </span>}
              {site.deliveryFeeText && <span>{t('order.deliveryFee')}: {site.deliveryFeeText}. </span>}
              {t('order.deliveryCall')}
            </p>
          )}
          <FieldError errors={errors} field="fulfillmentMethod" id="order-fulfillment-error" />
        </fieldset>

        <span className="field">
          <label htmlFor="order-name">{t('order.name')}</label>
          <input
            id="order-name"
            autoComplete="name"
            value={state.name}
            maxLength={100}
            required
            aria-describedby="order-name-error"
            onChange={(e) => change({ name: e.target.value })}
          />
          <FieldError errors={errors} field="name" id="order-name-error" />
        </span>

        <PhoneField phone={state.phone} onPhoneChange={(phone) => change({ phone })} errors={errors} />

        {fulfillment === 'Delivery' && (
          <AddressFields value={state} onChange={change} errors={errors} idPrefix="order" context="order" />
        )}

        <span className="field">
          <label htmlFor="order-notes">{t('order.notes')}</label>
          <textarea id="order-notes" rows={2} maxLength={500} value={state.notes} onChange={(e) => change({ notes: e.target.value })} />
        </span>

        <fieldset>
          <legend>{t('order.payment')}</legend>
          <div className="row">
            <label className="checkbox">
              <input type="radio" name="payment" checked={payment === 'OnDelivery'} onChange={() => change({ payment: 'OnDelivery' })} />
              {t('order.payOnDelivery')}
            </label>
            {site.paymentPhone && (
              <label className="checkbox">
                <input type="radio" name="payment" checked={payment === 'Transfer'} onChange={() => change({ payment: 'Transfer' })} />
                {t('order.payTransfer')}
              </label>
            )}
          </div>
          {payment === 'Transfer' && <p className="hint">{t('order.transferHint')}</p>}
        </fieldset>

        {payment === 'OnDelivery' && <p className="pay-note">{t('order.payOnDeliveryNote')}</p>}
        {site.contact.phone && (
          <p className="muted">
            {t('order.callToChange')} <span dir="ltr">{site.contact.phone}</span>
          </p>
        )}

        {submitError && (
          <p role="alert" className="form-error">
            {submitError}
          </p>
        )}
        <div className="row">
          <button type="submit" disabled={submitting || count === 0 || !supplyDate || belowMinimum}>
            {submitting ? t('order.submitting') : t('order.submit')}
          </button>
          <button type="button" className="button-quiet" onClick={reset}>
            {t('order.reset')}
          </button>
        </div>
        {count === 0 && <p className="hint">{t('order.chooseDishes')}</p>}
        {belowMinimum && (
          <p role="status" className="hint">
            {t('order.belowMinimum', { minimum: formatMoney(minimum), missing: formatMoney(round2(minimum - total)) })}
          </p>
        )}
      </form>

      <div className="total-bar" role="region" aria-label={t('order.totalBar')}>
        <span className="total-bar__counts">
          {totals.main > 0 && <span>{t('order.itemCount', { count: totals.main })}</span>}
          {totals.side > 0 && <span>{t('order.sideDishCount', { count: totals.side })}</span>}
          {totals.drinks > 0 && <span>{t('order.drinksCount', { count: totals.drinks })}</span>}
        </span>
        <strong className="numeric" aria-live="polite">
          {t('order.total')}: {formatMoney(total)}
        </strong>
      </div>

      {leaveTo && <LeaveDialog onSave={() => leave(true)} onDiscard={() => leave(false)} onStay={() => setLeaveTo(null)} />}
      {confirmation && (
        <SuccessDialog
          confirmation={confirmation}
          contactPhone={site.contact.phone}
          onClose={() => {
            setConfirmation(null)
            reset()
          }}
        />
      )}
    </div>
  )
}
