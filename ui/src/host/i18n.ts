/**
 * The app's own strings. A bundle cannot read the dashboard's catalogs (those
 * belong to the host and change with it), so every locale the dashboard ships is
 * bundled here and looked up against the host's active language.
 *
 * The catalogs (`ui/i18n/<locale>.json`) are the groups of Kiro Crew's
 * `apps.mochi.*` dashboard catalogs the page names, under the SAME key paths, so
 * every call site reads as it did in the built-in. `tests/catalogs.test.ts` pins that every key a source file names
 * is in the English catalog.
 *
 * The rules are the dashboard's (i18next as Kiro Crew configures it): the exact
 * locale (`pt`, `zh-CN`), then its base language, then English, then the key
 * itself; a numeric `count` picks the plural form the locale's rules name
 * (`_one`, `_few`, `_many`, `_other`); an empty string falls through to English;
 * `{{name}}` placeholders are filled from `vars`, `{{productName}}` defaults to
 * the product's name, a value is inserted literally (never re-read as a
 * placeholder), and one with no value is left as written.
 *
 * `i18nT` reads the language at call time. Each window's root subscribes to the
 * host's language changes (`useLanguageGeneration`), and its re-render reaches
 * every child, so a language switch repaints without a reload.
 */

import { activeLocale } from '@kirocrew/app-sdk'
import bn from '../../i18n/bn.json'
import de from '../../i18n/de.json'
import en from '../../i18n/en.json'
import es from '../../i18n/es.json'
import fr from '../../i18n/fr.json'
import hi from '../../i18n/hi.json'
import it from '../../i18n/it.json'
import ja from '../../i18n/ja.json'
import ko from '../../i18n/ko.json'
import pt from '../../i18n/pt.json'
import ru from '../../i18n/ru.json'
import zhCN from '../../i18n/zh-CN.json'

interface Catalog {
  [key: string]: string | Catalog
}

export const CATALOGS: Readonly<Record<string, Catalog>> = {
  bn, de, en, es, fr, hi, it, ja, ko, pt, ru, 'zh-CN': zhCN,
}

/** What `{{productName}}` reads when the caller passes none. */
export const PRODUCT_NAME = 'Kiro Crew'

const own = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

function lookup(catalog: Catalog | undefined, key: string): string | undefined {
  let node: string | Catalog | undefined = catalog
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string' || !own(node, part)) return undefined
    node = node[part]
  }
  return typeof node === 'string' && node !== '' ? node : undefined
}

/** The catalogs to try for `locale`, most specific first, always ending in English. */
export function localeChain(locale: string): string[] {
  const chain: string[] = []
  const add = (candidate: string) => {
    if (own(CATALOGS, candidate) && !chain.includes(candidate)) chain.push(candidate)
  }
  add(locale)
  add(locale.split('-')[0])
  add('en')
  return chain
}

export function currentLocale(): string {
  try {
    const locale = activeLocale()
    return typeof locale === 'string' && locale ? locale : 'en'
  } catch {
    return 'en'
  }
}

function pluralForm(locale: string, count: number): string {
  try {
    return new Intl.PluralRules(locale).select(count)
  } catch {
    return count === 1 ? 'one' : 'other'
  }
}

export type Vars = Record<string, unknown>

/** Fill each `{{ name }}` from *vars* in one pass, so an inserted value is never read again. */
function interpolate(text: string, vars: Vars): string {
  let out = ''
  let at = 0
  for (;;) {
    const open = text.indexOf('{{', at)
    if (open < 0) break
    const close = text.indexOf('}}', open + 2)
    if (close < 0) break
    const name = text.slice(open + 2, close).trim()
    out += text.slice(at, open)
    out += own(vars, name) && vars[name] !== undefined ? String(vars[name]) : text.slice(open, close + 2)
    at = close + 2
  }
  return out + text.slice(at)
}

export function i18nT(key: string, vars?: Vars): string {
  const count = vars && typeof vars.count === 'number' ? vars.count : undefined
  const values: Vars = { productName: PRODUCT_NAME, ...(vars ?? {}) }
  for (const locale of localeChain(currentLocale())) {
    const catalog = CATALOGS[locale]
    let text: string | undefined
    if (count !== undefined) {
      text = lookup(catalog, `${key}_${pluralForm(locale, count)}`) ?? lookup(catalog, `${key}_other`)
    }
    text = text ?? lookup(catalog, key)
    if (text !== undefined) return interpolate(text, values)
  }
  return key
}

/** The dashboard's bootstrap call; the catalogs here are bundled, so there is nothing to do. */
export function initI18n(): void {}
