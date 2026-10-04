/**
 * The rows under a number and the gaps in them, from the fields it declares (`uses`).
 *
 * For each dataset the number reads, the rows considered are the rows at least one of its fields
 * applies to (termination type applies to leavers only), in the current scope and, when a period
 * is given, in the period. A row has a gap when a field the number reads is blank there or holds
 * a value Census does not recognize. Blanks that are normal for a field (no successor named yet,
 * no merit proposed) are not a gap, the same rule that keeps them from lowering the tier.
 *
 * A gap does not always leave a row out: a breakdown counts a row with an unknown category under
 * Other, and a reason shown beside a rate does not decide whether a leaver counts. So a row is
 * called left out only when the number says which fields it requires (`requires`, a subset of
 * `uses`) and one of those is the gap; without it the rows are reported as gaps, never as left
 * out. Gaps in rows outside the period are counted apart: the number never reads them.
 *
 * Pure. Row indexes point into the unscoped datasets (`ctx.all`), as the quality index does.
 */
import { datasetOfRef, type FieldRef, isFieldRef } from '@/data/quality/fieldRef'
import { midSentence } from '@/data/quality/text'
import type { FieldStats, QualityIndex } from '@/data/quality/types'
import type { DatasetKey, Datasets, ISODate } from '@/data/schema'
import { plural } from '@/lib/format'

export type LeftOutReason = 'blank' | 'invalid'

export type LeftOutQuality = Pick<QualityIndex, 'fieldRows' | 'fieldStats'>

/** One field's share of the gaps. */
export interface LeftOutField {
  ref: FieldRef
  label: string
  /** Rows considered with this field blank. */
  blank: number
  /** Rows considered with this field's value not recognized. */
  invalid: number
  /** The number requires the field: a gap here leaves the row out. */
  required?: boolean
}

/** One gap in one row: the field, how, and whether it leaves the row out. */
export interface RowReason {
  ref: FieldRef
  label: string
  reason: LeftOutReason
  required?: boolean
}

/** The rows of one dataset under a number. */
export interface LeftOutPart {
  dataset: DatasetKey
  /** Rows in scope (and in the period) that at least one of the number's fields applies to. */
  considered: number
  /** Considered rows with no gap in any field the number reads. */
  complete: number
  /** Considered rows with a gap in a field the number reads. */
  gaps: number
  /**
   * Considered rows with a gap in a field the number requires, so it left them out; null when the
   * number does not say which fields it requires.
   */
  leftOut: number | null
  /** Considered rows the number used: all but those left out; null when that is not known. */
  used: number | null
  /** Whether a period narrowed the rows (the dataset has dates that place a row in it). */
  inPeriod: boolean
  /** Fields with a gap, most first. */
  fields: LeftOutField[]
  /** Indexes of the considered rows with a gap, ascending. */
  rows: number[]
  /** Of `rows`, those left out (a gap in a required field). Empty when nothing is required. */
  leftOutRows: number[]
  /** Indexes of rows in scope with a gap that lie outside the period, ascending. */
  outside: number[]
  /** The gaps in each row, by row index (considered rows and rows outside the period). */
  reasons: ReadonlyMap<number, readonly RowReason[]>
}

export interface LeftOut {
  /** One part per dataset the number reads, in the order its fields name them. */
  parts: LeftOutPart[]
  considered: number
  gaps: number
  /** Null when the number does not say which fields it requires. */
  leftOut: number | null
}

/** Which rows of a dataset are kept; null (or no function) means every row. */
export type ScopeTest = (dataset: DatasetKey) => ((index: number) => boolean) | null

export interface LeftOutOptions {
  /** The rows the current filters keep. */
  inScope?: ScopeTest
  /** The rows inside the number's period; a dataset with no test is not narrowed. */
  inPeriod?: ScopeTest
  /**
   * The fields a row must have for the number to count it (a subset of `uses`). A gap in any
   * other field it reads (a breakdown, a side clause) never leaves a row out.
   */
  requires?: readonly string[]
}

/* ───────────── per-field row sets, cached per quality index ───────────── */

interface FieldRows {
  stats: FieldStats
  applicable: readonly number[]
  blank: readonly number[]
  invalid: readonly number[]
}

const cache = new WeakMap<object, Map<string, FieldRows>>()

/** A field's applicable, blank and unrecognized rows; worked out once per quality index. */
export function fieldRowsOf(quality: LeftOutQuality, ref: FieldRef): FieldRows {
  let byRef = cache.get(quality)
  if (!byRef) {
    byRef = new Map()
    cache.set(quality, byRef)
  }
  const hit = byRef.get(ref)
  if (hit) return hit
  const stats = quality.fieldStats(ref)
  const applicable = quality.fieldRows(ref, 'applicable')
  const applies = new Set(applicable)
  const out: FieldRows = {
    stats,
    applicable,
    // Blanks that are normal for the field are not a gap.
    blank: stats.blankOk ? [] : quality.fieldRows(ref, 'blank'),
    // Only rows the field applies to: a value where it doesn't apply is never read.
    invalid: quality.fieldRows(ref, 'invalid').filter((i) => applies.has(i)),
  }
  byRef.set(ref, out)
  return out
}

