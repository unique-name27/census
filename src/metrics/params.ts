/**
 * Calculation settings: validation against their definition, parsing from text (forms and the
 * Excel dictionary) and plain wording with units ("95%", "365 d", "0.90 to 1.10"). Pure.
 */
import { partsToDate, readDate } from '@/data/import/dates'
import { formatDate, isCalendarDate } from '@/lib/dates'
import type { Format } from '@/lib/format'
import type { NumberRange, ParamDef, ParamValue, RatingKey, RatingMap } from './types'

/** Highest first, the order ratings are listed in. */
export const RATING_KEYS: readonly RatingKey[] = [5, 4, 3, 2, 1]

export type ParamCheck = { ok: true; value: ParamValue } | { ok: false; error: string }

const MINUS = '−'
const NUMERIC_TYPES: ReadonlySet<ParamDef['type']> = new Set(['number', 'percent', 'days', 'months'])

export const isNumericParam = (def: Pick<ParamDef, 'type'>): boolean => NUMERIC_TYPES.has(def.type)

const PCT_FORMATS: ReadonlySet<Format> = new Set(['pct', 'pct0', 'pct2', 'pts', 'pts2'])

/** The format numbers of this setting show in (rating-map and range elements too). */
export function paramFormat(def: Pick<ParamDef, 'type' | 'format'>): Format {
  if (def.format) return def.format
  switch (def.type) {
    case 'percent':
      return 'pct'
    case 'days':
      return 'days'
    case 'months':
      return 'int'
    default:
      return 'num2'
  }
}

/** Numbers of this setting are shares (typed as "95%"). */
export const isShareParam = (def: Pick<ParamDef, 'type' | 'format'>): boolean =>
  PCT_FORMATS.has(paramFormat(def))

/** Drop float noise such as 0.045000000000000005. */
const clean = (n: number): number => (Number.isFinite(n) ? +n.toPrecision(12) : n)

function trimmed(v: number, digits: number): string {
  const s = clean(v).toLocaleString('en-US', { maximumFractionDigits: Math.min(20, Math.max(0, digits)) })
  return s.startsWith('-') ? `${MINUS}${s.slice(1)}` : s
}

/** At least `min` decimals and up to `max`, without grouping: 0.9 → "0.90", 0.955 → "0.955". */
function fixed(v: number, min: number, max: number): string {
  const s = Math.abs(clean(v)).toLocaleString('en-US', {
    minimumFractionDigits: min,
    maximumFractionDigits: Math.min(20, Math.max(min, max)),
    useGrouping: false,
  })
  return (v < 0 ? MINUS : '') + s
}

/** Decimal places of a step: 0.005 → 3, 0.5 → 1, 1 → 0. */
function stepDecimals(step: number): number {
  const [mantissa, exp] = step.toExponential().split('e')
  return Math.max(0, (mantissa.split('.')[1] ?? '').length - Number(exp))
}

type Precision = Pick<ParamDef, 'type' | 'format'> & { step?: number }

/**
 * How many decimals a setting's numbers keep (null: any). Days, months and counts are whole; a
 * setting with a step keeps the step's decimals (values are rounded to the step); a share without
 * one keeps two decimals of a percent. Every value kept this way reads back exactly from its text.
 */
export function paramDecimals(def: Precision): number | null {
  if (def.type === 'days' || def.type === 'months') return 0
  if (def.step != null && Number.isFinite(def.step) && def.step > 0) return stepDecimals(def.step)
  const f = paramFormat(def)
  if (f === 'int' || f === 'compact') return 0
  if (PCT_FORMATS.has(f)) return 4
  return null
}

/** The setting takes whole numbers only: days, months, counts and anything stepped in whole units. */
export const isWholeParam = (def: Precision): boolean => paramDecimals(def) === 0

/**
 * One number in a setting's unit: "3.5%", "365 d", "0.90", "1.5×", "12 months". Shows every
 * decimal the setting keeps, so the text is the value in force, not a rounding of it.
 */
