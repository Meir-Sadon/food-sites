import { createContext, useContext } from 'react'

/** Shows a short, passing message (saved, restored, sent) at the top of the screen. */
export type ShowToast = (message: string) => void

export const ToastContext = createContext<ShowToast | null>(null)

export function useToast(): ShowToast {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast needs a ToastProvider')
  return show
}