/** Valid references grouped by dataset, in the order the datasets first appear. */
export function refsByDataset(uses: readonly string[]): Map<DatasetKey, FieldRef[]> {
  const out = new Map<DatasetKey, FieldRef[]>()
  for (const ref of uses) {
    if (!isFieldRef(ref)) continue
    const key = datasetOfRef(ref)
    if (!key) continue
    const list = out.get(key)
    if (list) {
      if (!list.includes(ref)) list.push(ref)
    } else out.set(key, [ref])
  }
  return out
}

/** The rows a number reads, per dataset, and the gaps in them. */
export function rowsLeftOut(
  quality: LeftOutQuality,
  uses: readonly string[] | undefined,
  opts: LeftOutOptions | ScopeTest = {},
): LeftOut {
  const o: LeftOutOptions = typeof opts === 'function' ? { inScope: opts } : opts
  const required = o.requires ? new Set<string>(o.requires) : null
  const parts: LeftOutPart[] = []
  for (const [dataset, refs] of refsByDataset(uses ?? [])) {
    const keep = o.inScope?.(dataset) ?? null
    const period = o.inPeriod?.(dataset) ?? null
    const considered = new Set<number>()
    const outside = new Set<number>()
    const reasons = new Map<number, RowReason[]>()
    const fields: LeftOutField[] = []
    for (const ref of refs) {
      const f = fieldRowsOf(quality, ref)
      const isRequired = !!required?.has(ref)
      for (const i of f.applicable) if ((!keep || keep(i)) && (!period || period(i))) considered.add(i)
      const field: LeftOutField = { ref, label: f.stats.label, blank: 0, invalid: 0 }
      if (required) field.required = isRequired
      const add = (i: number, reason: LeftOutReason) => {
        if (keep && !keep(i)) return
        const r: RowReason = { ref, label: f.stats.label, reason }
        if (required) r.required = isRequired
        const list = reasons.get(i)
        if (list) list.push(r)
        else reasons.set(i, [r])
        if (period && !period(i)) {
          outside.add(i)
          return
        }
        field[reason]++
      }
      for (const i of f.blank) add(i, 'blank')
      for (const i of f.invalid) add(i, 'invalid')
      if (field.blank || field.invalid) fields.push(field)
    }
    const rows = [...reasons.keys()].filter((i) => !outside.has(i)).sort((a, b) => a - b)
    const leftOutRows = required ? rows.filter((i) => reasons.get(i)?.some((r) => r.required)) : []
    const leftOut = required ? leftOutRows.length : null
    fields.sort((a, b) => b.blank + b.invalid - (a.blank + a.invalid))
    parts.push({
      dataset,
      considered: considered.size,
      complete: considered.size - rows.length,
      gaps: rows.length,
      leftOut,
      used: leftOut == null ? null : considered.size - leftOut,
      inPeriod: !!period,
      fields,
      rows,
      leftOutRows,
      outside: [...outside].sort((a, b) => a - b),
      reasons,
    })
  }
  return {
    parts,
    considered: parts.reduce((a, p) => a + p.considered, 0),
    gaps: parts.reduce((a, p) => a + p.gaps, 0),
    leftOut: required ? parts.reduce((a, p) => a + (p.leftOut ?? 0), 0) : null,
  }
}

/* ───────────── the period ───────────── */

type Row = Record<string, unknown>

/** An inclusive date window, as `ctx.window` gives it. */
export interface PeriodWindow {
  start: ISODate
  end: ISODate
}

const day = (v: unknown): string | null => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null)

/** A row that runs from `from` to `to` (still open when `to` is null) overlaps the window. */
const overlaps = (from: string | null, to: string | null, w: PeriodWindow) =>
  (from == null || from <= w.end) && (to == null || to >= w.start)

/**
 * Whether a row falls in the period, per dataset with dates to judge by: a person employed during
 * it, a job change effective in it, a requisition, application, case, transaction or assignment
 * open during it. A row with no start date counts as in the period, so its gaps still show.
 * Reviews, succession plans and pay are snapshots: the period does not narrow them.
 */
