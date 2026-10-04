/**
 * Shared preparation for the HR business partner engine: the scoped population, company
 * benchmark population, reporting windows, an index of job history (level and department at a
 * date) and which optional columns exist. Built once per analytics context.
 */
import type { Definition } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { type FieldRef, meetsStandard } from '@/data/quality'
import { type Employee, type ISODate, type JobChange, LEVELS, type Level } from '@/data/schema'
import { type PeriodPreset, periodWindows, type Window } from '@/data/scope'
import { addDays, addMonths, formatMonthShort, formatRange, monthEnd, quarterStart } from '@/lib/dates'
import { isActiveAt } from '@/lib/people'
import {
  all as allOf,
  HRBP_DATASETS,
  type Lineage,
  regrettedExitsLineage,
  regrettedLineage,
  resolveLineage,
  scopeLineage,
} from './lineage'
import { type Counts, countsFor, leftWithin, regrettedBy } from './population'
import { annualRate } from './rates'
import { defaultSettings, type HrbpSettings, settingsOf } from './settings'
import { definitionsOf, definitionText } from './wording'

/** A reporting block (quarter or month) with the length used to annualize rates inside it. */
export interface Block extends Window {
  key: string
}

/** A finding headline as a sentence: ends with a period, like every other practice's readout. */
export const sentence = (t: string): string => (/[.?!]$/.test(t) ? t : `${t}.`)

/** Trailing window of n whole months ending at asOf (calendar-aligned when asOf is a month end). */
export function trailing(asOf: ISODate, months: 3 | 6 | 12): Window {
  const preset = months === 12 ? 't12m' : months === 6 ? 't6m' : 't3m'
  return periodWindows(preset, asOf).current
}

/** "Q3 '26": the same words the chart kit puts on quarter ticks, so tables and axes agree. */
export function quarterName(d: ISODate): string {
  return `Q${Math.ceil(+d.slice(5, 7) / 3)} '${d.slice(2, 4)}`
}

/** Whether a block is a calendar quarter (starts on a quarter start, ends on its last day). */
export const isCalendarQuarter = (w: Window): boolean =>
  quarterStart(w.start) === w.start && monthEnd(w.end) === w.end && +w.end.slice(5, 7) % 3 === 0

/** The last n three-month blocks ending at asOf, oldest first. Calendar quarters when asOf is a quarter end. */
export function quarterBlocks(asOf: ISODate, n: number): Block[] {
  const out: Block[] = []
  let end = asOf
  for (let i = 0; i < n; i++) {
    const w = trailing(end, 3)
    const label = isCalendarQuarter(w)
      ? quarterName(w.end)
      : `${formatMonthShort(w.start)}–${formatMonthShort(w.end, true)}`
    out.unshift({ ...w, key: w.end, label })
    end = addDays(w.start, -1)
  }
  return out
}

/** Month-end points for the last n months, oldest first; the final point is asOf. */
export function monthEnds(asOf: ISODate, n: number): ISODate[] {
  const pts: ISODate[] = []
  for (let i = n - 1; i >= 1; i--) pts.push(monthEnd(addMonths(`${asOf.slice(0, 7)}-01`, -i)))
  pts.push(asOf)
  return pts
}

/** The delta label for a comparison with `ctx.prior`. */
export function priorLabel(period: PeriodPreset, months: number): string {
  if (period === 'ytd') return 'vs same period last year'
  if (period === 'lastQuarter') return 'vs prior quarter'
  if (period === 'custom') return 'vs prior period'
  return `vs prior ${Math.round(months)} months`
}

/** The same window one year earlier (month ends stay month ends). */
export function yearEarlier(w: Window): Window {
  const back = (d: ISODate) => (monthEnd(d) === d ? monthEnd(addMonths(d, -12)) : addMonths(d, -12))
  const start = addMonths(w.start, -12)
  const end = back(w.end)
  return { start, end, months: w.months, label: formatRange(start, end) }
}

/**
 * Delta coloring floor carried over from the earlier HRBP dashboard: |Δ| ≥ 2% of the reference +
 * 0.15 pts by default (the "Material change" settings).
 */
export function isMaterialGap(
  delta: number | null | undefined,
  reference: number | null | undefined,
  floor: HrbpSettings['material'] = defaultSettings().material,
): boolean {
  if (delta == null || !Number.isFinite(delta)) return false
  const ref = reference != null && Number.isFinite(reference) ? Math.abs(reference) : 0
  return Math.abs(delta) >= floor.relative * ref + floor.absolute
}

/* ───────── job history ───────── */

interface LevelStep {
  date: ISODate
  from: Level | null
}
interface DeptStep {
  date: ISODate
  from: string | null
}

