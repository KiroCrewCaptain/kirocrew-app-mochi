/**
 * The error a failed call to the app's own routes throws, as the dashboard's
 * `toApiError` builds it for a gateway answer (`website/src/api/apiError.ts` in
 * Kiro Crew): the status, the raw body, and as its message the human text the
 * backend put in `error` (or `detail` / `message`), else `HTTP <status>`.
 *
 * The dashboard's copy also rewrites a few answers no Mochi route gives (a tunnel
 * edge's throttle or sign-in page, a full session table) into its own catalog's
 * sentences; those strings are the dashboard's, so a refusal of that kind reads
 * `HTTP <status>` here.
 */

export class ApiError extends Error {
  readonly status: number
  /** The raw response body, for a caller that reads structured fields. */
  readonly body: string

  constructor(status: number, message: string, body = '') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function bodyMessage(body: string): string {
  const trimmed = body.trim()
  if (!trimmed.startsWith('{')) return ''
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown> | null
    const value = ['error', 'detail', 'message'].map((key) => parsed?.[key]).find((v) => v != null)
    return typeof value === 'string' && value.trim() ? value : ''
  } catch {
    return ''
  }
}

/** Read a failed `Response` once and build the {@link ApiError} for it. */
export async function toApiError(r: Response): Promise<ApiError> {
  const body = await r.text().catch(() => '')
  return new ApiError(r.status, bodyMessage(body) || `HTTP ${r.status}`, body)
}
