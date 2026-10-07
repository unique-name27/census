/**
 * The four Compensation charts added in the design refresh (docs/CHARTS.md, Compensation):
 *
 *  - pay position against voluntary attrition, one dot per location or department;
 *  - median compa-ratio by location and level group;
 *  - pay or the range, one dot per job family (market median ÷ midpoint against compa-ratio);
 *  - who is below the range minimum, by location and why (promoted, hired, neither).
 *
 * Every number is recounted from the population (`CompPerson`, built from the raw comp and
 * roster rows) and the Employees rows; a statistic over fewer than the anonymity minimum is null
 * and has nobody behind it, so it never opens. Ratios and counts only: no pay amount appears in
 * any row, so the Show pay amounts switch does not change these charts. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Employee, Level } from '@/data/schema'
import type { Window } from '@/data/scope'
import { groupFilter } from '@/drill/filter'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { hasExitData } from '@/lib/people'
import { exitsIn } from '@/views/hrbp/engine/population'
import { peopleStatsAttrition, peopleStatsCounts } from '@/views/hrbp/engine/settings'
import { type DrillCompSpec, peopleDrill, scopeLine, X_MARKET, X_MARKET_MID, X_POSITION } from './drill'
import { type GroupDim, rowFilter } from './groupFilter'
import { safeMedian, values } from './groups'
import type { CompPerson } from './population'

/* ───────── pay position and voluntary attrition ───────── */

export type PayAttritionDim = 'location' | 'department'

export interface PayAttritionRow extends GroupDim {
  group: string
  /** People with a compa-ratio in the group. */
  people: number
  /** Median compa-ratio; null under the anonymity minimum. */
  compa: number | null
  /** Average headcount over the window, as People stats measures it. */
  avgHeadcount: number
  /** Voluntary exits in the window. */
  exits: number
  /** Voluntary attrition over the window; null under the anonymity minimum or without exit data. */
  voluntary: number | null
  /** The people behind the median (empty when it is hidden). */
  members: CompPerson[]
  /** The voluntary leavers behind the rate (empty when it is hidden). */
  leavers: Employee[]
}

export interface PayAttrition {
  dim: PayAttritionDim
  /** Every group with someone paid, lowest compa-ratio first; groups with a hidden number last. */
  rows: PayAttritionRow[]
  /** The groups with both numbers shown: the dots. */
  shown: PayAttritionRow[]
  /** Groups left out because a number is hidden (under the anonymity minimum). */
  hidden: number
  company: { compa: number | null; voluntary: number | null }
  window: Window
}

/**
 * Median compa-ratio and voluntary attrition per location or department. Attrition is measured as
 * People stats measures it (its population and annualizing settings), over the period picker's
 * window, from the Employees rows of the group (leavers keep their last location and department).
 */
export function payAttrition(
  ctx: Pick<AnalyticsContext, 'data' | 'all' | 'window' | 'metrics'>,
  people: readonly CompPerson[],
  dim: PayAttritionDim,
  min: number,
  companyCompa: number | null,
): PayAttrition {
  const window = ctx.window
  const exitData = hasExitData(ctx.all.employees)
  const counts = peopleStatsCounts(ctx.metrics)
  const byGroup = new Map<string, CompPerson[]>()
  for (const p of people) {
    if (p.compa == null) continue
    const g = p[dim]
    if (!g) continue
    const arr = byGroup.get(g)
    if (arr) arr.push(p)
    else byGroup.set(g, [p])
  }
  const emps = new Map<string, Employee[]>()
  for (const e of ctx.data.employees) {
    const g = e[dim]
    if (!byGroup.has(g)) continue
    const arr = emps.get(g)
    if (arr) arr.push(e)
    else emps.set(g, [e])
  }
  const rows: PayAttritionRow[] = [...byGroup.entries()].map(([group, members]) => {
    const compa = safeMedian(
      values(members, (p) => p.compa),
      min,
    )
    const groupEmps = emps.get(group) ?? []
    const rate = peopleStatsAttrition(ctx.metrics, groupEmps, window, 'voluntary', {
      exitDataPresent: exitData,
    })
    const shownRate = rate.rate != null && rate.avgHeadcount >= min ? rate.rate : null
    const leavers = exitsIn(groupEmps, window, counts).filter((e) => e.terminationType === 'Voluntary')
    return {
      group,
      dim,
      people: members.length,
      compa,
      avgHeadcount: rate.avgHeadcount,
      exits: leavers.length,
      voluntary: shownRate,
      members: compa == null ? [] : members,
      leavers: shownRate == null ? [] : leavers,
    }
  })
  const key = (r: PayAttritionRow) => (r.compa == null || r.voluntary == null ? 1 : 0)
  rows.sort(
    (a, b) =>
      key(a) - key(b) ||
      (a.compa ?? 9) - (b.compa ?? 9) ||
      b.people - a.people ||
      a.group.localeCompare(b.group),
  )
  const shown = rows.filter((r) => r.compa != null && r.voluntary != null)
  const company = peopleStatsAttrition(ctx.metrics, ctx.all.employees, window, 'voluntary', {
    exitDataPresent: exitData,
  })
  return {
    dim,
    rows,
    shown,
    hidden: rows.length - shown.length,
    company: { compa: companyCompa, voluntary: company.avgHeadcount >= min ? company.rate : null },
    window,
  }
}

