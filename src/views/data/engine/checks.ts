/**
 * Health checks for one loaded dataset: is it there, are the fields the views need filled, do
 * its people and requisitions resolve, and does it reach the as-of date. Each check is one plain
 * sentence with the number in it.
 */
import type { Severity } from '@/components/types'
import { type DatasetKey, type Datasets, datasetDef, type ISODate } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { daysBetween, formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { DatasetCoverage, FieldCoverage, FieldFills } from './coverage'

export type CheckKind =
  | 'empty'
  | 'empty-field'
  | 'thin-field'
  | 'metric-field'
  | 'unlinked'
  | 'stale'
  | 'import-warnings'

export interface DatasetCheck {
  kind: CheckKind
  severity: Exclude<Severity, 'good'>
  text: string
  /** Rows or fields the check is about, for sorting and exports. */
  count: number
}

/** Below this share a required or recommended field is called out as thinly filled. */
export const THIN_FIELD = 0.8
/** Above this share of unresolved references the check is a warning rather than a note. */
const UNLINKED_WARNING = 0.02

const SEVERITY_ORDER: Record<DatasetCheck['severity'], number> = { critical: 0, warning: 1, info: 2 }

export interface Link {
  fields: string[]
  target: DatasetKey
  targetKey: string
}

/** References to other datasets: field → the dataset and key it must resolve in. */
export const LINKS: Partial<Record<DatasetKey, Link>> = {
  jobChanges: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  transactions: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  reviews: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  learning: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  comp: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  succession: { fields: ['incumbentId', 'successorId'], target: 'employees', targetKey: 'employeeId' },
  candidates: { fields: ['reqId'], target: 'requisitions', targetKey: 'reqId' },
  // Leader filters scope requisitions and cases through these people.
  requisitions: { fields: ['hiringManagerId'], target: 'employees', targetKey: 'employeeId' },
  cases: { fields: ['requesterId'], target: 'employees', targetKey: 'employeeId' },
}

export const TARGET_NOUN: Partial<Record<DatasetKey, string>> = {
  employees: 'people who are not in Employees',
  requisitions: 'requisitions that are not in Requisitions',
}

/** The event date that says how current a dataset is, and how old it may be before it looks stale. */
const FRESHNESS: Partial<Record<DatasetKey, { fields: string[]; what: string; maxDays: number }>> = {
  employees: { fields: ['hireDate', 'terminationDate'], what: 'hire or exit', maxDays: 120 },
  jobChanges: { fields: ['effectiveDate'], what: 'job change', maxDays: 180 },
  requisitions: { fields: ['openedDate'], what: 'requisition', maxDays: 90 },
  candidates: { fields: ['appliedDate'], what: 'application', maxDays: 60 },
  cases: { fields: ['openedAt'], what: 'case', maxDays: 45 },
  transactions: { fields: ['submittedDate'], what: 'transaction', maxDays: 60 },
  reviews: { fields: ['cycleDate'], what: 'review cycle', maxDays: 400 },
  succession: { fields: ['updatedDate'], what: 'succession update', maxDays: 400 },
  learning: { fields: ['assignedDate'], what: 'assignment', maxDays: 180 },
}

type Row = Record<string, unknown>

const listLabels = (labels: string[]): string =>
  labels.length <= 1
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`

const rowsWord = (n: number) => (n === 1 ? 'row' : 'rows')

/** "45 days" under two months, otherwise "4 months". */
export function ageText(days: number): string {
  if (days < 60) return `${fmt(days, 'int')} ${days === 1 ? 'day' : 'days'}`
  const months = Math.round(days / 30.44)
  return `${fmt(months, 'int')} months`
}

/** Rows with at least one reference that does not resolve in the target dataset. */
export function unlinkedRows(
  key: DatasetKey,
  data: Datasets,
): { rows: number; total: number; withRef: number } | null {
  return countUnlinked(key, data[key] as readonly object[], data)
}

/**
 * Of `candidates` (rows of dataset `key`, loaded or about to be), how many hold a reference that
 * does not resolve in the target dataset loaded in `data`. Null when the dataset links to nothing.
 */
export function countUnlinked(
  key: DatasetKey,
  candidates: readonly object[],
  data: Datasets,
): { rows: number; total: number; withRef: number } | null {
  const link = LINKS[key]
  if (!link) return null
  const rows = candidates as readonly Row[]
  const targetRows = data[link.target] as unknown as readonly Row[]
  const ids = new Set<unknown>()
  for (const t of targetRows) ids.add(t[link.targetKey])
  let n = 0
  let withRef = 0
  for (const r of rows) {
    let any = false
    let missing = false
    for (const f of link.fields) {
      const v = r[f]
      if (v == null || v === '') continue
      any = true
      if (!ids.has(v)) missing = true
    }
    if (any) withRef++
    // With nothing loaded to link to, there is nothing to call missing.
    if (missing && targetRows.length) n++
  }
  return { rows: n, total: rows.length, withRef }
}

/** Latest event date on or before the as-of date, or null when there is none. */
export function latestDate(key: DatasetKey, rows: readonly object[], asOf: ISODate): ISODate | null {
  const fresh = FRESHNESS[key]
  if (!fresh) return null
  let latest = ''
  for (const r of rows as readonly Row[]) {
    for (const f of fresh.fields) {
      const v = r[f]
      if (typeof v !== 'string' || v.length < 10) continue
      const d = v.slice(0, 10)
      if (d <= asOf && d > latest) latest = d
    }
  }
  return latest || null
}

const pctText = (share: number) => fmt(share, share > 0 && share < 0.01 ? 'pct' : 'pct0')

function fieldChecks(coverage: DatasetCoverage): DatasetCheck[] {
  const out: DatasetCheck[] = []
  const blank = coverage.emptyCore.filter((f) => f.defaulted === 0)
  const byDefault = coverage.emptyCore.filter((f) => f.defaulted > 0)
  if (blank.length) {
    const labels = blank.map((f) => f.label)
    out.push({
      kind: 'empty-field',
      severity: 'warning',
      text: `${listLabels(labels)} ${labels.length === 1 ? 'is' : 'are'} blank in every row.`,
      count: labels.length,
    })
  }
  if (byDefault.length) {
    const labels = byDefault.map((f) => f.label)
    out.push({
      kind: 'empty-field',
      severity: 'warning',
      text: `${listLabels(labels)} ${labels.length === 1 ? 'was' : 'were'} not in the file, so every row holds a default.`,
      count: labels.length,
    })
  }
  // Fields whose blanks are normal for some rows (no interview booked yet) are never called thin.
  const thin = coverage.fields.filter(
    (f): f is FieldCoverage & { share: number } =>
      f.requirement !== 'optional' && !f.blankOk && f.share != null && f.filled > 0 && f.share < THIN_FIELD,
  )
  for (const f of thin)
    out.push({
      kind: 'thin-field',
      severity: 'info',
      text:
        f.defaulted > 0
          ? `${f.label} is filled from the file for ${pctText(f.share)} of ${f.rowsNoun}; the rest hold a default or are blank.`
          : `${f.label} is filled ${f.scope ? 'for' : 'in'} ${pctText(f.share)} of ${f.rowsNoun}.`,
      count: f.expected - f.filled,
    })
  return out
}

/**
 * Employees fields that are optional for the importer but that attrition and headcount depend
 * on: say what goes blank or wrong in the views when they are missing.
 */
function rosterChecks(
  rows: readonly Row[],
  coverage: DatasetCoverage,
  fills: FieldFills | null | undefined,
): DatasetCheck[] {
  const out: DatasetCheck[] = []
  const field = (k: string) => coverage.fields.find((f) => f.key === k)
  const leavers = rows.filter((r) => r.terminationDate != null && r.terminationDate !== '').length
  if (!leavers)
    out.push({
      kind: 'metric-field',
      severity: 'warning',
      text: `Termination date is blank in all ${fmt(rows.length, 'int')} ${rowsWord(rows.length)}, so attrition reads as zero. Include the people who left to measure it.`,
      count: rows.length,
    })
  const metric = (key: string, who: string, lost: string, partly: string) => {
    const f = field(key)
    if (!f || f.share == null || f.share >= THIN_FIELD) return
    out.push(
      f.filled === 0
        ? {
            kind: 'metric-field',
            severity: 'warning',
            text: `${f.label} is blank for all ${fmt(f.expected, 'int')} ${who}, so ${lost} can’t be shown.`,
            count: f.expected,
          }
        : {
            kind: 'metric-field',
            severity: 'info',
            text: `${f.label} is filled for ${pctText(f.share)} of ${who}, so ${partly}.`,
            count: f.expected - f.filled,
          },
    )
  }
  metric(
    'terminationType',
    'leavers',
    'voluntary and regretted attrition',
    'voluntary and involuntary attrition are undercounted',
  )
  metric('regrettable', 'voluntary leavers', 'regretted attrition', 'regretted attrition is undercounted')
  if (fills?.notInFile.includes('employmentType') && rows.length)
    out.push({
      kind: 'metric-field',
      severity: 'warning',
      text: `Employment type was not in the file, so all ${fmt(rows.length, 'int')} people count as employees in headcount and rates.`,
      count: rows.length,
    })
  return out
}

export function datasetChecks(args: {
  key: DatasetKey
  data: Datasets
  source: SourceMeta
  coverage: DatasetCoverage
  asOf: ISODate
  /** Whether the dataset each link points at is still the sample. */
  targetIsSample?: (key: DatasetKey) => boolean
  /** From the last upload's log: what the importer filled itself. */
  fills?: FieldFills | null
  /** From the last upload's log: how many kinds of change its "Last upload" summary lists. */
  changeKinds?: number | null
}): DatasetCheck[] {
  const { key, data, source, coverage, asOf } = args
  const rows = data[key] as readonly object[]
  if (!rows.length)
    return [
      {
        kind: 'empty',
        severity: 'warning',
        text: 'No rows are loaded, so the views that read it show empty states.',
        count: 0,
      },
    ]
  const out: DatasetCheck[] = [...fieldChecks(coverage)]
  if (key === 'employees') out.push(...rosterChecks(rows as readonly Row[], coverage, args.fills))

  const link = LINKS[key]
  const unlinked = unlinkedRows(key, data)
  if (link && unlinked && unlinked.rows > 0) {
    const share = unlinked.rows / unlinked.total
    // When one side is the sample and the other an upload, the mismatch is expected; say which to upload.
    const targetSample = args.targetIsSample?.(link.target)
    const hint =
      source.kind === 'upload' && targetSample
        ? ` ${datasetDef(link.target).label} is still the sample; upload yours as well.`
        : source.kind !== 'upload' && targetSample === false
          ? ` ${datasetDef(key).label} is still the sample; upload yours as well.`
          : ''
    out.push({
      kind: 'unlinked',
      severity: share > UNLINKED_WARNING ? 'warning' : 'info',
      text: `${fmt(unlinked.rows, 'int')} ${rowsWord(unlinked.rows)} (${fmt(share, share < 0.01 ? 'pct' : 'pct0')}) ${unlinked.rows === 1 ? 'refers' : 'refer'} to ${TARGET_NOUN[link.target]}.${hint}`,
      count: unlinked.rows,
    })
  }

  const fresh = FRESHNESS[key]
  if (fresh) {
    const latest = latestDate(key, rows, asOf)
    if (!latest)
      out.push({
        kind: 'stale',
        severity: 'warning',
        text: `No ${fresh.what} is dated on or before the as-of date, ${formatDate(asOf)}.`,
        count: rows.length,
      })
    else {
      const age = daysBetween(latest, asOf)
      if (age > fresh.maxDays)
        out.push({
          kind: 'stale',
          severity: 'warning',
          text: `The latest ${fresh.what} is dated ${formatDate(latest)}, ${ageText(age)} before the as-of date.`,
          count: age,
        })
    }
  }

  if (source.kind === 'upload') {
    // Counted the way the "Last upload" summary lists them, so the two always agree.
    const kinds = args.changeKinds
    if (kinds != null && kinds > 0)
      out.push({
        kind: 'import-warnings',
        severity: 'info',
        text: `The last upload logged ${fmt(kinds, 'int')} ${kinds === 1 ? 'kind' : 'kinds'} of change; see Last upload.`,
        count: kinds,
      })
    else if (kinds == null && (source.warnings ?? 0) > 0) {
      const n = source.warnings ?? 0
      out.push({
        kind: 'import-warnings',
        severity: 'info',
        text: `${fmt(n, 'int')} ${rowsWord(n)} imported with a change or warning.`,
        count: n,
      })
    }
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/** The most serious check's severity, or 'good' when there is none. */
export function worstSeverity(checks: readonly DatasetCheck[]): Severity {
  if (checks.some((c) => c.severity === 'critical')) return 'critical'
  if (checks.some((c) => c.severity === 'warning')) return 'warning'
  if (checks.length) return 'info'
  return 'good'
}
