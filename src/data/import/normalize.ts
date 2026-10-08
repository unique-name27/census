/**
 * Coercers: one per field type, each returning `{ value, issue? }`. A value that cannot be read
 * comes back as null with a plain-English issue; nothing is silently replaced by a guess.
 */
import { median } from '@/lib/stats'
import type { DatasetKey, FieldDef, Level } from '../schema'
import { canonicalText } from './canonical'
import { detectDateOrder, partsToDate, partsToDateTime, readDate } from './dates'
import { readNumber } from './numbers'
import { type PendingRelative, readMonth, readRelativeDay } from './relative'
import { displayValue, isBlank, normText } from './text'
import type { DateOrder, IssueCode } from './types'
import { normalizeEnumValue, normalizeLevel } from './vocab'

export interface Coerced<T> {
  value: T | null
  issue?: string
  code?: IssueCode
}

const ok = <T>(value: T | null): Coerced<T> => ({ value })
const NONE: Coerced<never> = { value: null }
const fail = <T>(issue: string, code: IssueCode = 'unreadable'): Coerced<T> => ({ value: null, issue, code })
const quote = (v: unknown) => `"${displayValue(v)}"`

/* ───────────── dates ───────────── */

export function coerceDate(v: unknown, order: DateOrder = 'MDY'): Coerced<string> {
  if (isBlank(v)) return NONE
  const r = readDate(v, order)
  if (r.ok) return ok(partsToDate(r.parts))
  return r.reason === 'out-of-range'
    ? fail(`${quote(v)} is not a plausible date.`, 'out-of-range')
    : fail(`${quote(v)} is not a date.`)
}

export function coerceDateTime(v: unknown, order: DateOrder = 'MDY'): Coerced<string> {
  if (isBlank(v)) return NONE
  const r = readDate(v, order)
  if (r.ok) return ok(partsToDateTime(r.parts))
  return r.reason === 'out-of-range'
    ? fail(`${quote(v)} is not a plausible date.`, 'out-of-range')
    : fail(`${quote(v)} is not a date and time.`)
}

export { detectDateOrder }

/** A month (hiring plan periods): a full date or a month such as "Nov 2026", as its first day. */
export function coerceMonth(v: unknown, order: DateOrder = 'MDY'): Coerced<string> {
  if (isBlank(v)) return NONE
  const m = readMonth(v, order)
  return m ? ok(m) : fail(`${quote(v)} is not a month or a date.`)
}

/** Fields that hold a month: the value is stored as the month's first day. */
const MONTH_FIELDS = new Set(['hiringPlan.period'])
/**
 * Date fields that also accept a day relative to the start ("Day -3"). The importer converts it
 * once it knows the person's start date (defaults.ts), so it never reaches a stored row.
 */
const RELATIVE_FIELDS = new Set(['onboardingTasks.dueDate'])

/* ───────────── numbers ───────────── */

export function coerceNumber(v: unknown, opts: { money?: boolean } = {}): Coerced<number> {
  if (isBlank(v)) return NONE
  if (typeof v === 'boolean' || v instanceof Date) return fail(`${quote(v)} is not a number.`)
  const r = readNumber(v, opts.money)
  if (r.value == null) return NONE
  if (!Number.isFinite(r.value)) return fail(`${quote(v)} is not ${opts.money ? 'an amount' : 'a number'}.`)
  return ok(r.value)
}

export const coerceMoney = (v: unknown): Coerced<number> => coerceNumber(v, { money: true })

/**
 * Percent as a fraction. Text with a % sign is always divided by 100; plain numbers only when
 * the column holds whole numbers (`whole`, see `detectPercentWhole`).
 */
export function coercePercent(v: unknown, whole: boolean): Coerced<number> {
  if (isBlank(v)) return NONE
  if (typeof v === 'boolean' || v instanceof Date) return fail(`${quote(v)} is not a percentage.`)
  const r = readNumber(v)
  if (r.value == null) return NONE
  if (!Number.isFinite(r.value)) return fail(`${quote(v)} is not a percentage.`)
  return ok(r.percent || whole ? r.value / 100 : r.value)
}

/** A percent column holds whole numbers (3.5 meaning 3.5%) when its plain values have a median above 1.5. */
export function detectPercentWhole(values: readonly unknown[]): boolean {
  const xs: number[] = []
  for (const v of values) {
    if (isBlank(v)) continue
    const r = readNumber(v)
    if (r.value != null && Number.isFinite(r.value) && !r.percent) xs.push(Math.abs(r.value))
  }
  return (median(xs) ?? 0) > 1.5
}

