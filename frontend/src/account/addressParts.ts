/** The address, one field per part. Sent to the server as separate fields. */
export interface AddressParts {
  city: string
  street: string
  houseNumber: string
  apartment: string
}

export const emptyAddress = (): AddressParts => ({ city: '', street: '', houseNumber: '', apartment: '' })

export const addressOf = (source: AddressParts): AddressParts => ({
  city: source.city.trim(),
  street: source.street.trim(),
  houseNumber: source.houseNumber.trim(),
  apartment: source.apartment.trim(),
})
