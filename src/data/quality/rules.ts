/**
 * The facts the tier rules are built from, computed on loaded rows: references that do not
 * resolve, dates out of order, duplicate rows, how current the data is, and control totals.
 * Pure; each returns row indexes so every number can drill to its rows.
 */
import { addMonths, daysBetween } from '@/lib/dates'
import { type DatasetKey, type Datasets, datasetDef, type ISODate } from '../schema'
import type { ControlMetricId, ControlTotal } from './types'

type Row = Record<string, unknown>

/* ───────────── references ───────────── */

export interface Link {
  fields: string[]
  target: DatasetKey
  targetKey: string
}

/** References to other datasets: fields → the dataset and key they must resolve in. */
export const LINKS: Partial<Record<DatasetKey, Link>> = {
  jobChanges: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  transactions: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  reviews: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  learning: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  comp: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  succession: { fields: ['incumbentId', 'successorId'], target: 'employees', targetKey: 'employeeId' },
  candidates: { fields: ['reqId'], target: 'requisitions', targetKey: 'reqId' },
  requisitions: { fields: ['hiringManagerId'], target: 'employees', targetKey: 'employeeId' },
  cases: { fields: ['requesterId'], target: 'employees', targetKey: 'employeeId' },
  employees: { fields: ['managerId'], target: 'employees', targetKey: 'employeeId' },
  rightToWork: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  // Accepted candidates not yet in the roster are keyed by application ID instead (left blank here).
  onboardingTasks: { fields: ['employeeId'], target: 'employees', targetKey: 'employeeId' },
  hiringPlan: { fields: ['reqId'], target: 'requisitions', targetKey: 'reqId' },
}

/** Most rows may hold an unresolved reference before the check fails (2%). */
export const MAX_UNRESOLVED_SHARE = 0.02

/** Silver needs a field filled for at least this share of the rows it applies to. */
export const MIN_COVERAGE = 0.95
/** Silver allows at most this share of values not recognized or defaulted. */
export const MAX_PROBLEM_SHARE = 0.02
/** Silver allows at most this share of rows with an import error. */
export const MAX_ISSUE_RATE = 0.02

export interface RefCheck {
  link: Link
  /** Rows holding at least one reference. */
  withRef: number
  /** Indexes of rows with a reference that does not resolve. */
  rows: number[]
  /** The target dataset has no rows, so nothing can resolve. */
  targetEmpty: boolean
}

export function checkReferences(key: DatasetKey, data: Datasets): RefCheck | null {
  const link = LINKS[key]
  if (!link) return null
  const targetRows = data[link.target] as unknown as readonly Row[]
  const ids = new Set<unknown>()
  for (const t of targetRows) ids.add(t[link.targetKey])
  const rows: number[] = []
  let withRef = 0
  ;(data[key] as unknown as readonly Row[]).forEach((r, i) => {
    let any = false
    let bad = false
    for (const f of link.fields) {
      const v = r[f]
      if (v == null || v === '') continue
      any = true
      if (!ids.has(v)) bad = true
    }
    if (any) withRef++
    if (bad) rows.push(i)
  })
  return { link, withRef, rows, targetEmpty: targetRows.length === 0 }
}

/* ───────────── dates in order ───────────── */

/** Date fields that must not go backwards, in the order they happen (blank ones are skipped). */
export const DATE_SEQUENCES: Partial<Record<DatasetKey, string[][]>> = {
  employees: [['hireDate', 'terminationDate']],
  requisitions: [
    ['openedDate', 'filledDate'],
    ['openedDate', 'closedDate'],
  ],
  candidates: [
    ['appliedDate', 'screenDate', 'hmDate', 'onsiteDate', 'offerDate', 'hiredDate'],
    ['appliedDate', 'rejectedDate'],
  ],
  cases: [
    ['openedAt', 'firstResponseAt'],
    ['openedAt', 'resolvedAt'],
  ],
  transactions: [['submittedDate', 'completedDate']],
  learning: [['assignedDate', 'completedDate']],
  rightToWork: [['i9Section1Date', 'i9Section2Date']],
}

/** Indexes of rows where a later step is dated before an earlier one. */
export function datesOutOfOrder(key: DatasetKey, rows: readonly object[]): number[] {
  const seqs = DATE_SEQUENCES[key]
  if (!seqs) return []
  const out: number[] = []
  ;(rows as readonly Row[]).forEach((r, i) => {
    for (const seq of seqs) {
      let prev = ''
      for (const f of seq) {
        const v = r[f]
        if (typeof v !== 'string' || v.length < 10) continue
        if (prev && v < prev) {
          out.push(i)
          return
        }
        prev = v
      }
    }
  })
  return out
}

/* ───────────── duplicates ───────────── */

/** Indexes of rows whose row key repeats an earlier row's. */
export function duplicateRows(key: DatasetKey, rows: readonly object[]): number[] {
  const rowKey = datasetDef(key).rowKey
  const seen = new Set<string>()
  const out: number[] = []
  ;(rows as readonly Row[]).forEach((r, i) => {
    const k = rowKey.map((f) => String(r[f] ?? '')).join('\u0001')
    if (seen.has(k)) out.push(i)
    else seen.add(k)
  })
  return out
}