export const PERIOD_RULES: Partial<Record<DatasetKey, (r: Row, w: PeriodWindow) => boolean>> = {
  employees: (r, w) => overlaps(day(r.hireDate), day(r.terminationDate), w),
  jobChanges: (r, w) => {
    const d = day(r.effectiveDate)
    return d == null || (d >= w.start && d <= w.end)
  },
  requisitions: (r, w) => overlaps(day(r.openedDate), day(r.closedDate) ?? day(r.filledDate), w),
  candidates: (r, w) => overlaps(day(r.appliedDate), day(r.hiredDate) ?? day(r.rejectedDate), w),
  cases: (r, w) => overlaps(day(r.openedAt), day(r.resolvedAt), w),
  transactions: (r, w) => overlaps(day(r.submittedDate), day(r.completedDate), w),
  learning: (r, w) => overlaps(day(r.assignedDate), day(r.completedDate), w),
}

const periodCache = new WeakMap<object, Map<string, Uint8Array>>()

/** The rows of each dataset in the period, as a test on unscoped row indexes. */
export function periodTestOf(data: Datasets, w: PeriodWindow): ScopeTest {
  return (key) => {
    const rule = PERIOD_RULES[key]
    if (!rule) return null
    const rows = data[key] as unknown as readonly Row[]
    let byWindow = periodCache.get(rows)
    if (!byWindow) {
      byWindow = new Map()
      periodCache.set(rows, byWindow)
    }
    const id = `${w.start}|${w.end}`
    let marks = byWindow.get(id)
    if (!marks) {
      marks = new Uint8Array(rows.length)
      rows.forEach((r, i) => {
        if (rule(r, w)) marks![i] = 1
      })
      byWindow.set(id, marks)
    }
    const inside = marks
    return (i) => inside[i] === 1
  }
}

/* ───────────── wording ───────────── */

const int = (n: number) => n.toLocaleString('en-US')

/**
 * "1,410 of 1,450 rows used" when the number says which fields it requires, otherwise "1,880 of
 * 1,900 rows complete"; "in the period" when the period narrowed them.
 */
export function usedText(
  part: Pick<LeftOutPart, 'considered' | 'complete' | 'used'> & { inPeriod?: boolean },
): string {
  const n = part.used ?? part.complete
  const where = part.inPeriod ? ' in the period' : ''
  return `${int(n)} of ${plural(part.considered, 'row')}${where} ${part.used == null ? 'complete' : 'used'}`
}

/** What one field's gaps are: "38 with no termination type", "2 with level not recognized". */
export function fieldLeftOutText(f: Pick<LeftOutField, 'label' | 'blank' | 'invalid'>): string[] {
  const label = midSentence(f.label)
  const out: string[] = []
  if (f.blank) out.push(`${int(f.blank)} with no ${label}`)
  if (f.invalid) out.push(`${int(f.invalid)} with ${label} not recognized`)
  return out
}

/** "38 with no termination type and 2 with level not recognized"; '' when there is no gap. */
export function excludedText(fields: readonly LeftOutField[], max = 3): string {
  const parts = fields.flatMap(fieldLeftOutText)
  if (!parts.length) return ''
  const shown = parts.slice(0, max)
  const more = parts.length - shown.length
  if (more > 0) shown.push(`${more} more ${more === 1 ? 'reason' : 'reasons'}`)
  if (shown.length < 2) return shown[0]
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

/** The gaps in each row, for the drill panel's column: "No termination type; level not recognized". */
export function rowReasonText(reasons: readonly RowReason[]): string {
  const text = reasons.map((r) =>
    r.reason === 'blank' ? `no ${midSentence(r.label)}` : `${midSentence(r.label)} not recognized`,
  )
  const joined = text.join('; ')
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

/** The rows of a part a drill lists, and the fields behind them. */
export type PartRows = 'leftOut' | 'kept' | 'gaps' | 'outside'

/** Indexes for one kind of rows in a part: left out, kept with a gap, every gap, or outside the period. */
export function partRows(part: LeftOutPart, which: PartRows): number[] {
  if (which === 'leftOut') return part.leftOutRows
  if (which === 'outside') return part.outside
  if (which === 'gaps') return part.rows
  const out = new Set(part.leftOutRows)
  return part.rows.filter((i) => !out.has(i))
}

/**
 * The gaps behind one kind of rows, field by field, most first: for rows left out only the
 * required fields that left them out.
 */
export function partFields(part: LeftOutPart, which: PartRows): LeftOutField[] {
  if (which === 'gaps') return part.fields
  const byRef = new Map<FieldRef, LeftOutField>()
  for (const i of partRows(part, which))
    for (const r of part.reasons.get(i) ?? []) {
      if (which === 'leftOut' && !r.required) continue
      let f = byRef.get(r.ref)
      if (!f) {
        f = { ref: r.ref, label: r.label, blank: 0, invalid: 0 }
        if (r.required != null) f.required = r.required
        byRef.set(r.ref, f)
      }
      f[r.reason]++
    }
  return [...byRef.values()].sort((a, b) => b.blank + b.invalid - (a.blank + a.invalid))
}
