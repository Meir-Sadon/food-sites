/** The address, one field per part. Sent to the server as separate fields. */
export interface AddressParts {
  city: string
  street: string
  houseNumber: string
  apartment: string
}

/** The only city the kitchen delivers to; the city field starts with it. */
export const SERVICE_CITY = 'אשקלון'

export const isServiceCity = (city: string) => city.trim() === SERVICE_CITY

/** A new address: the service city, the rest empty. */
export const emptyAddress = (): AddressParts => ({ city: SERVICE_CITY, street: '', houseNumber: '', apartment: '' })

/** No address at all, for an order that is picked up. */
export const noAddress = (): AddressParts => ({ city: '', street: '', houseNumber: '', apartment: '' })

export const addressOf = (source: AddressParts): AddressParts => ({
  city: source.city.trim(),
  street: source.street.trim(),
  houseNumber: source.houseNumber.trim(),
  apartment: source.apartment.trim(),
})
