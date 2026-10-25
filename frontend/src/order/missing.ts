/** What the client left out when pressing send, noted at that moment so a field stays on screen while it is typed. */
export interface Missing {
  hour: boolean
  name: boolean
  phone: boolean
  city: boolean
  street: boolean
  houseNumber: boolean
}

export const anyMissing = (missing: Missing) => Object.values(missing).some(Boolean)