/* ───────────── freshness ───────────── */

/** The event dates that say how current a dataset is, and how old the latest may be. */
export const FRESHNESS: Partial<Record<DatasetKey, { fields: string[]; what: string; maxDays: number }>> = {
  employees: { fields: ['hireDate', 'terminationDate'], what: 'hire or exit', maxDays: 120 },
  jobChanges: { fields: ['effectiveDate'], what: 'job change', maxDays: 180 },
  requisitions: { fields: ['openedDate'], what: 'requisition', maxDays: 90 },
  candidates: { fields: ['appliedDate'], what: 'application', maxDays: 60 },
  cases: { fields: ['openedAt'], what: 'case', maxDays: 45 },
  transactions: { fields: ['submittedDate'], what: 'transaction', maxDays: 60 },
  reviews: { fields: ['cycleDate'], what: 'review cycle', maxDays: 400 },
  succession: { fields: ['updatedDate'], what: 'succession update', maxDays: 400 },
  learning: { fields: ['assignedDate'], what: 'assignment', maxDays: 180 },
  onboardingTasks: { fields: ['dueDate', 'completedDate'], what: 'onboarding task', maxDays: 45 },
  surveyResponses: { fields: ['responseDate'], what: 'survey answer', maxDays: 120 },
}

/**
 * Datasets whose rows carry no event dates, such as a pay snapshot: judged by the date the extract
 * describes (its load date; for the generated sample, the date the sample describes).
 */
export const SNAPSHOT_FRESHNESS: Partial<Record<DatasetKey, { what: string; maxDays: number }>> = {
  comp: { what: 'pay extract', maxDays: 45 },
  rightToWork: { what: 'right to work extract', maxDays: 90 },
}

export interface Freshness {
  /** Latest event date on or before the as-of date; null when there is none. */
  latest: ISODate | null
  /** Days from the latest event to the as-of date. */
  ageDays: number | null
  maxDays: number | null
  what: string | null
  fresh: boolean
}

export function freshness(
  key: DatasetKey,
  rows: readonly object[],
  asOf: ISODate,
  /** The date a snapshot dataset describes (see `SNAPSHOT_FRESHNESS`); null when unknown. */
  snapshot: ISODate | null = null,
  /** The limit in days, from the quality rules; the dataset's default when not given. */
  limitDays?: number,
): Freshness {
  const rule = FRESHNESS[key]
  if (!rule) {
    const snap = SNAPSHOT_FRESHNESS[key]
    if (!snap) return { latest: null, ageDays: null, maxDays: null, what: null, fresh: true }
    const maxDays = validDays(limitDays) ?? snap.maxDays
    if (!snapshot || snapshot.length < 10)
      return { latest: null, ageDays: null, maxDays, what: snap.what, fresh: false }
    const latest = snapshot.slice(0, 10)
    // A snapshot taken after the as-of date is current for it.
    const ageDays = Math.max(0, daysBetween(latest, asOf))
    return { latest, ageDays, maxDays, what: snap.what, fresh: ageDays <= maxDays }
  }
  const maxDays = validDays(limitDays) ?? rule.maxDays
  let latest = ''
  for (const r of rows as readonly Row[])
    for (const f of rule.fields) {
      const v = r[f]
      if (typeof v !== 'string' || v.length < 10) continue
      const d = v.slice(0, 10)
      if (d <= asOf && d > latest) latest = d
    }
  if (!latest) return { latest: null, ageDays: null, maxDays, what: rule.what, fresh: false }
  const ageDays = daysBetween(latest, asOf)
  return { latest, ageDays, maxDays, what: rule.what, fresh: ageDays <= maxDays }
}

const validDays = (d: number | undefined): number | null =>
  typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : null

/* ───────────── control totals ───────────── */

/** Default allowed difference for a control total: 0.5%. */
export const DEFAULT_TOLERANCE = 0.005

export interface ControlMetric {
  id: ControlMetricId
  label: string
  /** Datasets it can reconcile. */
  datasets: DatasetKey[]
  /** A pay amount: shown only when pay amounts are on. */
  pay?: boolean
  compute: (data: Datasets, key: DatasetKey, asOf: ISODate) => number | null
}

const activeAt = (r: Row, d: ISODate) =>
  typeof r.hireDate === 'string' &&
  r.hireDate <= d &&
  (r.terminationDate == null || r.terminationDate === '' || (r.terminationDate as string) > d)

