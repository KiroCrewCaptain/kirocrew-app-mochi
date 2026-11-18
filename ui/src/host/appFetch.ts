/**
 * Mochi's page's one way to reach its own routes: the host's permission-scoped
 * client, with `fetch`'s shape.
 *
 * Every call the page makes is to `/api/apps/mochi/...`,
 * which `permissions.api` grants. Each root hands this module the scoped client
 * (`useAppApi()`), which is a same-origin fetch carrying the dashboard's session,
 * refused client-side for any path outside the grant. That client throws on a
 * non-2xx where `fetch` answers; the call sites were written against `fetch` and
 * read `r.ok`, `r.status` and the backend's own `{error, code}` body, so a scoped
 * refusal is turned back into the response it was. A network failure still
 * rejects, as `fetch` does.
 */

/** The part of the scoped client this module uses. */
export interface Transport {
  raw(path: string, init?: RequestInit): Promise<Response>
}

let transport: Transport | null = null

/** Route every call through *next* (each root passes `useAppApi()`). */
export function setTransport(next: Transport | null): void {
  transport = next
}

interface ScopedFailure {
  status: number
  body: string
}

function scopedFailure(err: unknown): ScopedFailure | null {
  if (!err || typeof err !== 'object') return null
  const { status, body } = err as { status?: unknown; body?: unknown }
  return typeof status === 'number' && typeof body === 'string' ? { status, body } : null
}

export async function appFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!transport) return fetch(path, { credentials: 'same-origin', ...init })
  try {
    return await transport.raw(path, { credentials: 'same-origin', ...init })
  } catch (err) {
    const failure = scopedFailure(err)
    if (!failure) throw err
    return new Response(failure.body, {
      status: failure.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
