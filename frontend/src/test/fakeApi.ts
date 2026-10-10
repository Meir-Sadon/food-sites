import { vi } from 'vitest'

type Reply = { status?: number; body?: unknown }
type Handler = (match: RegExpMatchArray, body: unknown) => Reply | unknown

export interface Call {
  method: string
  path: string
  body: unknown
  headers: Record<string, string>
}

/**
 * Replaces fetch with a tiny in-memory API. Routes are "METHOD /path" with regex groups,
 * e.g. "PUT /api/admin/dishes/(\\d+)". A handler returns a body (status 200) or { status, body }.
 */
export function fakeApi(routes: Record<string, Handler>) {
  const calls: Call[] = []
  const compiled = Object.entries(routes).map(([key, handler]) => {
    const [method, pattern] = key.split(' ')
    return { method, regex: new RegExp(`${pattern}$`), handler }
  })

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    const raw = init?.body
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw
    calls.push({ method, path, body, headers: (init?.headers ?? {}) as Record<string, string> })

    for (const route of compiled) {
      const match = method === route.method ? path.match(route.regex) : null
      if (!match) continue
      const result = route.handler(match, body)
      const reply: Reply =
        result && typeof result === 'object' && ('status' in result || 'body' in result) ? (result as Reply) : { body: result }
      const status = reply.status ?? (reply.body === undefined ? 204 : 200)
      return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), { status })
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  })

  return {
    calls,
    /** Requests with this method whose path ends with `path`. */
    sent: (method: string, path: string) => calls.filter((c) => c.method === method && c.path.endsWith(path)),
  }
}

export const invalid = (errors: Record<string, string[]>) => ({ status: 400, body: { errors } })

export const adminSession = { 'GET /api/admin/me': () => ({ role: 'admin', actor: 'owner', username: 'admin' }) }

/** The master admin's session, for screens that differ between the two admins. */
export const masterSession = { 'GET /api/admin/me': () => ({ role: 'admin', actor: 'master', username: 'master' }) }