export function formatParamNumber(v: number, def: Precision): string {
  if (!Number.isFinite(v)) return '—'
  const keep = paramDecimals(def) ?? 4
  if (def.type === 'months') return `${trimmed(v, 0)} ${v === 1 ? 'month' : 'months'}`
  const f = paramFormat(def)
  switch (f) {
    case 'pct':
    case 'pct0':
    case 'pct2':
      return `${trimmed(v * 100, Math.max(2, keep - 2))}%`
    case 'pts':
    case 'pts2':
      return `${trimmed(v * 100, Math.max(2, keep - 2))} pts`
    case 'days':
      return `${trimmed(v, Math.max(1, keep))} d`
    case 'hours':
      return `${trimmed(v, Math.max(1, keep))} h`
    case 'years':
      return `${trimmed(v, Math.max(1, keep))} yrs`
    case 'ratio':
    case 'num2':
      return fixed(v, 2, keep)
    case 'num1':
      return fixed(v, 1, keep)
    case 'times':
      return `${trimmed(v, Math.max(2, keep))}×`
    case 'int':
    case 'compact':
      return trimmed(v, keep)
    default:
      return trimmed(v, Math.max(3, keep))
  }
}

const isRatingMap = (v: unknown): v is RatingMap =>
  !!v && typeof v === 'object' && !Array.isArray(v) && RATING_KEYS.every((k) => k in (v as object))

const isRange = (v: unknown): v is NumberRange => Array.isArray(v) && v.length === 2

/** A setting's value in words, with its unit. */
export function formatParam(def: ParamDef, value: ParamValue | null | undefined): string {
  if (value == null) return '—'
  switch (def.type) {
    case 'boolean':
      return value === true ? 'On' : value === false ? 'Off' : '—'
    case 'choice':
      return def.choices?.find((c) => c.value === value)?.label ?? String(value)
    case 'ratingMap':
      return isRatingMap(value)
        ? RATING_KEYS.map((k) => `${k}: ${formatParamNumber(value[k], def)}`).join(', ')
        : '—'
    case 'range':
      return isRange(value)
        ? `${formatParamNumber(value[0], def)} to ${formatParamNumber(value[1], def)}`
        : '—'
    case 'date':
      return value === '' ? NOT_SET : isCalendarDate(value) ? formatDate(value) : '—'
    default:
      return typeof value === 'number' ? formatParamNumber(value, def) : '—'
  }
}

/** How a date setting with no value reads. */
export const NOT_SET = 'Not set'