/**
 * A share of a whole (FTE, an offer's position in its range): a fraction, or a percentage when the
 * cell has a % sign or reads above 1.5 (80 is 0.8, 35% is 0.35). Read value by value, so a column
 * that mixes 0.8 and 80 still works. Outside `min` to 1.5 after that is logged and left blank.
 */
export function coerceShare(
  v: unknown,
  label: string,
  min: { value: number; inclusive: boolean },
): Coerced<number> {
  if (isBlank(v)) return NONE
  if (typeof v === 'boolean' || v instanceof Date) return fail(`${quote(v)} is not ${label}.`)
  const r = readNumber(v)
  if (r.value == null) return NONE
  if (!Number.isFinite(r.value)) return fail(`${quote(v)} is not ${label}.`)
  const x = r.percent || r.value > 1.5 ? r.value / 100 : r.value
  const low = min.inclusive ? x < min.value : x <= min.value
  if (low || x > 1.5) return fail(`${quote(v)} is outside the range for ${label}.`, 'out-of-range')
  return ok(x)
}

/** Fields read as a share by `coerceShare`, with the smallest value each takes. */
const SHARE_FIELDS: Readonly<Record<string, { label: string; min: { value: number; inclusive: boolean } }>> =
  {
    'employees.fte': { label: 'an FTE', min: { value: 0, inclusive: false } },
    'candidates.offerPositionInRange': { label: 'a position in range', min: { value: 0, inclusive: true } },
  }

/* ───────────── booleans ───────────── */

const FALSY =
  /^(?:no|n|false|f|0|off|unchecked|optional|elective|not required|non regretted|non regrettable|not regretted|not regrettable|unregretted|non regret|not escalated|not reopened)$/
const TRUTHY =
  /^(?:yes|y|true|t|1|x|on|checked|regretted|regrettable|regret|mandatory|required|escalated|reopened)$/

/** Yes/No. Numbers count as yes when above zero (so a "reopen count" column works). */
export function coerceBoolean(v: unknown): Coerced<boolean> {
  if (isBlank(v)) return NONE
  if (typeof v === 'boolean') return ok(v)
  if (typeof v === 'number') return ok(v > 0)
  const s = String(v).trim()
  if (s === '✓' || s === '✔' || s === '☑') return ok(true)
  const t = normText(s)
  if (FALSY.test(t) || /^(?:non|not|un)\b/.test(t)) return ok(false)
  if (TRUTHY.test(t)) return ok(true)
  const n = Number(t)
  if (Number.isFinite(n) && t !== '') return ok(n > 0)
  return fail(`${quote(v)} is not yes or no.`, 'unknown-value')
}

/* ───────────── levels, ratings, ids, text ───────────── */

export function coerceLevel(v: unknown): Coerced<Level> {
  if (isBlank(v)) return NONE
  const level = normalizeLevel(v)
  return level
    ? ok(level)
    : fail(`${quote(v)} is not a recognized level (L1-L6, M1-M2, E1-E3).`, 'unknown-value')
}

const RATING_WORDS: [RegExp, number][] = [
  [/\b(far exceeds|outstanding|exceptional|significantly exceeds|role model)\b/, 5],
  [/\b(does not meet|did not meet|doesn t meet|unsatisfactory|not meeting)\b/, 1],
  [/\b(partially meets|partly meets|below|needs improvement|inconsistent|some of)\b/, 2],
  [/\b(exceeds|above|strong)\b/, 4],
  [/\b(fully meets|meets|solid|successful|achieves|on track)\b/, 3],
]

function ratingFromText(raw: string): number | null {
  const lead = /^(\d+(?:[.,]\d+)?)(?![\d.,])/.exec(raw.trim())
  if (lead) return +lead[1].replace(',', '.')
  const t = normText(raw)
  for (const [re, score] of RATING_WORDS) if (re.test(t)) return score
  return null
}

/** Performance rating on the 1-5 scale, from a number or a label such as "Exceeds" or "4 - Exceeds". */
export function coerceRating(v: unknown): Coerced<number> {
  if (isBlank(v)) return NONE
  const n = typeof v === 'number' ? v : ratingFromText(String(v))
  if (n == null || !Number.isFinite(n)) return fail(`${quote(v)} is not a rating.`, 'unknown-value')
  if (n < 1 || n > 5) return fail(`${quote(v)} is outside the 1-5 rating scale.`, 'out-of-range')
  return ok(n)
}

/** Identifier as text; whole numbers lose any ".0" a spreadsheet added. */
export function coerceId(v: unknown): Coerced<string> {
  if (isBlank(v)) return NONE
  if (typeof v === 'number') return ok(String(v))
  if (v instanceof Date) return fail(`${quote(v)} is a date, not an ID.`)
  const s = String(v).trim().replace(/\s+/g, ' ')
  return ok(/^\d+\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s)
}

