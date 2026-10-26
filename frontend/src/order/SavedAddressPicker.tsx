import { useTranslation } from 'react-i18next'
import type { SavedAddress } from '../api/account'
import { emptyAddress, sameAddress, type AddressParts } from '../account/addressParts'

const OTHER = 'other'

interface Props {
  addresses: SavedAddress[]
  /** The address now in the order form. */
  value: AddressParts
  /** A saved address was picked (its parts), or "another address" (empty parts, apart from the city). */
  onPick: (address: AddressParts) => void
}

/** "home - Herzl 12, Haifa": the client's own name for the address first, then the address. */
const savedAddressText = (address: SavedAddress) => (address.label ? `${address.label}: ${address.address}` : address.address)

/** The order page's list of the client's saved addresses: the default comes first, and "another address" leaves the fields to fill in. */
export function SavedAddressPicker({ addresses, value, onPick }: Props) {
  const { t } = useTranslation()
  const current = addresses.find((a) => sameAddress(a, value))
  return (
    <span className="field">
      <label htmlFor="order-saved-address">{t('order.savedAddress.label')}</label>
      <select
        id="order-saved-address"
        value={current ? String(current.id) : OTHER}
        onChange={(e) => {
          const picked = addresses.find((a) => String(a.id) === e.target.value)
          onPick(picked ? picked : { ...emptyAddress(), city: value.city })
        }}
      >
        {addresses.map((address) => (
          <option key={address.id} value={address.id}>
            {savedAddressText(address)}
            {address.isDefault ? ` (${t('order.savedAddress.default')})` : ''}
          </option>
        ))}
        <option value={OTHER}>{t('order.savedAddress.other')}</option>
      </select>
    </span>
  )
}
