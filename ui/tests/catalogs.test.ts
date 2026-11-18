/**
 * The app's bundled strings.
 *
 * Every key a source file names literally is in the English catalog (a missing
 * one renders as the bare key), every locale carries only keys English has, and
 * the lookup follows the dashboard's rules: base language, then English, plural
 * forms, `{{productName}}`, and values inserted literally.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CATALOGS, i18nT } from '../src/host/i18n'
import { stubLocale } from './stubs/app-sdk'

const SRC = join(__dirname, '..', 'src')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

type Tree = { [k: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.set(key, v)
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv)
  }
  return out
}

const EN = flatten(CATALOGS.en as Tree)

afterEach(() => stubLocale('en'))

describe('the catalogs', () => {
  it('has every key a source file names', () => {
    const missing: string[] = []
    for (const file of files(SRC)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/['"`](apps\.mochi\.[A-Za-z0-9_.]+)['"`]/g)) {
        const key = m[1]
        if (key.endsWith('.')) continue
        const known = EN.has(key) || [...EN.keys()].some((k) => k.startsWith(`${key}_`) || k.startsWith(`${key}.`))
        if (!known) missing.push(`${file.slice(SRC.length + 1)}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('carries in every locale only keys English has', () => {
    for (const [locale, tree] of Object.entries(CATALOGS)) {
      const extra = [...flatten(tree as Tree).keys()].filter((k) => !EN.has(k) && !k.match(/_(zero|one|two|few|many|other)$/))
      expect(extra, locale).toEqual([])
    }
  })
})

describe('lookup', () => {
  it('reads the active language, then English', () => {
    stubLocale('de')
    const de = i18nT('apps.mochi.mochiPage.page_range')
    expect(de).toBeTruthy()
    stubLocale('xx')
    expect(i18nT('apps.mochi.mochiPage.page_range')).toBe(EN.get('apps.mochi.mochiPage.page_range'))
  })

  it('answers a missing key with the key', () => {
    expect(i18nT('apps.mochi.no.such.key')).toBe('apps.mochi.no.such.key')
  })

  it('inserts a value literally, never as another placeholder', () => {
    const key = [...EN.entries()].find(([, v]) => v.includes('{{value}}'))?.[0]
    expect(key).toBeTruthy()
    const out = i18nT(key!, { value: '{{productName}} {{value}}' })
    expect(out).toContain('{{productName}} {{value}}')
  })
})
