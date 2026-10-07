import { createContext, useContext } from 'react'
import type { Profile } from '../api/account'

export interface AccountState {
  /** The logged-in client, or null for a guest. */
  user: Profile | null
  /** True until the first check of the session has finished. */
  loading: boolean
  setUser: (user: Profile | null) => void
  logout: () => Promise<void>
}

export const AccountContext = createContext<AccountState>({
  user: null,
  loading: false,
  setUser: () => {},
  logout: async () => {},
})

export const useAccount = () => useContext(AccountContext)
