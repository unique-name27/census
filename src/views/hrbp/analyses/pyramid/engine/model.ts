/**
 * Workforce pyramid by level (docs/ANALYSES.md, 5.2): headcount at each level today and a year
 * ago, the company's shape scaled to the scope, splits by business unit, tenure band and worker
 * type, the size of each level against the one below, spans at each management level, how each
 * level changed in 12 months and the level mix by business unit. Pure: a function of the analytics
 * context, built on People stats' `prepare` (its population, settings and job history).
 *
 * Counting rules:
 * - Headcount is People stats' (employees, plus contractors when that setting is on); the worker
 *   type split counts every worker type. People with no level are counted apart.
 * - "A year ago" is the day before the trailing 12 months open (30 Sep 2025 for 30 Sep 2026), at
 *   the level held then (`history.levelAt`), whatever the period picker. It needs Job changes and
 *   leavers on the roster; without either there is no year ago (null, never today's levels).
 * - The flow reconciles by construction: per person, whatever hires, promotions and exits in the
 *   window do not explain is an other change at that level, and those people are its records.
 * - Rates over fewer people than the anonymity minimum are null: growth on a small base, a share
 *   of a small scope or level, a ratio over a small level below, a span over few managers.
 *   Counts are always shown.
 */
import type { AnalyticsContext } from '@/data/context'
import {
  type Employee,
  type ISODate,
  type JobChange,
  LEVEL_LABELS,
  LEVELS,
  type Level,
  type LevelTrack,
  levelTrack,
} from '@/data/schema'
import { addDays } from '@/lib/dates'
import { isActiveAt, TENURE_BANDS, tenureBand, tenureYears } from '@/lib/people'
import { quantile } from '@/lib/stats'
import { buildHistory, type History, type Prep, prepare } from '../../../engine/base'
import { activeChildren, subtreeSizer } from '../../../engine/org'
import { WORKER_LABEL, WORKER_ORDER } from '../../../engine/workforce'

/* ───────── vocabulary ───────── */

export type SplitKey = 'none' | 'businessUnit' | 'tenure' | 'workerType'

export const SPLITS: readonly { key: SplitKey; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'businessUnit', label: 'Business unit' },
  { key: 'tenure', label: 'Tenure' },
  { key: 'workerType', label: 'Worker type' },
]

export const splitLabel = (k: SplitKey): string => SPLITS.find((s) => s.key === k)?.label ?? k

export type BandKey = 'entry' | 'career' | 'senior' | 'management' | 'executive'

export interface Band {
  key: BandKey
  label: string
  levels: readonly Level[]
}

/** Level mix bands (5.2), lowest first. */
export const BANDS: readonly Band[] = [
  { key: 'entry', label: 'Entry', levels: ['L1', 'L2'] },
  { key: 'career', label: 'Career', levels: ['L3', 'L4'] },
  { key: 'senior', label: 'Senior', levels: ['L5', 'L6'] },
  { key: 'management', label: 'Management', levels: ['M1', 'M2'] },
  { key: 'executive', label: 'Executive', levels: ['E1', 'E2', 'E3'] },
]

export const bandOf = (l: Level): Band => BANDS.find((b) => b.levels.includes(l)) as Band

