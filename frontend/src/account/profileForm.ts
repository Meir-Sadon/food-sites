import type { Profile } from '../api/account'

/** The personal details shared by registration and the profile page. The phone has its own field. */
export interface ProfileForm {
  fullName: string
  address: string
  email: string
  birthday: string
  ethnicBackground: string
}

export const emptyProfileForm = (): ProfileForm => ({
  fullName: '',
  address: '',
  email: '',
  birthday: '',
  ethnicBackground: '',
})

export const formFromProfile = (profile: Profile): ProfileForm => ({
  fullName: profile.fullName,
  address: profile.address,
  email: profile.email ?? '',
  birthday: profile.birthday ?? '',
  ethnicBackground: profile.ethnicBackground ?? '',
})
