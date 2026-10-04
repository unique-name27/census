/**
 * Shared preparation for every Talent engine: the scoped population at the as-of date, review
 * and job-history indexes, the latest cycles, which optional fields the data carries, and the
 * small helpers (names, decompose dimensions, windows) the other modules reuse.
 *
 * Pure: no React, no DOM.
 */
import type { AnalyticsContext } from '@/data/context'
import {
  type Employee,
  type ISODate,
  type JobChange,
  MIN_GROUP,
  type Potential,
  type Review,
} from '@/data/schema'
import type { Window } from '@/data/scope'
import { addDays, addMonths, formatDate } from '@/lib/dates'
import type { Dimension } from '@/lib/decompose'
import {
  buildReviewIndex,
  isActiveAt,
  isEmployee,
  latestCycle,
  type ReviewIndex,
  reviewAt,
} from '@/lib/people'

/** Label for org fields of people missing from the roster (e.g. an incumbent who was never uploaded). */
export const UNKNOWN = 'Not in roster'

export type PerfBand = 'Low' | 'Moderate' | 'High'
export const PERF_BANDS: readonly PerfBand[] = ['Low', 'Moderate', 'High']
export const PERF_BAND_LABEL: Record<PerfBand, string> = {
  Low: 'Low (1-2)',
  Moderate: 'Moderate (3)',
  High: 'High (4-5)',
}

/** Ratings are ordinal 1-5; imported half points round to the nearest whole rating. */
export function normRating(r: number | null | undefined): number | null {
  if (r == null || !Number.isFinite(r)) return null
  const v = Math.round(r)
  return v >= 1 && v <= 5 ? v : null
}

export const perfBand = (rating: number): PerfBand =>
  rating >= 4 ? 'High' : rating >= 3 ? 'Moderate' : 'Low'

export interface Cycle {
  cycle: string
  cycleDate: ISODate
}

/** Which optional fields the loaded data carries. A missing field turns its metric into null, never 0. */
export interface FieldCoverage {
  reviews: boolean
  potential: boolean
  preCalibration: boolean
  jobChanges: boolean
  succession: boolean
  successionRisk: boolean
  learning: boolean
  learningHours: boolean
  comp: boolean
  terminationType: boolean
  regrettable: boolean
}

export interface TalentBase {
  ctx: AnalyticsContext
  asOf: ISODate
  /** Scoped employees, current and former, any worker type. */
  scoped: Employee[]
  /** Scoped employees (worker type Employee) active at the as-of date. */
  active: Employee[]
  activeIds: Set<string>
  scopeIds: Set<string>
  byId: Map<string, Employee>
  /** Company-wide review index (cycles come from every review). */
  reviews: ReviewIndex
  /** Company-wide job history per employee, oldest first. */
  jobs: Map<string, JobChange[]>
  latest: Cycle | null
  /** Latest cycle on or before asOf that records potential (the annual cycle). */
  latestAnnual: Cycle | null
  has: FieldCoverage
}

