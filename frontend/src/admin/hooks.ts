import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, type FieldErrors } from '../api/client'

/** Loads data once on mount. `reload` fetches again; `setData` applies an API response directly. */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(() => {
    load()
      .then((result) => {
        setData(result)
        setFailed(false)
      })
      .catch(() => setFailed(true))
    // `load` is a stable module-level API function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(reload, [reload])
  return { data, setData, failed, reload }
}

/** Turns an error from the API into one Hebrew sentence. */
export function useErrorMessage() {
  const { t } = useTranslation()
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      const code = error.code ?? Object.values(error.errors)[0]?.[0]
      if (code) return t(`errors.${code}`, { defaultValue: t('errors.generic') })
    }
    return t('errors.generic')
  }
}

/** For a form: points to the field messages when there are any, otherwise explains the error. */
export function useFormErrorMessage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  return (error: unknown) => (Object.keys(fieldErrorsOf(error)).length ? t('errors.checkFields') : errorMessage(error))
}

export function fieldErrorsOf(error: unknown): FieldErrors {
  return error instanceof ApiError ? error.errors : {}
}