export const INDIVIDUAL_LEVELS: readonly Level[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']
export const EXECUTIVE_LEVELS: readonly Level[] = ['E1', 'E2', 'E3']

/** The tracks the pyramid brackets, bottom first. */
export const TRACKS: readonly { track: LevelTrack; levels: readonly Level[] }[] = [
  { track: 'Individual contributor', levels: INDIVIDUAL_LEVELS },
  { track: 'Manager', levels: ['M1', 'M2'] },
  { track: 'Executive', levels: EXECUTIVE_LEVELS },
]

/** Business units the split names before folding the rest into Other. */
export const MAX_UNITS = 7
export const OTHER_UNITS = 'Other'
export const NOT_RECORDED = 'Not recorded'

const isLevel = (v: unknown): v is Level => typeof v === 'string' && (LEVELS as readonly string[]).includes(v)

/* ───────── shapes ───────── */

/** One level of a population: today, a year ago, the company outline, and the records behind them. */
export interface LevelRow {
  level: Level
  /** "L3 Career". */
  label: string
  track: LevelTrack
  today: number
  /** Null without job history or leavers. */
  yearAgo: number | null
  /** The company's share at this level × the scope's total; null for the whole company. */
  company: number | null
  change: number | null
  /** Null when a year ago is under the anonymity minimum. */
  growth: number | null
  /** Share of the population's total today; null when the total is under the minimum. */
  share: number | null
  /** People at this level today. */
  records: Employee[]
  /** People at this level a year ago (with today's record). */
  yearAgoRecords: Employee[]
}

/** One segment of a split: a level's people in one business unit, tenure band or worker type. */
export interface SegmentRow {
  split: Exclude<SplitKey, 'none'>
  level: Level
  segment: string
  today: number
  yearAgo: number | null
  /** Share of the level today; null when the level is under the minimum. */
  shareOfLevel: number | null
  records: Employee[]
  yearAgoRecords: Employee[]
  /** The segment is a filterable business unit (not Other or Not recorded). */
  unit: string | null
}

export interface Population {
  rows: LevelRow[]
  total: number
  yearAgoTotal: number | null
  /** Active today with no level: counted apart, not in the pyramid. */
  noLevel: Employee[]
  /** Active a year ago with no level then. */
  noLevelYearAgo: Employee[]
}

export interface FlowRow {
  level: Level
  label: string
  yearAgo: number
  hired: number
  promotedIn: number
  promotedOut: number
  left: number
  other: number
  today: number
  change: number
  growth: number | null
  records: {
    yearAgo: Employee[]
    hired: Employee[]
    promotedIn: JobChange[]
    promotedOut: JobChange[]
    left: Employee[]
    /** People whose move in or out of the level is neither a hire, a promotion nor an exit. */
    other: Employee[]
    today: Employee[]
  }
}

export interface RatioRow {
  /** "L2/L1", "E1-E3/M2". */
  key: string
  /** "L2 against L1". */
  label: string
  upper: readonly Level[]
  lower: readonly Level[]
  upperCount: number
  lowerCount: number
  /** Null when the level below is under the anonymity minimum. */
  ratio: number | null
  individual: boolean
  /** Individual track and above 1 + tolerance. */
  inverted: boolean
  records: Employee[]
}

export interface SpanManager {
  employee: Employee
  directs: number
  totalOrg: number
}

export interface SpanRow {
  /** "M1", or "E1-E3" when the executive levels are combined. */
  key: string
  label: string
  levels: readonly Level[]
  managers: number
  /** Null under the anonymity minimum of managers. */
  min: number | null
  q1: number | null
  median: number | null
  q3: number | null
  max: number | null
  /** At or above the Org chart's wide span, or at or below its narrow span (by the median). */
  flag: 'wide' | 'narrow' | null
  records: SpanManager[]
}

export interface MixRow {
  /** "Company", a business unit, or "Other (k)". */
  group: string
  /** A filterable business unit; null for Company and Other. */
  unit: string | null
  company: boolean
  band: BandKey
  bandLabel: string
  people: number
  /** Share of the group; null when the group is under the minimum. */
  share: number | null
  groupTotal: number
  records: Employee[]
}

export interface PyramidData {
  prep: Prep
  asOf: ISODate
  /** The day a year ago is counted on. */
  yearAgoDate: ISODate
  /** Job changes and leavers are loaded, so there is a year ago and a flow. */
  hasHistory: boolean
  /** Why there is no year ago, when there is none. */
  noHistory: string | null
  /** An org filter (or Manager mode's org) is on, so the company outline is offered. */
  scoped: boolean
  /** Employees (with contractors when that setting is on). */
  main: Population
  /** Every worker type, for the worker type split. */
  workers: Population
  segments: Record<Exclude<SplitKey, 'none'>, SegmentRow[]>
  /** Segment order per split (company order for business units; "Other" and "Not recorded" last). */
  segmentOrder: Record<Exclude<SplitKey, 'none'>, string[]>
  /** The company's business units by size, the first `MAX_UNITS` named. */
  units: string[]
  ratios: RatioRow[]
  spans: SpanRow[]
  /** Median span and manager count per level (any level with direct reports), for the pyramid's gutter. */
  spanByLevel: Map<Level, { managers: number; median: number | null }>
  /** Active direct reports of every worker type, per manager. */
  directsOf: (id: string) => number
  flow: FlowRow[]
  mix: MixRow[]
  /** Growth of the whole population with a level (null without history). */
  workforceGrowth: number | null
  history: History
}

/* ───────── helpers ───────── */

function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
  const arr = m.get(k)
  if (arr) arr.push(v)
  else m.set(k, [v])
}