/* ───────── median compa-ratio by location and level group ───────── */

/** Level groups, so cells stay large enough to show (the Org chart's color key groups). */
export const COMPA_LEVEL_GROUPS = [
  { key: 'L1-L2', levels: ['L1', 'L2'] },
  { key: 'L3-L4', levels: ['L3', 'L4'] },
  { key: 'L5-L6', levels: ['L5', 'L6'] },
  { key: 'M1', levels: ['M1'] },
  { key: 'M2', levels: ['M2'] },
  { key: 'E1-E3', levels: ['E1', 'E2', 'E3'] },
] as const satisfies readonly { key: string; levels: readonly Level[] }[]

const levelGroupOf = new Map<string, string>(
  COMPA_LEVEL_GROUPS.flatMap((g) => g.levels.map((l) => [l, g.key] as [string, string])),
)

export interface CompaCell {
  location: string
  levelGroup: string
  /** The levels in the group, for its filter ("L3", "L4"). */
  levels: readonly string[]
  /** People with a compa-ratio in the cell. */
  n: number
  /** Median compa-ratio; null under the anonymity minimum. */
  median: number | null
  /** The people behind the median (empty when it is hidden). */
  members: CompPerson[]
}

export interface CompaGrid {
  cells: CompaCell[]
  /** Locations, lowest median compa-ratio first (the order of the location bars). */
  locations: string[]
  /** Level groups with anyone in them, in level order. */
  groups: string[]
  /** Cells hidden for anonymity (1 to 4 people). */
  hiddenCells: number
  /** People with a compa-ratio but no level, left out of the grid. */
  noLevel: number
}

export function compaGrid(people: readonly CompPerson[], min: number): CompaGrid {
  const valued = people.filter((p) => p.compa != null)
  const cellsBy = new Map<string, CompPerson[]>()
  const byLocation = new Map<string, CompPerson[]>()
  let noLevel = 0
  for (const p of valued) {
    const g = p.level ? levelGroupOf.get(p.level) : undefined
    if (!g) {
      noLevel++
      continue
    }
    const k = `${p.location}\u0000${g}`
    const arr = cellsBy.get(k)
    if (arr) arr.push(p)
    else cellsBy.set(k, [p])
    const loc = byLocation.get(p.location)
    if (loc) loc.push(p)
    else byLocation.set(p.location, [p])
  }
  const locMedian = (l: string) =>
    safeMedian(
      values(byLocation.get(l) ?? [], (p) => p.compa),
      min,
    )
  const locations = [...byLocation.keys()].sort(
    (a, b) =>
      (locMedian(a) ?? 9) - (locMedian(b) ?? 9) ||
      (byLocation.get(b)?.length ?? 0) - (byLocation.get(a)?.length ?? 0) ||
      a.localeCompare(b),
  )
  const groups = COMPA_LEVEL_GROUPS.filter((g) => locations.some((l) => cellsBy.has(`${l}\u0000${g.key}`)))
  const cells: CompaCell[] = []
  let hiddenCells = 0
  for (const l of locations) {
    for (const g of groups) {
      const rows = cellsBy.get(`${l}\u0000${g.key}`) ?? []
      if (!rows.length) continue
      const median = safeMedian(
        values(rows, (p) => p.compa),
        min,
      )
      if (median == null) hiddenCells++
      cells.push({
        location: l,
        levelGroup: g.key,
        levels: g.levels,
        n: rows.length,
        median,
        members: median == null ? [] : rows,
      })
    }
  }
  return { cells, locations, groups: groups.map((g) => g.key), hiddenCells, noLevel }
}