export function buildBase(ctx: AnalyticsContext): TalentBase {
  const { asOf } = ctx
  const scoped = ctx.data.employees
  const active = scoped.filter((e) => isEmployee(e) && isActiveAt(e, asOf))
  const reviews = buildReviewIndex(ctx.all.reviews)
  const jobs = new Map<string, JobChange[]>()
  for (const j of ctx.all.jobChanges) {
    const arr = jobs.get(j.employeeId)
    if (arr) arr.push(j)
    else jobs.set(j.employeeId, [j])
  }
  for (const arr of jobs.values()) arr.sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
  const exits = ctx.all.employees.filter((e) => e.terminationDate)
  const potentialCycles = new Map<string, ISODate>()
  for (const r of ctx.all.reviews) {
    if (r.potential && r.cycleDate <= asOf) {
      const prev = potentialCycles.get(r.cycle)
      if (!prev || prev < r.cycleDate) potentialCycles.set(r.cycle, r.cycleDate)
    }
  }
  let latestAnnual: Cycle | null = null
  for (const [cycle, cycleDate] of potentialCycles) {
    if (!latestAnnual || cycleDate > latestAnnual.cycleDate) latestAnnual = { cycle, cycleDate }
  }
  return {
    ctx,
    asOf,
    scoped,
    active,
    activeIds: new Set(active.map((e) => e.employeeId)),
    scopeIds: new Set(scoped.map((e) => e.employeeId)),
    byId: ctx.org.byId,
    reviews,
    jobs,
    latest: latestCycle(reviews, asOf),
    latestAnnual,
    has: {
      reviews: ctx.all.reviews.length > 0,
      potential: potentialCycles.size > 0,
      preCalibration: ctx.all.reviews.some((r) => r.preCalibrationRating != null),
      jobChanges: ctx.all.jobChanges.length > 0,
      succession: ctx.all.succession.length > 0,
      successionRisk: ctx.all.succession.some((s) => s.incumbentRiskOfLoss != null),
      learning: ctx.all.learning.length > 0,
      learningHours: ctx.all.learning.some((l) => l.hours != null),
      comp: ctx.all.comp.length > 0,
      terminationType: exits.some((e) => e.terminationType),
      regrettable: exits.some((e) => e.regrettable != null),
    },
  }
}

/* ───────── people helpers ───────── */

export const nameOf = (base: Pick<TalentBase, 'byId'>, id: string | null | undefined): string =>
  (id && base.byId.get(id)?.name) || id || '—'

/** The review for a cycle, or null. */
export function reviewIn(
  base: Pick<TalentBase, 'reviews'>,
  employeeId: string,
  cycle: string,
): Review | null {
  const arr = base.reviews.byEmployee.get(employeeId)
  if (!arr) return null
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].cycle === cycle) return arr[i]
  return null
}

/** Latest review on or before d, and the one before it. */
export function reviewPair(
  base: Pick<TalentBase, 'reviews'>,
  employeeId: string,
  d: ISODate,
): { latest: Review | null; previous: Review | null } {
  const arr = base.reviews.byEmployee.get(employeeId)
  if (!arr) return { latest: null, previous: null }
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].cycleDate <= d) return { latest: arr[i], previous: i > 0 ? arr[i - 1] : null }
  }
  return { latest: null, previous: null }
}

/** Latest normalized rating on or before d. */
export function ratingAt(base: Pick<TalentBase, 'reviews'>, employeeId: string, d: ISODate): number | null {
  return normRating(reviewAt(base.reviews, employeeId, d)?.rating)
}

/** Most recent potential on record on or before d. */
export function potentialAt(
  base: Pick<TalentBase, 'reviews'>,
  employeeId: string,
  d: ISODate,
): Potential | null {
  const arr = base.reviews.byEmployee.get(employeeId)
  if (!arr) return null
  for (let i = arr.length - 1; i >= 0; i--)
    if (arr[i].cycleDate <= d && arr[i].potential) return arr[i].potential!
  return null
}

/** Date of the last promotion on or before d, or null. */
export function lastPromotion(
  base: Pick<TalentBase, 'jobs'>,
  employeeId: string,
  d: ISODate,
): ISODate | null {
  const arr = base.jobs.get(employeeId)
  if (!arr) return null
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].changeType === 'Promotion' && arr[i].effectiveDate <= d) return arr[i].effectiveDate
  }
  return null
}

/* ───────── windows ───────── */

/** The 12 months ending on d, as an inclusive window (1 Oct to 30 Sep for a 30 Sep date). */
export function trailing12(d: ISODate): Window {
  const start = addDays(addMonths(d, -12), 1)
  return { start, end: d, months: 12, label: `${formatDate(start)} – ${formatDate(d)}` }
}