/** The level a person held on d (today's level when no change came after d), when it is a known level. */
const levelOn = (h: History, e: Employee, d: ISODate): Level | null => {
  const l = h.levelAt(e, d)
  return isLevel(l) ? l : null
}

/** A population's level rows: today, a year ago and the company outline. */
function population(
  people: readonly Employee[],
  company: readonly Employee[] | null,
  asOf: ISODate,
  yearAgo: ISODate | null,
  h: History,
  min: number,
): Population {
  const today = new Map<Level, Employee[]>()
  const before = new Map<Level, Employee[]>()
  const noLevel: Employee[] = []
  const noLevelYearAgo: Employee[] = []
  for (const e of people) {
    if (isActiveAt(e, asOf)) {
      const l = levelOn(h, e, asOf)
      if (l) push(today, l, e)
      else noLevel.push(e)
    }
    if (yearAgo && isActiveAt(e, yearAgo)) {
      const l = levelOn(h, e, yearAgo)
      if (l) push(before, l, e)
      else noLevelYearAgo.push(e)
    }
  }
  const total = [...today.values()].reduce((a, r) => a + r.length, 0)
  const yearAgoTotal = yearAgo ? [...before.values()].reduce((a, r) => a + r.length, 0) : null
  // The company's shape (today's levels), scaled to the scope's total: an aggregate, never records.
  let companyShare: Map<Level, number> | null = null
  if (company) {
    const n = new Map<Level, number>()
    let all = 0
    for (const e of company) {
      if (!isActiveAt(e, asOf) || !isLevel(e.level)) continue
      n.set(e.level, (n.get(e.level) ?? 0) + 1)
      all++
    }
    companyShare = new Map(LEVELS.map((l) => [l, all ? (n.get(l) ?? 0) / all : 0]))
  }
  const rows: LevelRow[] = LEVELS.map((level) => {
    const records = today.get(level) ?? []
    const yearAgoRecords = before.get(level) ?? []
    const t = records.length
    const y = yearAgo ? yearAgoRecords.length : null
    return {
      level,
      label: LEVEL_LABELS[level],
      track: levelTrack(level),
      today: t,
      yearAgo: y,
      company: companyShare ? (companyShare.get(level) ?? 0) * total : null,
      change: y == null ? null : t - y,
      growth: y == null || y < min ? null : (t - y) / y,
      share: total >= min ? t / total : null,
      records,
      yearAgoRecords,
    }
  })
  return { rows, total, yearAgoTotal, noLevel, noLevelYearAgo }
}

/** Business units of the company by active headcount (People stats' population), largest first. */
function companyUnits(
  company: readonly Employee[],
  asOf: ISODate,
  counts: (e: Employee) => boolean,
): string[] {
  const n = new Map<string, number>()
  for (const e of company) {
    if (!counts(e) || !isActiveAt(e, asOf) || !e.businessUnit) continue
    n.set(e.businessUnit, (n.get(e.businessUnit) ?? 0) + 1)
  }
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([u]) => u)
}

const workerOf = (e: Employee): string =>
  WORKER_LABEL[e.employmentType ?? 'Not recorded'] ?? 'Type not recorded'

/** The segments of one split: every level × segment with people today or a year ago. */
function splitRows(
  split: Exclude<SplitKey, 'none'>,
  pop: Population,
  key: (e: Employee, d: ISODate) => string,
  order: readonly string[],
  asOf: ISODate,
  yearAgo: ISODate | null,
  min: number,
  named: ReadonlySet<string>,
): SegmentRow[] {
  const out: SegmentRow[] = []
  for (const r of pop.rows) {
    const now = new Map<string, Employee[]>()
    const then = new Map<string, Employee[]>()
    for (const e of r.records) push(now, key(e, asOf), e)
    if (yearAgo) for (const e of r.yearAgoRecords) push(then, key(e, yearAgo), e)
    for (const segment of order) {
      const records = now.get(segment) ?? []
      const yearAgoRecords = then.get(segment) ?? []
      if (!records.length && !yearAgoRecords.length) continue
      out.push({
        split,
        level: r.level,
        segment,
        today: records.length,
        yearAgo: yearAgo ? yearAgoRecords.length : null,
        shareOfLevel: r.today >= min ? records.length / r.today : null,
        records,
        yearAgoRecords,
        unit: named.has(segment) ? segment : null,
      })
    }
  }
  return out
}