/** What the setting accepts, in words: "0% to 20%", "5 or more, raise only", "Locked". */
export function allowedText(def: ParamDef): string {
  if (def.locked === true) return 'Locked'
  const n = (v: number) => formatParamNumber(v, def)
  const bounds =
    def.min != null && def.max != null
      ? `${n(def.min)} to ${n(def.max)}`
      : def.min != null
        ? `${n(def.min)} or more`
        : def.max != null
          ? `${n(def.max)} or less`
          : 'Any number'
  switch (def.type) {
    case 'boolean':
      return 'On or off'
    case 'choice': {
      const labels = (def.choices ?? []).map((c) => c.label)
      return labels.length < 2 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`
    }
    case 'ratingMap':
      return `Each rating ${bounds.charAt(0).toLowerCase()}${bounds.slice(1)}`
    case 'range':
      return `Low end below high end, each ${bounds.charAt(0).toLowerCase()}${bounds.slice(1)}`
    case 'date':
      return 'A date, or blank for not set'
    default: {
      if (def.locked === 'raiseOnly') {
        const floor = typeof def.default === 'number' ? n(def.default) : bounds
        return def.max != null ? `${floor} to ${n(def.max)}, raise only` : `${floor} or more, raise only`
      }
      return bounds
    }
  }
}

/** Two values of a setting are the same (numbers within float noise). */
export function sameParam(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-12 || a === b
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => sameParam(v, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return (
      ka.length === kb.length &&
      ka.every((k) => sameParam((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    )
  }
  return a === b
}

/** A copy that shares nothing mutable with the input. */
export function cloneParam<T extends ParamValue>(v: T): T {
  if (Array.isArray(v)) return [v[0], v[1]] as unknown as T
  if (v && typeof v === 'object') return { ...(v as RatingMap) } as T
  return v
}

function boundsText(def: ParamDef): string {
  const n = (v: number) => formatParamNumber(v, def)
  if (def.min != null && def.max != null) return ` from ${n(def.min)} to ${n(def.max)}`
  if (def.min != null) return ` of ${n(def.min)} or more`
  if (def.max != null) return ` of ${n(def.max)} or less`
  return ''
}

/**
 * A number checked against its setting: whole where the setting is whole ("4.5" is no rating),
 * rounded to the step otherwise (so 0.955 on a 0.01 step is kept as 0.96, the value every screen
 * and export shows), then held to the minimum and maximum.
 */
function checkNumber(
  def: ParamDef,
  v: unknown,
  what = 'a value',
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof v !== 'number' || !Number.isFinite(v))
    return { ok: false, error: `${def.label}: enter ${what === 'a value' ? 'a number' : what}.` }
  const decimals = paramDecimals(def)
  if (decimals === 0 && Math.abs(v - Math.round(v)) > 1e-9)
    return {
      ok: false,
      error:
        def.type === 'days' || def.type === 'months'
          ? `${def.label}: enter a whole number of ${def.type}.`
          : `${def.label}: enter a whole number${what === 'a value' ? '' : ` for ${what.replace(/^a value for /, '')}`}.`,
    }
  let n = clean(v)
  if (decimals === 0) n = Math.round(n)
  else if (def.step != null && def.step > 0 && decimals != null)
    n = +(Math.round(clean(n / def.step)) * def.step).toFixed(decimals)
  else if (decimals != null) n = Math.round(clean(n * 10 ** decimals)) / 10 ** decimals
  if ((def.min != null && n < def.min - 1e-12) || (def.max != null && n > def.max + 1e-12))
    return { ok: false, error: `${def.label}: enter ${what}${boundsText(def)}.` }
  return { ok: true, value: clean(n) }
}

/**
 * Check a value against its setting: type, minimum and maximum, whole days and months, a low end
 * below the high end, and the locks (a raise-only setting can't go below its default; a locked
 * one can't change). Returns a normalized copy.
 */
export function validateParam(
  def: ParamDef,
  value: unknown,
  opts: { ignoreLock?: boolean } = {},
): ParamCheck {
  const lockedOut = def.locked === true && !opts.ignoreLock
  if (lockedOut && !sameParam(value, def.default))
    return { ok: false, error: `${def.label} is locked and can't be changed.` }
  switch (def.type) {
    case 'boolean':
      return typeof value === 'boolean'
        ? { ok: true, value }
        : { ok: false, error: `${def.label}: choose on or off.` }
    case 'choice': {
      const ok = typeof value === 'string' && !!def.choices?.some((c) => c.value === value)
      return ok
        ? { ok: true, value: value as string }
        : { ok: false, error: `${def.label}: choose ${allowedText(def).toLowerCase()}.` }
    }
    case 'ratingMap': {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return { ok: false, error: `${def.label}: give a value for every rating from 5 to 1.` }
      const r = value as Record<string, unknown>
      const out = {} as RatingMap
      for (const k of RATING_KEYS) {
        const v = r[k]
        if (v == null || v === '')
          return { ok: false, error: `${def.label}: give a value for every rating from 5 to 1.` }
        const n = checkNumber(def, v, `a value for rating ${k}`)
        if (!n.ok) return n
        out[k] = n.value
      }
      return { ok: true, value: out }
    }
    case 'date':
      return value === '' || isCalendarDate(value)
        ? { ok: true, value: value as string }
        : { ok: false, error: `${def.label}: enter a date such as 30 Oct 2026, or leave it blank.` }
    case 'range': {
      if (!Array.isArray(value) || value.length !== 2)
        return { ok: false, error: `${def.label}: give a low end and a high end.` }
      const ends: number[] = []
      for (const v of value) {
        const n = checkNumber(def, v)
        if (!n.ok) return n
        ends.push(n.value)
      }
      const [lo, hi] = ends
      if (!(lo < hi)) return { ok: false, error: `${def.label}: the low end must be below the high end.` }
      return { ok: true, value: [lo, hi] as const }
    }
    default: {
      // Below the floor of a raise-only setting, say so before quoting its bounds.
      if (
        def.locked === 'raiseOnly' &&
        !opts.ignoreLock &&
        typeof value === 'number' &&
        typeof def.default === 'number' &&
        value < def.default - 1e-12
      )
        return {
          ok: false,
          error: `${def.label} can be raised, never lowered: enter ${formatParamNumber(def.default, def)} or more.`,
        }
      return checkNumber(def, value)
    }
  }
}

/* ───────────── parsing text ───────────── */

/**
 * A number from a cell or a form: "95%", "0.95", "365 d", "12 months", "1.5×", "1,452". For a
 * share, "95%" and a plain 95 typed as text both read as 0.95 (a number cell is taken as is:
 * Excel stores 95% as 0.95).
 */
export function parseParamNumber(
  raw: unknown,
  def: Pick<ParamDef, 'type' | 'format' | 'max'>,
): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  let s = raw.trim().replace(/−/g, '-').replace(/[,\s]/g, '')
  if (!s) return null
  const share = isShareParam(def)
  let percent = false
  if (/%$/.test(s)) {
    percent = true
    s = s.slice(0, -1)
  } else if (/pts?$/i.test(s)) {
    percent = true
    s = s.replace(/pts?$/i, '')
  } else s = s.replace(/(days?|d|months?|mo|×|x|yrs?|h)$/i, '')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null
  let n = Number(s)
  if (!Number.isFinite(n)) return null
  if (share && (percent || (Math.abs(n) > 1 && (def.max ?? 1) <= 1))) n /= 100
  return clean(n)
}

/**
 * A date setting from a form, a cell or a file: 'YYYY-MM-DD', "30 Oct 2026", an Excel date; blank,
 * "Not set" and "—" mean not set (''). Anything else is returned as is, for the error.
 */
function parseParamDate(raw: unknown): unknown {
  if (raw == null) return ''
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t || t === '—' || t.toLowerCase() === NOT_SET.toLowerCase()) return ''
    if (isCalendarDate(t)) return t
  }
  const read = readDate(raw, 'DMY')
  return read.ok ? partsToDate(read.parts) : raw
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', 'on', '1'])
const FALSE_WORDS = new Set(['false', 'no', 'n', 'off', '0'])