/** The n months ending on d (start is the day after d minus n months). */
export function trailingMonths(d: ISODate, n: number): Window {
  const start = addDays(addMonths(d, -n), 1)
  return { start, end: d, months: n, label: `${formatDate(start)} – ${formatDate(d)}` }
}

/* ───────── decompose dimensions ───────── */

export function orgDims<T>(get: (row: T) => Employee | undefined): Dimension<T>[] {
  return [
    { key: 'businessUnit', label: 'Business unit', get: (r) => get(r)?.businessUnit },
    { key: 'department', label: 'Department', get: (r) => get(r)?.department },
    { key: 'location', label: 'Location', get: (r) => get(r)?.location },
    { key: 'level', label: 'Level', get: (r) => get(r)?.level },
  ]
}

/** Filter patch for a decompose segment, so a finding can rescope the app to it. */
export function segmentFilter(dim: string, value: string): Record<string, string[]> | undefined {
  if (dim === 'businessUnit' || dim === 'department' || dim === 'location' || dim === 'level') {
    return { [dim]: [value] }
  }
  return undefined
}

/** "Design Verification" for department segments, "L4" for levels, the value itself otherwise. */
export function segmentName(dim: string, value: string): string {
  return dim === 'level' ? `level ${value}` : value
}

/** Count of people per value, largest first. */
export function topCounts<T>(
  rows: readonly T[],
  key: (r: T) => string | null | undefined,
): [string, number][] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = key(r)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/* ───────── small groups ───────── */

/** Label of the row that holds groups folded together for anonymity. */
export const otherLabel = (groups: number): string => `Other (${groups})`

/**
 * Fold groups of fewer than MIN_GROUP people into one "Other (k)" row at the end, so no count over
 * fewer than 5 people is shown or exported. When that row is itself under 5, the next-smallest
 * groups join it until it reaches 5, so its counts can't be worked out by subtraction either.
 * `combine` builds the folded row (and should null its counts when the total is still under 5).
 */
export function foldSmallGroups<R>(
  rows: readonly R[],
  size: (r: R) => number,
  combine: (folded: R[], label: string) => R,
): R[] {
  const kept = rows.filter((r) => size(r) >= MIN_GROUP)
  const folded = rows.filter((r) => size(r) < MIN_GROUP)
  if (!folded.length) return [...rows]
  let total = folded.reduce((s, r) => s + size(r), 0)
  const bySize = [...kept].sort((a, b) => size(a) - size(b))
  while (total < MIN_GROUP && bySize.length) {
    const r = bySize.shift()!
    folded.push(r)
    total += size(r)
  }
  const stay = new Set(bySize)
  return [...kept.filter((r) => stay.has(r)), combine(folded, otherLabel(folded.length))]
}

/**
 * The records behind each row of a folded breakdown, keyed by the row's label: a kept group keeps
 * its own records, the "Other (k)" row gets every group not shown on its own, and a row whose
 * numbers are hidden (`shown` false) gets none, so a hidden number never opens its records.
 */
export function recordsByLabel<R, T>(
  rows: readonly R[],
  byGroup: ReadonlyMap<string, readonly T[]>,
  opts: { label: (r: R) => string; folded: (r: R) => boolean; shown: (r: R) => boolean },
): Map<string, T[]> {
  const kept = new Set(rows.filter((r) => !opts.folded(r)).map(opts.label))
  const out = new Map<string, T[]>()
  for (const r of rows) {
    if (!opts.shown(r)) continue
    const list = opts.folded(r)
      ? [...byGroup].flatMap(([g, v]) => (kept.has(g) ? [] : v))
      : [...(byGroup.get(opts.label(r)) ?? [])]
    out.set(opts.label(r), list)
  }
  return out
}

/** Push onto the list at key, creating it. */
export function pushTo<K, T>(m: Map<K, T[]>, key: K, item: T): void {
  const arr = m.get(key)
  if (arr) arr.push(item)
  else m.set(key, [item])
}

/** "A, B and C" */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