/** Spans per level of the people who manage someone (every worker type reports to regular managers). */
function spansOf(
  people: readonly Employee[],
  asOf: ISODate,
  min: number,
  outliers: { wide: number; narrow: number },
) {
  const active = people.filter((e) => isActiveAt(e, asOf))
  const children = activeChildren(active, asOf)
  const below = subtreeSizer(children)
  const byId = new Map(active.map((e) => [e.employeeId, e]))
  const byLevel = new Map<Level, SpanManager[]>()
  for (const [id, kids] of children) {
    const m = byId.get(id)
    if (!m || !isLevel(m.level)) continue
    push(byLevel, m.level, { employee: m, directs: kids.length, totalOrg: below(id) })
  }
  const stat = (key: string, label: string, levels: readonly Level[]): SpanRow => {
    const records = levels.flatMap((l) => byLevel.get(l) ?? [])
    records.sort((a, b) => b.directs - a.directs || a.employee.name.localeCompare(b.employee.name))
    const spans = records.map((m) => m.directs)
    const shown = records.length >= min
    const median = shown ? quantile(spans, 0.5) : null
    return {
      key,
      label,
      levels,
      managers: records.length,
      min: shown ? Math.min(...spans) : null,
      q1: shown ? quantile(spans, 0.25) : null,
      median,
      q3: shown ? quantile(spans, 0.75) : null,
      max: shown ? Math.max(...spans) : null,
      flag:
        median == null
          ? null
          : median >= outliers.wide
            ? 'wide'
            : median <= outliers.narrow
              ? 'narrow'
              : null,
      records,
    }
  }
  // Management levels, one row each; the executive levels combine when each alone is under the minimum.
  const execEach = EXECUTIVE_LEVELS.map((l) => byLevel.get(l)?.length ?? 0)
  const combineExec = execEach.every((n) => n < min) && execEach.some((n) => n > 0)
  const rows: SpanRow[] = [
    stat('M1', LEVEL_LABELS.M1, ['M1']),
    stat('M2', LEVEL_LABELS.M2, ['M2']),
    ...(combineExec
      ? [stat('E1-E3', 'E1 to E3', EXECUTIVE_LEVELS)]
      : EXECUTIVE_LEVELS.map((l) => stat(l, LEVEL_LABELS[l], [l]))),
  ]
  const spanByLevel = new Map<Level, { managers: number; median: number | null }>()
  for (const l of LEVELS) {
    const ms = byLevel.get(l) ?? []
    if (ms.length)
      spanByLevel.set(l, {
        managers: ms.length,
        median:
          ms.length >= min
            ? quantile(
                ms.map((m) => m.directs),
                0.5,
              )
            : null,
      })
  }
  return { rows, spanByLevel, directsOf: (id: string) => children.get(id)?.length ?? 0 }
}

/** Size against the level below (5.2): L2/L1 to L6/L5, M2/M1 and E1-E3/M2. */
function ratiosOf(pop: Population, min: number, tolerance: number): RatioRow[] {
  const at = new Map(pop.rows.map((r) => [r.level, r]))
  const pairs: [readonly Level[], readonly Level[]][] = [
    ...INDIVIDUAL_LEVELS.slice(1).map((l, i): [Level[], Level[]] => [[l], [INDIVIDUAL_LEVELS[i]]]),
    [['M2'], ['M1']],
    [EXECUTIVE_LEVELS, ['M2']],
  ]
  return pairs.map(([upper, lower]) => {
    const up = upper.flatMap((l) => at.get(l)?.records ?? [])
    const low = lower.flatMap((l) => at.get(l)?.records ?? [])
    const u = upper.length > 1 ? `${upper[0]}-${upper[upper.length - 1]}` : upper[0]
    const individual = INDIVIDUAL_LEVELS.includes(upper[0])
    const ratio = low.length >= min ? up.length / low.length : null
    return {
      key: `${u}/${lower[0]}`,
      label: `${upper.length > 1 ? `${upper[0]} to ${upper[upper.length - 1]}` : upper[0]} against ${lower[0]}`,
      upper,
      lower,
      upperCount: up.length,
      lowerCount: low.length,
      ratio,
      individual,
      inverted: individual && ratio != null && ratio > 1 + tolerance,
      records: [...up, ...low],
    }
  })
}

/**
 * How each level changed (5.2), person by person so every row reconciles: a year ago + hired +
 * promoted in − promoted out − left + other = today. Hires and exits are placed at the level held
 * on the day; promotions at their from and to levels. Whatever is left over for a person at a
 * level (a demotion, a correction, a level change that is not a promotion) is an other change.
 */
