import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ToastContext } from './toast'

/** How long a toast stays before it goes away by itself. */
export const TOAST_MS = 5000

type Toast = { id: number; message: string }

/** Holds the toasts for the whole app; errors stay next to the form they belong to. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string) => {
      const id = ++nextId.current
      // The same message again (saving twice) replaces the old one rather than stacking.
      setToasts((list) => [...list.filter((toast) => toast.message !== message), { id, message }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_MS),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => clearTimeout(timer))
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <p key={toast.id} className="toast">
            <span>{toast.message}</span>
            <button type="button" className="toast__close" aria-label={t('toast.dismiss')} onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