/** A rating map from text: "5: 6%, 4: 4.5%, 3: 3%, 2: 1%, 1: 0%" (also "Rating 5 = 6%" per line). */
function parseRatingMap(raw: string, def: ParamDef): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  const parts = raw
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  for (const p of parts) {
    const m = /^(?:rating\s*)?([1-5])\s*[:=]\s*(.+)$/i.exec(p)
    if (!m) return null
    const n = parseParamNumber(m[2], def)
    if (n == null) return null
    out[m[1]] = n
  }
  return out
}

/** A range from text: "0.90 to 1.10", "0.9-1.1", "0.9 – 1.1", "90% to 110%". */
function parseRange(raw: string, def: ParamDef): unknown[] | null {
  const parts = raw
    .replace(/−/g, '-')
    .split(/\s*(?:\bto\b|–|—|,|;|\.\.)\s*|(?<=[\d%×x])\s*-\s*(?=[\d.])/i)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length !== 2) return null
  const nums = parts.map((p) => parseParamNumber(p, def))
  return nums.every((n) => n != null) ? nums : null
}

/**
 * A setting's value from untrusted input (a form field, an Excel cell, a settings file), parsed
 * and then validated with `validateParam`.
 */
export function parseParamInput(
  def: ParamDef,
  raw: unknown,
  opts: { ignoreLock?: boolean } = {},
): ParamCheck {
  let value: unknown = raw
  switch (def.type) {
    case 'boolean': {
      if (typeof raw === 'number') value = raw === 1 ? true : raw === 0 ? false : raw
      else if (typeof raw === 'string') {
        const w = raw.trim().toLowerCase()
        value = TRUE_WORDS.has(w) ? true : FALSE_WORDS.has(w) ? false : raw
      }
      break
    }
    case 'choice': {
      if (typeof raw === 'string') {
        const w = raw.trim().toLowerCase()
        value =
          def.choices?.find((c) => c.value.toLowerCase() === w || c.label.toLowerCase() === w)?.value ?? raw
      }
      break
    }
    case 'ratingMap': {
      if (typeof raw === 'string') value = parseRatingMap(raw, def) ?? raw
      else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const r: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(raw)) r[k] = parseParamNumber(v, def) ?? v
        value = r
      }
      break
    }
    case 'range': {
      if (typeof raw === 'string') value = parseRange(raw, def) ?? raw
      else if (Array.isArray(raw)) value = raw.map((v) => parseParamNumber(v, def) ?? v)
      break
    }
    case 'date':
      value = parseParamDate(raw)
      break
    default:
      value = parseParamNumber(raw, def) ?? raw
  }
  const check = validateParam(def, value, opts)
  if (
    !check.ok &&
    typeof raw === 'string' &&
    value === raw &&
    def.type !== 'choice' &&
    def.type !== 'boolean'
  )
    return {
      ok: false,
      error:
        def.type === 'ratingMap'
          ? `${def.label}: write it as "5: 6%, 4: 4.5%, 3: 3%, 2: 1%, 1: 0%".`
          : def.type === 'range'
            ? `${def.label}: write it as "0.90 to 1.10".`
            : def.type === 'date'
              ? `${def.label}: "${raw.trim()}" is not a date. Write it as 30 Oct 2026, or leave it blank.`
              : `${def.label}: "${raw.trim()}" is not a number.`,
    }
  return check
}