function flowOf(p: Prep, people: readonly Employee[], h: History, yearAgo: ISODate, min: number): FlowRow[] {
  const { asOf } = p
  const promosBy = new Map<string, JobChange[]>()
  for (const c of p.changes)
    if (c.changeType === 'Promotion' && c.effectiveDate > yearAgo && c.effectiveDate <= asOf)
      push(promosBy, c.employeeId, c)
  const rows = new Map<Level, FlowRow>(
    LEVELS.map((level) => [
      level,
      {
        level,
        label: LEVEL_LABELS[level],
        yearAgo: 0,
        hired: 0,
        promotedIn: 0,
        promotedOut: 0,
        left: 0,
        other: 0,
        today: 0,
        change: 0,
        growth: null,
        records: { yearAgo: [], hired: [], promotedIn: [], promotedOut: [], left: [], other: [], today: [] },
      },
    ]),
  )
  for (const e of people) {
    const net = new Map<Level, number>()
    const add = (l: Level | null, v: number) => {
      if (l) net.set(l, (net.get(l) ?? 0) + v)
    }
    const was = isActiveAt(e, yearAgo) ? levelOn(h, e, yearAgo) : null
    const now = isActiveAt(e, asOf) ? levelOn(h, e, asOf) : null
    if (was) {
      const r = rows.get(was) as FlowRow
      r.yearAgo++
      r.records.yearAgo.push(e)
    }
    if (now) {
      const r = rows.get(now) as FlowRow
      r.today++
      r.records.today.push(e)
    }
    // What the events explain, per level; the rest is an other change.
    add(now, 1)
    add(was, -1)
    if (e.hireDate > yearAgo && e.hireDate <= asOf) {
      const at = levelOn(h, e, e.hireDate)
      if (at) {
        const r = rows.get(at) as FlowRow
        r.hired++
        r.records.hired.push(e)
        add(at, -1)
      }
    }
    if (
      e.terminationDate &&
      e.terminationDate > yearAgo &&
      e.terminationDate <= asOf &&
      e.hireDate < e.terminationDate
    ) {
      // The level held on the last day worked.
      const at = levelOn(h, e, addDays(e.terminationDate, -1))
      if (at) {
        const r = rows.get(at) as FlowRow
        r.left++
        r.records.left.push(e)
        add(at, 1)
      }
    }
    for (const c of promosBy.get(e.employeeId) ?? []) {
      if (!isActiveAt(e, c.effectiveDate) || !isLevel(c.fromLevel) || !isLevel(c.toLevel)) continue
      const from = rows.get(c.fromLevel) as FlowRow
      const to = rows.get(c.toLevel) as FlowRow
      from.promotedOut++
      from.records.promotedOut.push(c)
      to.promotedIn++
      to.records.promotedIn.push(c)
      add(c.fromLevel, 1)
      add(c.toLevel, -1)
    }
    for (const [l, v] of net) {
      if (!v) continue
      const r = rows.get(l) as FlowRow
      r.other += v
      r.records.other.push(e)
    }
  }
  return LEVELS.map((l) => {
    const r = rows.get(l) as FlowRow
    r.change = r.today - r.yearAgo
    r.growth = r.yearAgo >= min ? r.change / r.yearAgo : null
    return r
  })
}

