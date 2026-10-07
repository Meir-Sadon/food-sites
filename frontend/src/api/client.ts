const baseUrl = import.meta.env.VITE_API_URL ?? ''

/** The full URL of an API path, for links the browser opens itself (a download). */
export const apiUrl = (path: string) => `${baseUrl}${path}`

/** Sent on every request; the API refuses changes without it (blocks cross-site forms). */
export const requestHeader = { 'X-Food-Site-Request': '1' }

export type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  /** Error code for the whole request, e.g. "categoryNotEmpty". */
  readonly code?: string
  /** Validation error codes per field, with lower-case field names. */
  readonly errors: FieldErrors

  constructor(status: number, body?: { code?: string; errors?: FieldErrors } | null) {
    super(`API request failed with status ${status}`)
    this.status = status
    this.code = body?.code
    this.errors = Object.fromEntries(
      Object.entries(body?.errors ?? {}).map(([field, codes]) => [field.toLowerCase(), codes]),
    )
  }
}

/** Calls the API with the session cookie attached. Throws ApiError on a non-2xx response. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const isJson = typeof init.body === 'string'
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...requestHeader, ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new ApiError(response.status, body)
  }
  return response
}

/** Calls the API and returns the parsed JSON body (undefined for 204). */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init)
  return (response.status === 204 ? undefined : await response.json()) as T
}

export const send = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
})
