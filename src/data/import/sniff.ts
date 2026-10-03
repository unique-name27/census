/**
 * Value-shape profiles of source columns. The auto-mapper uses them to confirm or doubt a header
 * match: a "Hiring manager" column full of names is not the hiring manager date.
 */
import type { DatasetKey, FieldDef } from '../schema'
import { looksLikeDate } from './dates'
import { readNumber } from './numbers'
import { isBlank, normText } from './text'
import { normalizeEnumValue, normalizeLevel } from './vocab'

/** Values sampled per column. */
export const SAMPLE_SIZE = 50
/** Rows scanned to collect the sample. */
const SCAN_ROWS = 400

export interface ColumnProfile {
  header: string
  /** Non-blank sampled values. */
  values: unknown[]
  n: number
  dateShare: number
  numShare: number
  idShare: number
  /** Text with spaces or commas (names, titles, sentences). */
  wordyShare: number
  /** Values containing at least one letter. */
  letterShare: number
  emailShare: number
  distinct: number
}

const ID_RE = /^[A-Za-z]{0,6}[-_ ./#]?\d[\w\-./#]*$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SERIAL_MIN = 20_000
const SERIAL_MAX = 80_000

function share(values: readonly unknown[], test: (v: unknown) => number): number {
  if (!values.length) return 0
  let s = 0
  for (const v of values) s += test(v)
  return s / values.length
}

export function profileColumn(header: string, rows: readonly Record<string, unknown>[]): ColumnProfile {
  const values: unknown[] = []
  const limit = Math.min(rows.length, SCAN_ROWS)
  for (let i = 0; i < limit && values.length < SAMPLE_SIZE; i++) {
    const v = rows[i]?.[header]
    if (!isBlank(v)) values.push(v)
  }
  const distinct = new Set(
    values.map((v) => (v instanceof Date ? v.getTime() : typeof v === 'string' ? v.toLowerCase() : v)),
  ).size
  return {
    header,
    values,
    n: values.length,
    // Whole numbers in the Excel serial range might be dates or might be amounts: half credit.
    dateShare: share(values, (v) =>
      v instanceof Date || looksLikeDate(v)
        ? 1
        : typeof v === 'number' && Number.isInteger(v) && v >= SERIAL_MIN && v <= SERIAL_MAX
          ? 0.5
          : 0,
    ),
    numShare: share(values, (v) => {
      if (v instanceof Date || typeof v === 'boolean') return 0
      const r = readNumber(v, true)
      return r.value != null && Number.isFinite(r.value) ? 1 : 0
    }),
    idShare: share(values, (v) =>
      (typeof v === 'number' && Number.isInteger(v) && v >= 0) ||
      (typeof v === 'string' && v.length <= 24 && ID_RE.test(v.trim()))
        ? 1
        : 0,
    ),
    wordyShare: share(values, (v) =>
      typeof v === 'string' && /\p{L}/u.test(v) && /[\s,]/.test(v.trim()) ? 1 : 0,
    ),
    letterShare: share(values, (v) => (typeof v === 'string' && /\p{L}/u.test(v) ? 1 : 0)),
    emailShare: share(values, (v) => (typeof v === 'string' && EMAIL_RE.test(v.trim()) ? 1 : 0)),
    distinct,
  }
}

/** Share of sampled values the field's vocabulary recognizes (enum, level and yes/no fields). */
export function vocabularyHit(dataset: DatasetKey, field: FieldDef, p: ColumnProfile): number {
  if (!p.n) return 0
  if (field.type === 'level') return share(p.values, (v) => (normalizeLevel(v) ? 1 : 0))
  if (field.type === 'enum')
    return share(p.values, (v) => (normalizeEnumValue(dataset, field.key, field.values ?? [], v) ? 1 : 0))
  if (field.type === 'boolean')
    return share(p.values, (v) => {
      if (typeof v === 'boolean') return 1
      if (typeof v === 'number') return v === 0 || v === 1 ? 1 : 0
      return /^(?:yes|no|y|n|true|false|t|f|x|0|1|regretted|non regretted|not regretted|mandatory|optional|required)$/.test(
        normText(v),
      )
        ? 1
        : 0
    })
  return 0
}
