/**
 * The two dashboard formatters Mochi's page uses that the App Kit SDK does not
 * export (`fmtDateFields`, `fmtPercent`), with the dashboard's own behaviour
 * (`website/src/i18n/format.ts` in Kiro Crew): the host's active language,
 * `localeMatcher: 'lookup'`, and a dash for a value that cannot be shown. The
 * SDK's `fmtNumber`, `fmtDate` and `activeLocale` are the host's own.
 */
import { activeLocale, fmtNumber } from '@kirocrew/app-sdk'

export type NumberOptions = Omit<Intl.NumberFormatOptions, 'localeMatcher'>
export type DateOptions = Omit<Intl.DateTimeFormatOptions, 'localeMatcher'>
export type DateFieldOptions = Omit<DateOptions, 'dateStyle' | 'timeStyle'>

/** What the dashboard shows for a value it cannot format (U+2014). */
const NO_VALUE = '\u2014'

/** A millisecond timestamp below this is read as seconds, as the dashboard does. */
const SECONDS_CEILING = 1e11

function locale(): string {
  try {
    const value = activeLocale()
    return typeof value === 'string' && value ? value : 'en'
  } catch {
    return 'en'
  }
}

const formatters = new Map<string, unknown>()

function memo<T>(kind: string, lng: string, options: unknown, build: () => T): T {
  const key = `${kind}|${lng}|${JSON.stringify(options ?? null)}`
  const hit = formatters.get(key)
  if (hit !== undefined) return hit as T
  const made = build()
  formatters.set(key, made)
  return made
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    const d = new Date(value < SECONDS_CEILING ? value * 1000 : value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function dateTime(value: Date | string | number | null | undefined, options: DateOptions): string {
  const d = toDate(value)
  if (!d) return NO_VALUE
  const lng = locale()
  return memo('datetime', lng, options, () =>
    new Intl.DateTimeFormat(lng, { localeMatcher: 'lookup', ...options }),
  ).format(d)
}

/** A ratio as a percentage (`0.5` reads `50%`), whole percents unless *options* say otherwise. */
export function fmtPercent(ratio: number, options?: NumberOptions): string {
  if (!Number.isFinite(ratio)) return NO_VALUE
  return fmtNumber(ratio, { style: 'percent', maximumFractionDigits: 0, ...options })
}

/** A date from explicit components (`weekday`, `hour`, ...), never a style preset. */
export function fmtDateFields(
  value: Date | string | number | null | undefined,
  options: DateFieldOptions,
): string {
  return dateTime(value, options)
}