/** Level mix by business unit (5.5.5): a Company row first, then units in company order, small ones folded. */
function mixOf(
  scoped: readonly Employee[],
  company: readonly Employee[],
  units: readonly string[],
  asOf: ISODate,
  min: number,
): MixRow[] {
  const bandsOf = (people: readonly Employee[]) => {
    const m = new Map<BandKey, Employee[]>()
    for (const e of people) if (isActiveAt(e, asOf) && isLevel(e.level)) push(m, bandOf(e.level).key, e)
    return m
  }
  const rowsFor = (group: string, unit: string | null, isCompany: boolean, people: readonly Employee[]) => {
    const by = bandsOf(people)
    const total = [...by.values()].reduce((a, r) => a + r.length, 0)
    return BANDS.map(
      (b): MixRow => ({
        group,
        unit,
        company: isCompany,
        band: b.key,
        bandLabel: b.label,
        people: by.get(b.key)?.length ?? 0,
        share: total >= min ? (by.get(b.key)?.length ?? 0) / total : null,
        groupTotal: total,
        records: by.get(b.key) ?? [],
      }),
    )
  }
  const byUnit = new Map<string, Employee[]>()
  for (const e of scoped)
    if (isActiveAt(e, asOf) && isLevel(e.level)) push(byUnit, e.businessUnit || NOT_RECORDED, e)
  // The company's largest units keep their own row (a small one shows its counts and no shares, so
  // Filter to always finds it); the rest fold into Other.
  const named = units.slice(0, MAX_UNITS).filter((u) => byUnit.has(u))
  // A blank unit is its own row, last; it never folds into Other.
  const rest = [...byUnit.keys()].filter((u) => !named.includes(u) && u !== NOT_RECORDED)
  const restPeople = rest.flatMap((u) => byUnit.get(u) ?? [])
  const blank = byUnit.get(NOT_RECORDED) ?? []
  return [
    ...rowsFor('Company', null, true, company),
    ...named.flatMap((u) => rowsFor(u, u, false, byUnit.get(u) ?? [])),
    ...(restPeople.length ? rowsFor(`Other (${rest.length})`, null, false, restPeople) : []),
    ...(blank.length ? rowsFor(NOT_RECORDED, null, false, blank) : []),
  ]
}

/* ───────── the data ───────── */

export function pyramidData(ctx: AnalyticsContext): PyramidData {
  const p = prepare(ctx)
  const { asOf } = p
  const min = p.set.minGroup
  const tolerance = ctx.metrics.num('hrbp.pyramid.ratioBelow', 'tolerance')
  const yearAgoDate = addDays(p.t12.start, -1)
  const hasHistory = p.has.jobChanges && p.has.terminationDate
  const noHistory = !p.has.terminationDate
    ? 'Add leavers (Termination date) to Employees to compare with past headcount.'
    : !p.has.jobChanges
      ? 'Add Job changes to compare with a year ago.'
      : null
  const yearAgo = hasHistory ? yearAgoDate : null
  // One history over every worker's job changes in scope: an employee's steps are the same as
  // People stats' (which keeps employees only), and contractors get theirs for the worker split.
  const history = buildHistory(ctx.data.jobChanges)
  const scoped = !ctx.isCompany
  const workersAll = ctx.data.employees
  const main = population(p.emps, scoped ? p.companyEmps : null, asOf, yearAgo, history, min)
  const workers = population(workersAll, scoped ? ctx.all.employees : null, asOf, yearAgo, history, min)

  const units = companyUnits(ctx.all.employees, asOf, p.counts)
  const named = new Set(units.slice(0, MAX_UNITS))
  const unitOf = (e: Employee) =>
    !e.businessUnit ? NOT_RECORDED : named.has(e.businessUnit) ? e.businessUnit : OTHER_UNITS
  const unitOrder = [...units.slice(0, MAX_UNITS), OTHER_UNITS, NOT_RECORDED]
  const tenureOf = (e: Employee, d: ISODate) => tenureBand(tenureYears(e, d))
  const segmentOrder = {
    businessUnit: unitOrder,
    tenure: [...TENURE_BANDS] as string[],
    workerType: WORKER_ORDER,
  }
  const none = new Set<string>()
  const segments = {
    businessUnit: splitRows('businessUnit', main, (e) => unitOf(e), unitOrder, asOf, yearAgo, min, named),
    tenure: splitRows('tenure', main, tenureOf, segmentOrder.tenure, asOf, yearAgo, min, none),
    workerType: splitRows('workerType', workers, workerOf, WORKER_ORDER, asOf, yearAgo, min, none),
  }
  const spans = spansOf(ctx.data.employees, asOf, min, p.set.spanOutliers)
  const levelled = (r: Population) => r.rows.reduce((a, x) => a + x.today, 0)
  const workforceGrowth =
    main.yearAgoTotal != null && main.yearAgoTotal >= min
      ? (levelled(main) - main.yearAgoTotal) / main.yearAgoTotal
      : null

  return {
    prep: p,
    asOf,
    yearAgoDate,
    hasHistory,
    noHistory,
    scoped,
    main,
    workers,
    segments,
    segmentOrder,
    units,
    ratios: ratiosOf(main, min, tolerance),
    spans: spans.rows,
    spanByLevel: spans.spanByLevel,
    directsOf: spans.directsOf,
    flow: hasHistory ? flowOf(p, p.emps, history, yearAgoDate, min) : [],
    mix: mixOf(p.emps, p.companyEmps, units, asOf, min),
    workforceGrowth,
    history,
  }
}