/* ───────── pay or the range: job families against the market ───────── */

export interface FamilyPositionRow {
  family: string
  /** People with both a market median and a compa-ratio. */
  n: number
  /** Median of market median ÷ range midpoint: above 1.00 the range trails the market. */
  marketVsMid: number
  /** Median compa-ratio: below 1.00 pay sits low in the range. */
  compa: number
  /** Median market ratio (base ÷ market median), for the table. */
  marketRatio: number | null
  members: CompPerson[]
}

export interface FamilyPosition {
  rows: FamilyPositionRow[]
  /** Families left out: fewer people with a market median than the anonymity minimum. */
  hidden: number
  /** People with a compa-ratio and no market median (left out). */
  unpriced: number
  /** People with a compa-ratio. */
  total: number
}

export function familyMarketPosition(people: readonly CompPerson[], min: number): FamilyPosition {
  const valued = people.filter((p) => p.compa != null)
  const priced = valued.filter((p) => p.marketVsMid != null)
  const byFamily = new Map<string, CompPerson[]>()
  for (const p of priced) {
    const arr = byFamily.get(p.jobFamily)
    if (arr) arr.push(p)
    else byFamily.set(p.jobFamily, [p])
  }
  const rows: FamilyPositionRow[] = []
  let hidden = 0
  for (const [family, members] of byFamily) {
    const marketVsMid = safeMedian(
      values(members, (p) => p.marketVsMid),
      min,
    )
    const compa = safeMedian(
      values(members, (p) => p.compa),
      min,
    )
    if (marketVsMid == null || compa == null) {
      hidden++
      continue
    }
    rows.push({
      family,
      n: members.length,
      marketVsMid,
      compa,
      marketRatio: safeMedian(
        values(members, (p) => p.marketRatio),
        min,
      ),
      members,
    })
  }
  rows.sort((a, b) => b.marketVsMid - a.marketVsMid || a.family.localeCompare(b.family))
  return { rows, hidden, unpriced: valued.length - priced.length, total: valued.length }
}

/* ───────── below the range minimum, by location and cause ───────── */

export const CAUSE = {
  promoted: 'Promoted in the last 12 months',
  hired: 'Hired in the last 12 months',
  neither: 'Neither',
  notHired: 'Not hired in the last 12 months',
} as const

export interface BelowCauseRow {
  location: string
  cause: string
  people: number
  members: CompPerson[]
}

export interface BelowCause {
  rows: BelowCauseRow[]
  /** Locations with anyone below minimum, most first. */
  locations: string[]
  causes: string[]
  /** Below minimum at each location. */
  totals: Map<string, CompPerson[]>
  total: number
}

/**
 * Why people are below the range minimum. Promoted (a promotion in Job changes in the 12 months
 * to the as-of date) wins over hired (a hire date in those 12 months). When Job changes are below
 * the data standard, promotions are not read: the split is hired or not.
 */
export function belowMinByCause(people: readonly CompPerson[], promotionsShown: boolean): BelowCause {
  const causes: string[] = promotionsShown
    ? [CAUSE.promoted, CAUSE.hired, CAUSE.neither]
    : [CAUSE.hired, CAUSE.notHired]
  const causeOf = (p: CompPerson): string =>
    promotionsShown && p.promotedRecently
      ? CAUSE.promoted
      : p.hiredRecently
        ? CAUSE.hired
        : promotionsShown
          ? CAUSE.neither
          : CAUSE.notHired
  const totals = new Map<string, CompPerson[]>()
  const cells = new Map<string, CompPerson[]>()
  for (const p of people) {
    if (p.position !== 'Below minimum') continue
    const loc = p.location || 'Not recorded'
    const t = totals.get(loc)
    if (t) t.push(p)
    else totals.set(loc, [p])
    const k = `${loc}\u0000${causeOf(p)}`
    const c = cells.get(k)
    if (c) c.push(p)
    else cells.set(k, [p])
  }
  const locations = [...totals.keys()].sort(
    (a, b) => totals.get(b)!.length - totals.get(a)!.length || a.localeCompare(b),
  )
  const rows: BelowCauseRow[] = locations.flatMap((location) =>
    causes.map((cause) => {
      const members = cells.get(`${location}\u0000${cause}`) ?? []
      return { location, cause, people: members.length, members }
    }),
  )
  return { rows, locations, causes, totals, total: [...totals.values()].reduce((a, r) => a + r.length, 0) }
}

