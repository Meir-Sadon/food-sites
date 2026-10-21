import { useTranslation } from 'react-i18next'
import type { Category, Dish } from '../../api/catalog'
import type { FieldErrors } from '../../api/client'
import { FieldError, Info } from '../ui'
import { formKey, type AddOnForm, type GroupForm } from './addOnForm'

/** The most times one add-on can be offered under a dish (the server allows the same number). */
const MAX_SLOTS = 10

interface Props {
  groups: GroupForm[]
  addOns: AddOnForm[]
  /** Dishes that can be offered under this one. */
  candidates: Dish[]
  /** Every dish, removed ones included, to name the add-ons already linked. */
  allDishes: Dish[]
  categories: Category[]
  errors: FieldErrors
  onChange: (patch: { groups?: GroupForm[]; addOns?: AddOnForm[] }) => void
}

/** The dish's own add-ons, set from the dish: their price and limit under it, check boxes and named groups with a limit. */
export function AddOnsSection({ groups, addOns, candidates, allDishes, categories, errors, onChange }: Props) {
  const { t } = useTranslation()
  const byId = new Map(allDishes.map((d) => [d.id, d]))
  const available = candidates.filter((d) => !addOns.some((a) => a.dishId === d.id))
  const fieldError = (field: string) => <FieldError errors={errors} field={field} id={`dish-${field}-error`} />
  const described = (field: string) => ({ 'aria-describedby': `dish-${field}-error` })

  const setGroup = (key: number, patch: Partial<GroupForm>) =>
    onChange({ groups: groups.map((g) => (g.key === key ? { ...g, ...patch } : g)) })
  const setAddOn = (key: number, patch: Partial<AddOnForm>) =>
    onChange({ addOns: addOns.map((a) => (a.key === key ? { ...a, ...patch } : a)) })

  return (
    <fieldset className="stack" aria-labelledby="dish-addons-title">
      <legend className="with-info">
        <span id="dish-addons-title">{t('admin.dishes.ownAddOns')}</span>
        <Info text={t('admin.dishes.ownAddOnsHint')} about={t('admin.dishes.ownAddOns')} />
      </legend>

      <fieldset className="stack" aria-labelledby="dish-groups-title">
        <legend className="with-info">
          <span id="dish-groups-title">{t('admin.dishes.groups')}</span>
          <Info text={t('admin.dishes.groupsHint')} about={t('admin.dishes.groups')} />
        </legend>
        {groups.map((group, index) => {
          const n = index + 1
          const field = (name: string) => `addOnGroups[${index}].${name}`
          return (
            <div key={group.key} className="option-row" role="group" aria-label={t('admin.dishes.groupN', { n })}>
              <span className="field field--grow">
                <label htmlFor={`group-${group.key}-name`}>{t('admin.dishes.groupName')}</label>
                <input
                  id={`group-${group.key}-name`}
                  maxLength={50}
                  value={group.name}
                  onChange={(e) => setGroup(group.key, { name: e.target.value })}
                  {...described(field('name'))}
                />
                {fieldError(field('name'))}
              </span>
              <span className="field field--narrow">
                <label htmlFor={`group-${group.key}-max`}>{t('admin.dishes.groupMax')}</label>
                <input
                  id={`group-${group.key}-max`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={group.maxUnits}
                  onChange={(e) => setGroup(group.key, { maxUnits: e.target.value })}
                  {...described(field('maxUnits'))}
                />
                {fieldError(field('maxUnits'))}
              </span>
              {group.maxUnits.trim() !== '' && (
                <span className="field field--narrow">
                  <label htmlFor={`group-${group.key}-over`}>{t('admin.dishes.groupOverPrice')}</label>
                  <input
                    id={`group-${group.key}-over`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder={t('admin.dishes.overPricePlaceholder')}
                    value={group.overLimitPrice}
                    onChange={(e) => setGroup(group.key, { overLimitPrice: e.target.value })}
                    {...described(field('overLimitPrice'))}
                  />
                  {fieldError(field('overLimitPrice'))}
                </span>
              )}
              <button
                type="button"
                className="button-quiet"
                aria-label={t('admin.dishes.removeGroup', { n })}
                onClick={() =>
                  onChange({
                    groups: groups.filter((g) => g.key !== group.key),
                    addOns: addOns.map((a) => (a.groupKey === group.key ? { ...a, groupKey: null } : a)),
                  })
                }
              >
                {t('admin.remove')}
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="button-quiet"
          onClick={() => onChange({ groups: [...groups, { key: formKey(), id: null, name: '', maxUnits: '', overLimitPrice: '' }] })}
        >
          {t('admin.dishes.addGroup')}
        </button>
      </fieldset>

      {addOns.length === 0 && <p>{t('admin.dishes.noOwnAddOns')}</p>}
      {addOns.map((addOn, index) => {
        const dish = byId.get(addOn.dishId)
        const baseName = dish ? `${dish.name}${dish.isHidden ? ` (${t('admin.dishes.removedTag')})` : ''}` : `#${addOn.dishId}`
        const repeated = addOns.filter((a) => a.dishId === addOn.dishId).length > 1
        const name = repeated && addOn.label.trim() ? `${baseName} (${addOn.label.trim()})` : baseName
        const field = (part: string) => `addOns[${index}].${part}`
        return (
          <div key={addOn.key} className="option-row" role="group" aria-label={name}>
            <strong className="field--grow">{name}</strong>
            {repeated && (
              <span className="field field--narrow">
                <label htmlFor={`addon-${addOn.key}-label`}>{t('admin.dishes.addOnLabel')}</label>
                <input
                  id={`addon-${addOn.key}-label`}
                  maxLength={30}
                  placeholder={t('admin.dishes.addOnLabelPlaceholder')}
                  value={addOn.label}
                  onChange={(e) => setAddOn(addOn.key, { label: e.target.value })}
                  {...described(field('label'))}
                />
                {fieldError(field('label'))}
              </span>
            )}
            {groups.length > 0 && (
              <span className="field field--narrow">
                <label htmlFor={`addon-${addOn.key}-group`}>{t('admin.dishes.addOnGroup')}</label>
                <select
                  id={`addon-${addOn.key}-group`}
                  value={addOn.groupKey ?? ''}
                  onChange={(e) => setAddOn(addOn.key, { groupKey: e.target.value === '' ? null : Number(e.target.value) })}
                  {...described(field('group'))}
                >
                  <option value="">{t('admin.dishes.noGroup')}</option>
                  {groups.map((g, n) => (
                    <option key={g.key} value={g.key}>
                      {g.name || t('admin.dishes.groupN', { n: n + 1 })}
                    </option>
                  ))}
                </select>
                {fieldError(field('group'))}
              </span>
            )}
            <span className="field field--narrow">
              <label htmlFor={`addon-${addOn.key}-price`}>{t('admin.dishes.addOnPrice')}</label>
              <input
                id={`addon-${addOn.key}-price`}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder={t('admin.dishes.addOnPricePlaceholder')}
                value={addOn.price}
                onChange={(e) => setAddOn(addOn.key, { price: e.target.value })}
                {...described(field('price'))}
              />
              {fieldError(field('price'))}
            </span>
            {!addOn.isCheckbox && !dish?.isYesNo && (
              <span className="field field--narrow">
                <label htmlFor={`addon-${addOn.key}-max`}>{t('admin.dishes.addOnMax')}</label>
                <input
                  id={`addon-${addOn.key}-max`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={addOn.maxQuantity}
                  onChange={(e) => setAddOn(addOn.key, { maxQuantity: e.target.value })}
                  {...described(field('maxQuantity'))}
                />
                {fieldError(field('maxQuantity'))}
              </span>
            )}
            {!addOn.isCheckbox && !dish?.isYesNo && addOn.maxQuantity.trim() !== '' && (
              <span className="field field--narrow">
                <label htmlFor={`addon-${addOn.key}-over`}>{t('admin.dishes.addOnOverPrice')}</label>
                <input
                  id={`addon-${addOn.key}-over`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder={t('admin.dishes.overPricePlaceholder')}
                  value={addOn.overLimitPrice}
                  onChange={(e) => setAddOn(addOn.key, { overLimitPrice: e.target.value })}
                  {...described(field('overLimitPrice'))}
                />
                {fieldError(field('overLimitPrice'))}
              </span>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={addOn.isCheckbox || !!dish?.isYesNo}
                disabled={!!dish?.isYesNo}
                onChange={(e) => setAddOn(addOn.key, { isCheckbox: e.target.checked })}
              />
              {t('admin.dishes.addOnCheckbox')}
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={addOn.showImage} onChange={(e) => setAddOn(addOn.key, { showImage: e.target.checked })} />
              {t('admin.dishes.addOnShowImage')}
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={addOn.isDefault} onChange={(e) => setAddOn(addOn.key, { isDefault: e.target.checked })} />
              {t('admin.dishes.addOnDefault')}
            </label>
            <button
              type="button"
              className="button-quiet"
              aria-label={t('admin.dishes.offerAddOnAgain', { name })}
              disabled={addOns.filter((a) => a.dishId === addOn.dishId).length >= MAX_SLOTS}
              onClick={() => {
                const same = addOns.filter((a) => a.dishId === addOn.dishId)
                const copy = { ...addOn, key: formKey(), slot: Math.max(...same.map((a) => a.slot)) + 1, label: '', isDefault: false }
                const at = addOns.findLastIndex((a) => a.dishId === addOn.dishId)
                onChange({ addOns: [...addOns.slice(0, at + 1), copy, ...addOns.slice(at + 1)] })
              }}
            >
              {t('admin.dishes.offerAgain')}
            </button>
            <button
              type="button"
              className="button-quiet"
              aria-label={t('admin.dishes.removeAddOn', { name })}
              onClick={() => onChange({ addOns: addOns.filter((a) => a.key !== addOn.key) })}
            >
              {t('admin.remove')}
            </button>
            {fieldError(field('dishId'))}
          </div>
        )
      })}

      {available.length > 0 && (
        <span className="field">
          <label htmlFor="dish-add-addon">{t('admin.dishes.addAddOn')}</label>
          <select
            id="dish-add-addon"
            value=""
            onChange={(e) =>
              e.target.value &&
              onChange({
                addOns: [
                  ...addOns,
                  {
                    key: formKey(),
                    dishId: Number(e.target.value),
                    groupKey: null,
                    price: '',
                    maxQuantity: '',
                    isCheckbox: false,
                    slot: 0,
                    label: '',
                    showImage: false,
                    isDefault: false,
                    overLimitPrice: '',
                  },
                ],
              })
            }
          >
            <option value="">{t('admin.dishes.chooseAddOn')}</option>
            {categories.map((category) => {
              const inCategory = available.filter((d) => d.categoryId === category.id)
              return inCategory.length === 0 ? null : (
                <optgroup key={category.id} label={category.name}>
                  {inCategory.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </span>
      )}
    </fieldset>
  )
}