export function coerceString(v: unknown): Coerced<string> {
  if (isBlank(v)) return NONE
  if (v instanceof Date) return ok(displayValue(v))
  if (typeof v === 'boolean') return ok(v ? 'Yes' : 'No')
  return ok(String(v).trim().replace(/\s+/g, ' '))
}

/* ───────────── dispatch ───────────── */

/** Per-column settings resolved before rows are coerced. */
export interface ColumnSettings {
  dateOrder: DateOrder
  percentWhole: boolean
  /** Manual corrections: normalized raw → canonical (null = leave blank). */
  valueMap?: Record<string, string | null>
}

/** Fields stored as numbers that also accept rating labels. */
const RATING_FIELDS = new Set(['reviews.rating', 'reviews.preCalibrationRating'])

/** Agreement words on a five-point scale; "strongly" variants first. */
const LIKERT: [RegExp, number][] = [
  [/\bstrongly disagree\b/, 1],
  [/\bstrongly agree\b/, 5],
  [/\b(?:somewhat |slightly )?disagree\b/, 2],
  [/\b(?:neither agree nor disagree|neutral|undecided|neither)\b/, 3],
  [/\b(?:somewhat |slightly )?agree\b/, 4],
]

/**
 * A survey score: a number, a leading number ("4 - Agree"), or agreement words read on the 1-5
 * scale (Strongly disagree 1 to Strongly agree 5).
 */
export function coerceSurveyScore(v: unknown): Coerced<number> {
  if (isBlank(v)) return NONE
  if (typeof v === 'number') return Number.isFinite(v) ? ok(v) : fail(`${quote(v)} is not a score.`)
  const s = String(v).trim()
  const lead = /^([-+]?\d+(?:[.,]\d+)?)(?![\d.,])/.exec(s)
  if (lead) return ok(Number(lead[1].replace(',', '.')))
  const t = normText(s)
  for (const [re, score] of LIKERT) if (re.test(t)) return ok(score)
  return fail(`${quote(v)} is not a score.`, 'unknown-value')
}

/** Coerce one cell for a field. */
export function coerceValue(
  dataset: DatasetKey,
  field: FieldDef,
  v: unknown,
  col: ColumnSettings,
): Coerced<unknown> {
  if (col.valueMap && !isBlank(v)) {
    const t = normText(v)
    if (Object.hasOwn(col.valueMap, t)) {
      // A manual correction is a value in the app's own words ("Yes", "L4", "Offer"): read it
      // through the field type like any cell, so it is stored as a boolean, number or canonical
      // spelling rather than as raw text.
      const fixed = col.valueMap[t]
      if (fixed == null || isBlank(fixed)) return NONE
      const c = coerceValue(dataset, field, fixed, { ...col, valueMap: undefined })
      return c.value == null && c.issue
        ? { ...c, issue: `Your correction ${c.issue[0].toLowerCase()}${c.issue.slice(1)}` }
        : c
    }
  }
  const ref = `${dataset}.${field.key}`
  if (MONTH_FIELDS.has(ref)) return coerceMonth(v, col.dateOrder)
  const share = SHARE_FIELDS[ref]
  if (share) return coerceShare(v, share.label, share.min)
  if (RELATIVE_FIELDS.has(ref)) {
    const r = readRelativeDay(v)
    if (r) return ok<PendingRelative>({ __relative: r })
  }
  switch (field.type) {
    case 'date':
      return coerceDate(v, col.dateOrder)
    case 'datetime':
      return coerceDateTime(v, col.dateOrder)
    case 'number':
      if (ref === 'surveyResponses.score') return coerceSurveyScore(v)
      return RATING_FIELDS.has(ref) ? coerceRating(v) : coerceNumber(v)
    case 'money':
      return coerceMoney(v)
    case 'percent':
      return coercePercent(v, col.percentWhole)
    case 'boolean':
      return coerceBoolean(v)
    case 'level':
      return coerceLevel(v)
    case 'id':
      return coerceId(v)
    case 'enum': {
      if (isBlank(v)) return NONE
      const value = normalizeEnumValue(dataset, field.key, field.values ?? [], v)
      if (value != null) return ok(value)
      const allowed = (field.values ?? []).join(', ')
      return fail(
        `${quote(v)} is not a recognized ${field.label.toLowerCase()}${allowed ? ` (${allowed})` : ''}.`,
        'unknown-value',
      )
    }
    case 'string': {
      const s = coerceString(v)
      if (s.value == null) return s
      return ok(canonicalText(dataset, field.key, s.value) ?? s.value)
    }
  }
}
