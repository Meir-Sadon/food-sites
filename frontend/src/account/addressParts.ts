/** What the client says the address is; empty when they did not say ("not set"). */
export type BuildingType = '' | 'Building' | 'PrivateHouse'

export const BUILDING_TYPES: readonly BuildingType[] = ['Building', 'PrivateHouse']

/** The address, one field per part. Sent to the server as separate fields. */
export interface AddressParts {
  city: string
  street: string
  houseNumber: string
  apartment: string
  buildingType: BuildingType
}

/**
 * Whether the kitchen delivers to this city (the admin's service cities, from /api/site).
 * An empty list means every city is served.
 */
export const isServiceCity = (city: string, serviceCities: readonly string[]) =>
  serviceCities.length === 0 || serviceCities.includes(city.trim())

/** "אשקלון", "אשקלון ואשדוד", "אשקלון, אשדוד ושדרות". */
export const formatCities = (cities: readonly string[], language: string) =>
  new Intl.ListFormat(language, { type: 'conjunction' }).format(cities)

/** A new address, all empty. The address fields fill in the first service city once it is known. */
export const emptyAddress = (): AddressParts => ({ city: '', street: '', houseNumber: '', apartment: '', buildingType: '' })

/** No address at all, for an order that is picked up. */
export const noAddress = (): AddressParts => ({ city: '', street: '', houseNumber: '', apartment: '', buildingType: '' })

export const addressOf = (source: AddressParts): AddressParts => ({
  city: source.city.trim(),
  street: source.street.trim(),
  houseNumber: source.houseNumber.trim(),
  apartment: source.apartment.trim(),
  buildingType: source.buildingType,
})

/** "הרצל 12, דירה 5, בניין, חיפה"; parts that were left empty are skipped (as the server's AddressFormat). */
export const formatAddress = (
  source: AddressParts,
  apartmentLabel: (apartment: string) => string,
  buildingLabel?: (type: Exclude<BuildingType, ''>) => string,
) => {
  const { city, street, houseNumber, apartment, buildingType } = addressOf(source)
  const line = [street, houseNumber].filter(Boolean).join(' ')
  return [line, apartment && apartmentLabel(apartment), buildingType && buildingLabel?.(buildingType), city].filter(Boolean).join(', ')
}

/** Whether every required part of the address is filled in. */
export const hasAddress = (source: AddressParts) =>
  [source.city, source.street, source.houseNumber].every((part) => part.trim() !== '')

/** Whether two addresses are the same, ignoring spaces around the parts. */
export const sameAddress = (a: AddressParts, b: AddressParts) => {
  const [x, y] = [addressOf(a), addressOf(b)]
  return x.city === y.city && x.street === y.street && x.houseNumber === y.houseNumber && x.apartment === y.apartment && x.buildingType === y.buildingType
}