export interface History {
  /** Level held on date d, reconstructed from level changes after d (falls back to today's level). */
  levelAt: (e: Employee, d: ISODate) => Level | null
  /** Department on date d, reconstructed from transfers after d. */
  deptAt: (e: Employee, d: ISODate) => string
  /** Date the person moved into a manager or executive level from an individual level, if they did. */
  becameManager: (employeeId: string) => ISODate | null
  /** Latest promotion on or before d. */
  lastPromotion: (employeeId: string, d: ISODate) => ISODate | null
}

const isLevel = (v: unknown): v is Level => typeof v === 'string' && (LEVELS as readonly string[]).includes(v)

export function buildHistory(changes: readonly JobChange[]): History {
  const levels = new Map<string, LevelStep[]>()
  const depts = new Map<string, DeptStep[]>()
  const promos = new Map<string, ISODate[]>()
  const toManager = new Map<string, ISODate>()
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
    const arr = m.get(k)
    if (arr) arr.push(v)
    else m.set(k, [v])
  }
  for (const c of changes) {
    if (!c.effectiveDate) continue
    if (c.fromLevel !== undefined && c.toLevel && c.fromLevel !== c.toLevel) {
      push(levels, c.employeeId, { date: c.effectiveDate, from: isLevel(c.fromLevel) ? c.fromLevel : null })
    }
    if (c.toDepartment && c.fromDepartment && c.fromDepartment !== c.toDepartment) {
      push(depts, c.employeeId, { date: c.effectiveDate, from: c.fromDepartment })
    }
    if (c.changeType === 'Promotion') {
      push(promos, c.employeeId, c.effectiveDate)
      if (c.fromLevel?.startsWith('L') && c.toLevel && !c.toLevel.startsWith('L')) {
        const prev = toManager.get(c.employeeId)
        if (!prev || prev < c.effectiveDate) toManager.set(c.employeeId, c.effectiveDate)
      }
    }
  }
  const byDate = (a: { date: string }, b: { date: string }) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  for (const arr of levels.values()) arr.sort(byDate)
  for (const arr of depts.values()) arr.sort(byDate)
  for (const arr of promos.values()) arr.sort()

  return {
    levelAt(e, d) {
      const steps = levels.get(e.employeeId)
      if (steps) for (const s of steps) if (s.date > d) return s.from
      return e.level
    },
    deptAt(e, d) {
      const steps = depts.get(e.employeeId)
      if (steps) for (const s of steps) if (s.date > d) return s.from ?? e.department
      return e.department
    },
    becameManager: (id) => toManager.get(id) ?? null,
    lastPromotion(id, d) {
      const arr = promos.get(id)
      if (!arr) return null
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] <= d) return arr[i]
      return null
    },
  }
}

/* ───────── prep ───────── */

export interface Prep {
  ctx: AnalyticsContext
  /** The calculation settings in force, read from the metric dictionary when used. */
  set: HrbpSettings
  /** Who counts in headcount and every rate: employees, plus contractors when that setting is on. */
  counts: Counts
  /** A regretted exit under the setting in force. */
  isRegretted: (e: Employee) => boolean
  /** Left within the first-year window of their hire date. */
  leftFirstYear: (e: Employee) => boolean
  /** Lineage that depends on what counts as regretted. */
  lin: { regretted: Lineage; regrettedExits: Lineage }
  /**
   * The regretted rate can be computed: the roster has leavers and the Regrettable column, and
   * Termination type too when only voluntary exits count.
   */
  regrettedReady: boolean
  /** A group's turnover: annualized unless that setting is off, null under the anonymity minimum. */
  rate: (events: number, avgHeadcount: number, w: Pick<Window, 'months'>) => number | null
  /** Whether a tile's change clears the materiality floor (and is colored). */
  material: (delta: number | null | undefined, reference: number | null | undefined) => boolean
  /** A metric's definition from the dictionary, with any changed setting behind it. */
  text: (metricId: string) => string
  /** Figure "Definitions" rows for metrics, from the dictionary. */
  defs: (...metricIds: string[]) => Definition[]
  asOf: ISODate
  window: Window
  prior: Window
  /** Trailing 12 months to asOf, for rules defined over a year regardless of the period picker. */
  t12: Window
  /** Scoped workers of every type (contractors and interns count in spans of control). */
  people: readonly Employee[]
  /** Scoped employees (headcount and every rate), with contractors when that setting is on. */
  emps: Employee[]
  /** Company employees, for benchmarks (the same population). */
  companyEmps: Employee[]
  /** Scoped job changes for employees (contractor rows are ignored). */
  changes: JobChange[]
  companyChanges: JobChange[]
  history: History
  name: (id: string | null | undefined) => string
  /**
   * The fields a number reads (its lineage, see `./lineage`), plus the fields the active org
   * filters read. Optional groups count only when their data is loaded.
   */
  uses: (...parts: Lineage[]) => readonly FieldRef[]
  /**
   * Whether to show a supporting detail (exit reasons cited in a finding, the promotion column of
   * the scorecard): always under Everything, else when its fields meet the data standard. A
   * detail below it is left out, so it never takes the headline number down with it.
   */
  meets: (part: Lineage) => boolean
  has: {
    /** Some row has a termination date: without leavers every exit rate is unknown, not 0. */
    terminationDate: boolean
    jobChanges: boolean
    reviews: boolean
    terminationType: boolean
    terminationReason: boolean
    regrettable: boolean
    level: boolean
  }
}

