import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { accountApi, MAX_ADDRESSES, type AddressInput, type Profile, type SavedAddress } from '../api/account'
import type { FieldErrors } from '../api/client'
import { Status } from '../admin/ui'
import { fieldErrorsOf, useFormErrorMessage } from '../admin/hooks'
import { AddressFields } from '../account/AddressFields'
import { emptyAddress, type AddressParts } from '../account/addressParts'

interface Props {
  user: Profile
  onSaved: (profile: Profile) => void
}

interface Draft extends AddressParts {
  label: string
  makeDefault: boolean
}

const draftOf = (address?: SavedAddress): Draft =>
  address
    ? { label: address.label ?? '', city: address.city, street: address.street, houseNumber: address.houseNumber, apartment: address.apartment, makeDefault: address.isDefault }
    : { label: '', ...emptyAddress(), makeDefault: false }

/** The client's saved addresses (home, work...): add, edit, delete and pick the default, which the order page offers first. */
export function AddressesSection({ user, onSaved }: Props) {
  const { t } = useTranslation()
  const formError = useFormErrorMessage()
  // The id of the address being edited, 0 for a new one, null for none.
  const [editing, setEditing] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>(draftOf())
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const start = (id: number, address?: SavedAddress) => {
    setEditing(id)
    setDeleting(null)
    setDraft(draftOf(address))
    setErrors({})
    setError(null)
  }

  async function run(action: () => Promise<Profile>) {
    setError(null)
    setBusy(true)
    try {
      onSaved(await action())
      setEditing(null)
      setDeleting(null)
      return true
    } catch (err) {
      setErrors(fieldErrorsOf(err))
      setError(formError(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    const input: AddressInput = {
      label: draft.label.trim(),
      city: draft.city.trim(),
      street: draft.street.trim(),
      houseNumber: draft.houseNumber.trim(),
      apartment: draft.apartment.trim(),
      makeDefault: draft.makeDefault,
    }
    return run(() => (editing ? accountApi.updateAddress(editing, input) : accountApi.addAddress(input)))
  }

  const form = (
    <form className="stack address-form" onSubmit={save} noValidate aria-label={editing ? t('profile.addresses.edit') : t('profile.addresses.add')}>
      <span className="field">
        <label htmlFor="address-label">{t('profile.addresses.label')}</label>
        <input
          id="address-label"
          maxLength={40}
          placeholder={t('profile.addresses.labelExample')}
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
        />
      </span>
      <AddressFields
        value={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        errors={errors}
        idPrefix="saved-address"
        context="profile"
      />
      {user.addresses.length > 0 && (
        <label className="checkbox">
          <input type="checkbox" checked={draft.makeDefault} onChange={(e) => setDraft((d) => ({ ...d, makeDefault: e.target.checked }))} />
          {t('profile.addresses.makeDefault')}
        </label>
      )}
      {error && <Status message={error} error />}
      <div className="row">
        <button type="submit" disabled={busy}>
          {busy ? t('admin.saving') : t('admin.save')}
        </button>
        <button type="button" className="button-quiet" onClick={() => setEditing(null)}>
          {t('profile.addresses.cancel')}
        </button>
      </div>
    </form>
  )

  return (
    <section className="account-section" aria-labelledby="profile-addresses-title">
      <h2 id="profile-addresses-title">{t('profile.addresses.title')}</h2>
      {user.addresses.length === 0 && editing === null && <p className="muted">{t('profile.addresses.none')}</p>}
      <ul className="address-list">
        {user.addresses.map((address) => (
          <li key={address.id} className="address-list__item">
            {editing === address.id ? (
              form
            ) : (
              <>
                <p>
                  {address.label && <strong>{address.label}: </strong>}
                  {address.address}
                  {address.isDefault && <span className="badge"> {t('profile.addresses.default')}</span>}
                </p>
                {deleting === address.id ? (
                  <div className="row" role="group" aria-label={t('profile.addresses.deleteConfirm')}>
                    <span>{t('profile.addresses.deleteConfirm')}</span>
                    <button type="button" disabled={busy} onClick={() => run(() => accountApi.deleteAddress(address.id))}>
                      {t('profile.addresses.deleteYes')}
                    </button>
                    <button type="button" className="button-quiet" onClick={() => setDeleting(null)}>
                      {t('profile.addresses.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="row">
                    {!address.isDefault && (
                      <button type="button" className="button-quiet" disabled={busy} onClick={() => run(() => accountApi.makeDefaultAddress(address.id))}>
                        {t('profile.addresses.setDefault')}
                      </button>
                    )}
                    <button type="button" className="button-quiet" onClick={() => start(address.id, address)}>
                      {t('profile.addresses.edit')}
                    </button>
                    <button type="button" className="button-quiet" onClick={() => setDeleting(address.id)}>
                      {t('profile.addresses.delete')}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {error && editing === null && <Status message={error} error />}
      {editing === 0 ? (
        form
      ) : (
        <div className="row">
          <button type="button" className="button-quiet" disabled={user.addresses.length >= MAX_ADDRESSES} onClick={() => start(0)}>
            {t('profile.addresses.add')}
          </button>
        </div>
      )}
    </section>
  )
}
