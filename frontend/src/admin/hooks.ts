import { useCallback, useEffect, useState, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, type FieldErrors } from '../api/client'

/**
 * Loads data once on mount. `reload` fetches again; `setData` applies an API response directly.
 * `unsaved` is true while the data differs from what was last loaded or saved: a value passed to `setData` (an API
 * response) is the new saved state, an updater function (an edit) is not. Use it only for a form's own data, not for
 * a list that is changed through server-confirmed updaters.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setDataState] = useState<T | null>(null)
  const [saved, setSaved] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)

  const setData = useCallback((next: SetStateAction<T | null>) => {
    setDataState(next)
    if (typeof next !== 'function') setSaved(next)
  }, [])

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
  const unsaved = data !== null && saved !== null && JSON.stringify(data) !== JSON.stringify(saved)
  return { data, setData, failed, reload, unsaved }
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