/* ───────── drills ───────── */

interface Scope {
  scopeLabel: string
  asOf: string
}

const byCompa = (a: CompPerson, b: CompPerson) =>
  (a.compa ?? 9) - (b.compa ?? 9) || a.name.localeCompare(b.name)

const withGroupFilter = <S extends DrillSpec>(spec: S | null, row: PayAttritionRow): S | null => {
  const filter = rowFilter(row)
  return spec && filter ? { ...spec, filter } : spec
}

/** The group's people and their compa-ratio (a dot, or the compa-ratio cell of the table). */
export function payGroupDrill(m: Scope, row: PayAttritionRow): DrillCompSpec | null {
  return withGroupFilter(
    peopleDrill({
      title: `Compa-ratio in ${row.group}`,
      subtitle: scopeLine(m),
      people: row.members,
      extras: [X_POSITION],
      hide: ['meritPct'],
      sort: byCompa,
      note: `Median ${fmt(row.compa, 'ratio')} across ${fmt(row.members.length, 'int')} people with a compa-ratio.`,
    }),
    row,
  )
}

/** The group's voluntary leavers in the window (the attrition cell of the table, and the detail export). */
export function payLeaversDrill(m: Scope, a: Pick<PayAttrition, 'window'>, row: PayAttritionRow) {
  if (!row.leavers.length) return null
  const spec = drillSpec({
    kind: 'employees',
    title: `Voluntary leavers in ${row.group}`,
    subtitle: `${a.window.label} · ${m.scopeLabel}`,
    rows: row.leavers,
    hide: ['status', 'employmentType'],
    note: `Voluntary attrition ${fmt(row.voluntary, 'pct')}: ${fmt(row.exits, 'int')} voluntary exits over an average headcount of ${fmt(row.avgHeadcount, 'num1')}, as People stats measures it.`,
  })
  return withGroupFilter(spec, row)
}

/** A cell of the location and level grid: its people, with the location and the levels as the filter. */
export function compaCellDrill(m: Scope, cell: CompaCell): DrillCompSpec | null {
  const spec = peopleDrill({
    title: `Compa-ratio in ${cell.location}, ${cell.levelGroup}`,
    subtitle: scopeLine(m),
    people: cell.members,
    extras: [X_POSITION],
    hide: ['meritPct'],
    sort: byCompa,
    note: `Median ${fmt(cell.median, 'ratio')} across ${fmt(cell.members.length, 'int')} people.`,
  })
  const loc = groupFilter('location', cell.location)
  const lvl = groupFilter('level', cell.levels)
  if (!spec || !loc || !lvl) return spec
  return { ...spec, filter: { ...loc, ...lvl }, filterLabel: `${cell.location}, ${cell.levelGroup}` }
}

/** A job family's people with their compa-ratio and how their range compares with the market. */
export function familyPositionDrill(m: Scope, row: FamilyPositionRow): DrillCompSpec | null {
  return peopleDrill({
    title: `Pay and the range in ${row.family}`,
    subtitle: scopeLine(m),
    people: row.members,
    extras: [X_MARKET_MID, X_MARKET, X_POSITION],
    hide: ['meritPct', 'penetration'],
    sort: (a, b) => (b.marketVsMid ?? 0) - (a.marketVsMid ?? 0) || a.name.localeCompare(b.name),
    note: `Median market median ÷ midpoint ${fmt(row.marketVsMid, 'ratio')}, median compa-ratio ${fmt(row.compa, 'ratio')}, ${fmt(row.n, 'int')} people with a market median.`,
  })
}

/** Below minimum at a location, for one cause or all of them (the whole bar). */
export function belowCauseDrill(
  m: Scope,
  b: Pick<BelowCause, 'totals' | 'rows'>,
  location: string,
  cause: string | null,
): DrillCompSpec | null {
  const people =
    cause == null
      ? (b.totals.get(location) ?? [])
      : (b.rows.find((r) => r.location === location && r.cause === cause)?.members ?? [])
  const spec = peopleDrill({
    title: cause
      ? `Below range minimum in ${location}: ${cause.toLowerCase()}`
      : `Below range minimum in ${location}`,
    subtitle: scopeLine(m),
    people,
    extras: [X_POSITION],
    hide: ['meritPct'],
    sort: byCompa,
    note: `Base salary under the range minimum on ${formatDate(m.asOf)}.`,
  })
  const filter = groupFilter('location', location)
  return spec && filter ? { ...spec, filter } : spec
}
