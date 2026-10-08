import type { Profile, ProfileInput } from '../api/account'
import { addressOf, emptyAddress, type AddressParts } from './addressParts'

/** The personal details shared by registration and the profile page. The phone has its own field. */
export interface ProfileForm extends AddressParts {
  fullName: string
  email: string
  birthday: string
  ethnicBackground: string
}

export const emptyProfileForm = (): ProfileForm => ({
  fullName: '',
  ...emptyAddress(),
  email: '',
  birthday: '',
  ethnicBackground: '',
})

export const formFromProfile = (profile: Profile): ProfileForm => ({
  fullName: profile.fullName,
  city: profile.city,
  street: profile.street,
  houseNumber: profile.houseNumber,
  apartment: profile.apartment,
  email: profile.email ?? '',
  birthday: profile.birthday ?? '',
  ethnicBackground: profile.ethnicBackground ?? '',
})

/**
 * What registration and the profile page send. An empty date input is "", which the server
 * cannot read as a date, so a missing birthday goes as null.
 */
export const profileInput = (phone: string, form: ProfileForm): ProfileInput => ({
  phone,
  ...form,
  fullName: form.fullName.trim(),
  ...addressOf(form),
  birthday: form.birthday || null,
})
