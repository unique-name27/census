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
import type { DatasetCoverage, FieldCoverage } from './coverage'

export type CheckKind = 'empty' | 'empty-field' | 'thin-field' | 'unlinked' | 'stale' | 'import-warnings'

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

/** References to other datasets: field → the dataset and key it must resolve in. */
const LINKS: Partial<Record<DatasetKey, { fields: string[]; target: DatasetKey; targetKey: string }>> = {
  jobChanges: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  transactions: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  reviews: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  learning: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  comp: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  succession: { fields: ['incumbentId', 'successorId'], target: 'employees', targetKey: 'employeeId' },
  candidates: { fields: ['reqId'], target: 'requisitions', targetKey: 'reqId' },
}

const TARGET_NOUN: Partial<Record<DatasetKey, string>> = {
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
export function unlinkedRows(key: DatasetKey, data: Datasets): { rows: number; total: number } | null {
  const link = LINKS[key]
  if (!link) return null
  const rows = data[key] as unknown as readonly Row[]
  const targetRows = data[link.target] as unknown as readonly Row[]
  if (!rows.length || !targetRows.length) return { rows: 0, total: rows.length }
  const ids = new Set<unknown>()
  for (const t of targetRows) ids.add(t[link.targetKey])
  let n = 0
  for (const r of rows) {
    for (const f of link.fields) {
      const v = r[f]
      if (v != null && v !== '' && !ids.has(v)) {
        n++
        break
      }
    }
  }
  return { rows: n, total: rows.length }
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

function fieldChecks(coverage: DatasetCoverage): DatasetCheck[] {
  const out: DatasetCheck[] = []
  if (coverage.emptyCore.length) {
    const labels = coverage.emptyCore.map((f) => f.label)
    out.push({
      kind: 'empty-field',
      severity: 'warning',
      text: `${listLabels(labels)} ${labels.length === 1 ? 'is' : 'are'} blank in every row.`,
      count: labels.length,
    })
  }
  // Fields that only apply to some rows can be blank for a reason (no interview booked yet), so
  // only fields every row should have are called thin.
  const thin = coverage.fields.filter(
    (f): f is FieldCoverage & { share: number } =>
      f.requirement !== 'optional' &&
      f.scope == null &&
      f.share != null &&
      f.filled > 0 &&
      f.share < THIN_FIELD,
  )
  for (const f of thin)
    out.push({
      kind: 'thin-field',
      severity: 'info',
      text: `${f.label} is filled in ${fmt(f.share, 'pct0')} of rows.`,
      count: f.expected - f.filled,
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

  if (source.kind === 'upload' && (source.warnings ?? 0) > 0) {
    const n = source.warnings ?? 0
    out.push({
      kind: 'import-warnings',
      severity: 'info',
      text: `${fmt(n, 'int')} ${rowsWord(n)} imported with a change or warning.`,
      count: n,
    })
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