const employeeChanges = (changes: readonly JobChange[], byId: Map<string, Employee>, counts: Counts) =>
  changes.filter((c) => {
    const e = byId.get(c.employeeId)
    return !!e && counts(e)
  })

export function prepare(ctx: AnalyticsContext): Prep {
  const { asOf, org } = ctx
  const set = settingsOf(ctx.metrics)
  const counts = countsFor(set.countContractors)
  const rule = set.regretted
  const all = ctx.all.employees
  const people = ctx.data.employees
  const emps = people.filter(counts)
  const companyEmps = ctx.isCompany ? emps : all.filter(counts)
  const changes = employeeChanges(ctx.data.jobChanges, org.byId, counts)
  const companyChanges = ctx.isCompany ? changes : employeeChanges(ctx.all.jobChanges, org.byId, counts)
  const scope = scopeLineage(ctx.filters)
  const presence = new Map<FieldRef, boolean>()
  const meets = new Map<Lineage, boolean>()
  const present = (ref: FieldRef) => {
    let has = presence.get(ref)
    if (has === undefined) {
      has = ctx.quality.fieldTier(ref) !== 'none'
      presence.set(ref, has)
    }
    return has
  }
  const has = {
    terminationDate: all.some((e) => !!e.terminationDate),
    jobChanges: ctx.all.jobChanges.length > 0,
    reviews: ctx.all.reviews.length > 0,
    terminationType: all.some((e) => !!e.terminationType),
    terminationReason: all.some((e) => !!e.terminationReason),
    regrettable: all.some((e) => e.regrettable === true || e.regrettable === false),
    level: all.some((e) => !!e.level),
  }
  return {
    ctx,
    set,
    counts,
    isRegretted: regrettedBy(rule),
    leftFirstYear: leftWithin(set.firstYearDays),
    lin: { regretted: regrettedLineage(rule), regrettedExits: regrettedExitsLineage(rule) },
    regrettedReady: has.terminationDate && has.regrettable && (rule === 'anyFlagged' || has.terminationType),
    rate: (events, avg, w) => annualRate(events, avg, w, set),
    material: (delta, reference) => isMaterialGap(delta, reference, set.material),
    text: (id) => definitionText(ctx.metrics, id),
    defs: (...ids) => definitionsOf(ctx.metrics, ...ids),
    asOf,
    window: ctx.window,
    prior: ctx.prior,
    t12: trailing(asOf, 12),
    people,
    emps,
    companyEmps,
    changes,
    companyChanges,
    history: buildHistory(changes),
    name: (id) => (id ? (org.byId.get(id)?.name ?? id) : '—'),
    uses: (...parts) => resolveLineage(allOf(...parts, scope), present),
    meets: (part) => {
      let ok = meets.get(part)
      if (ok === undefined) {
        const tier = ctx.quality.tierOf(resolveLineage(part, present), HRBP_DATASETS)
        ok = ctx.standard === 'bronze' || meetsStandard(tier, ctx.standard)
        meets.set(part, ok)
      }
      return ok
    },
    has,
  }
}

/** Active workers of any type at d. */
export const activeWorkers = (people: readonly Employee[], d: ISODate): Employee[] =>
  people.filter((p) => isActiveAt(p, d))

/** Shown in place of every exit rate when the Employees upload has no leavers. */
export const NO_LEAVERS = 'Add leavers (Termination date) to Employees to see this'
/** Past headcount from an active-only roster counts only today's survivors, so it is not shown. */
export const NO_HISTORY = 'Add leavers (Termination date) to Employees to compare with past headcount'

/** "Heather Hayes's" */
export const possessive = (name: string): string => `${name}'s`

/** "A, B and C" */
export function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** "1 promotion", "149 promotions". */
export const count = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** A reason from the exit taxonomy inside a sentence: quoted, so "My manager" never reads as prose. */
export const quoted = (reason: string): string => `“${reason}”`

/** Names at most `max` items, then "and N more". */
export function nameList(items: readonly string[], max = 5): string {
  if (items.length <= max) return listJoin(items)
  return `${items.slice(0, max).join(', ')} and ${items.length - max} more`
}