export const CONTROL_METRICS: Record<ControlMetricId, ControlMetric> = {
  rows: {
    id: 'rows',
    label: 'Rows',
    datasets: [
      'employees',
      'jobChanges',
      'requisitions',
      'candidates',
      'cases',
      'transactions',
      'reviews',
      'succession',
      'learning',
      'comp',
    ],
    compute: (data, key) => data[key].length,
  },
  activeHeadcount: {
    id: 'activeHeadcount',
    label: 'Headcount (active employees)',
    datasets: ['employees'],
    compute: (data, _k, asOf) =>
      (data.employees as unknown as Row[]).filter((e) => e.employmentType === 'Employee' && activeAt(e, asOf))
        .length,
  },
  activeWorkers: {
    id: 'activeWorkers',
    label: 'Active workers, including contractors and interns',
    datasets: ['employees'],
    compute: (data, _k, asOf) => (data.employees as unknown as Row[]).filter((e) => activeAt(e, asOf)).length,
  },
  exits12m: {
    id: 'exits12m',
    label: 'Employee exits in the last 12 months',
    datasets: ['employees'],
    compute: (data, _k, asOf) => {
      const start = addMonths(asOf, -12)
      return data.employees.filter(
        (e) =>
          e.employmentType === 'Employee' &&
          !!e.terminationDate &&
          e.terminationDate > start &&
          e.terminationDate <= asOf,
      ).length
    },
  },
  totalBaseUsd: {
    id: 'totalBaseUsd',
    label: 'Total base salary in USD',
    datasets: ['comp'],
    pay: true,
    compute: (data) => {
      let sum = 0
      for (const c of data.comp)
        if (c.fxToUsd != null && Number.isFinite(c.baseSalary)) sum += c.baseSalary * c.fxToUsd
      return Math.round(sum)
    },
  },
  openReqs: {
    id: 'openReqs',
    label: 'Open requisitions',
    datasets: ['requisitions'],
    compute: (data) => data.requisitions.filter((r) => r.status === 'Open').length,
  },
  openCases: {
    id: 'openCases',
    label: 'Open cases',
    datasets: ['cases'],
    compute: (data) => data.cases.filter((c) => c.status !== 'Resolved' && c.status !== 'Closed').length,
  },
  ratedPeople: {
    id: 'ratedPeople',
    label: 'People rated in the latest cycle',
    datasets: ['reviews'],
    compute: (data) => {
      let latest = ''
      for (const r of data.reviews) if (r.cycleDate > latest) latest = r.cycleDate
      return latest
        ? new Set(data.reviews.filter((r) => r.cycleDate === latest).map((r) => r.employeeId)).size
        : 0
    },
  },
}

/** The control totals a dataset can be reconciled to. */
export const controlMetricsFor = (key: DatasetKey): ControlMetric[] =>
  Object.values(CONTROL_METRICS).filter((m) => m.datasets.includes(key))

export function computeControlTotal(
  metric: ControlMetricId,
  data: Datasets,
  key: DatasetKey,
  asOf: ISODate,
): number | null {
  const m = CONTROL_METRICS[metric] as ControlMetric | undefined
  if (!m?.datasets.includes(key)) return null
  return m.compute(data, key, asOf)
}

/**
 * True when `actual` is within the control total's tolerance of what was expected. A total that
 * states no valid tolerance of its own uses `fallback` (the quality rules' tolerance).
 */
export function reconciles(
  total: Pick<ControlTotal, 'expected' | 'tolerance'>,
  actual: number | null,
  fallback: number = DEFAULT_TOLERANCE,
): boolean {
  if (actual == null || !Number.isFinite(actual)) return false
  const tol = Number.isFinite(total.tolerance) && total.tolerance >= 0 ? total.tolerance : fallback
  if (total.expected === 0) return actual === 0
  return Math.abs(actual - total.expected) <= tol * Math.abs(total.expected) + 1e-9
}

/* ───────────── the rules, as settings ───────────── */

/**
 * The thresholds the tier rules use. The defaults are the constants above; the metric dictionary
 * (Data quality rules, `src/metrics/quality.ts`) can change them, and the analytics context passes
 * the values in force to `computeQuality`.
 */
export interface QualityRules {
  /** Silver needs a field filled for at least this share of the rows it applies to (0.95). */
  minCoverage: number
  /**
   * Silver allows at most this share of values not recognized or defaulted, of rows with an
   * import error, and of rows whose references don't resolve (0.02).
   */
  maxProblemShare: number
  /** Allowed difference for a control total that doesn't state its own, and the default for new ones (0.005). */
  tolerance: number
  /** Most days from the latest event (or the pay extract) to the as-of date, per dataset. */
  freshDays: Partial<Record<DatasetKey, number>>
}

/** Every dataset's freshness limit in days, from `FRESHNESS` and `SNAPSHOT_FRESHNESS`. */
export const DEFAULT_FRESH_DAYS: Partial<Record<DatasetKey, number>> = Object.fromEntries([
  ...Object.entries(FRESHNESS).map(([k, r]) => [k, r!.maxDays]),
  ...Object.entries(SNAPSHOT_FRESHNESS).map(([k, r]) => [k, r!.maxDays]),
])

export const DEFAULT_QUALITY_RULES: QualityRules = {
  minCoverage: MIN_COVERAGE,
  maxProblemShare: MAX_PROBLEM_SHARE,
  tolerance: DEFAULT_TOLERANCE,
  freshDays: DEFAULT_FRESH_DAYS,
}
