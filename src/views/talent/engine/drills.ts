/**
 * Drill-down for every Talent number: the raw records behind it (reviews, succession plan rows,
 * learning assignments, employees), titled in plain words with the scope and window.
 *
 * Every builder returns null when nothing sits behind the number (a zero, or a value hidden to
 * protect anonymity), else a thunk that gathers the rows only when someone clicks. The null checks
 * are cheap lookups, so tables and charts can ask for every cell while rendering.
 *
 * Counts match: a count opens exactly that many records, a rate opens the events in its numerator
 * (with the denominator in the note), an average opens the records it averages.
 * Pure: no React, no DOM.
 */
import type { Employee, LearningRecord, Potential, Readiness, Review, SuccessionPlan } from '@/data/schema'
import { MIN_GROUP } from '@/data/schema'
import { type DrillExtra, type DrillSpec, drillSpec } from '@/drill/types'
import { addMonths, daysBetween, formatDate, formatMonth } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { normRating, type PerfBand, ratingAt, segmentName, type TalentBase } from './base'
import { completionKey, isOnTime, type LearningResult, type OverdueCell } from './learning'
import type { NineBoxPerson, NineBoxResult } from './ninebox'
import { cycleKey, type HighShareRow, type PerformanceResult, ratingLabel } from './performance'
import type { OverdueResult } from './promotion'
import { type RetentionResult, reasonsFor } from './retention'
import { type FactorKey, factorDef, type RiskBand, type RiskModel } from './risk'
import type { BenchScope, Coverage, HipoGroupRow, RoleRow, SuccessionResult } from './succession'

/** The records behind a number, gathered on click; null when there is nothing to open. */
export type TalentDrill = (() => DrillSpec) | null

export type HighShareDim = 'department' | 'businessUnit' | 'level'
export type HipoDim = 'level' | 'businessUnit'
export type OnTimePart = 'due' | 'onTime' | 'late' | 'open'
export type ExitPart = 'rated' | 'Voluntary' | 'Involuntary' | 'left'

export interface DrillInputs {
  base: TalentBase
  performance: PerformanceResult
  nineBox: NineBoxResult
  succession: SuccessionResult
  retention: RetentionResult
  overdue: OverdueResult
  learning: LearningResult
  risk: RiskModel
}

export interface TalentDrills {
  /* Performance */
  /** Active employees rated in the latest cycle (the "Rated in latest cycle" numerator). */
  ratedActive(): TalentDrill
  /** Everyone rated 4 or 5 in the latest cycle. */
  highPerformers(): TalentDrill
  /** Everyone at one rating (1-5) in the latest cycle. */
  rating(rating: number): TalentDrill
  /**
   * People rated, or rated 4-5, in one row of a folded breakdown. `fold` lists the rows a chart
   * combined into its own "Other (k)" row.
   */
  highShare(
    dim: HighShareDim,
    row: HighShareRow,
    part: 'rated' | 'high',
    fold?: readonly HighShareRow[],
  ): TalentDrill
  /** People rated 4 or 5 in one business unit (rating inflation and the guideline match). */
  unitHigh(businessUnit: string): TalentDrill
  /** People rated in a business unit, or at one rating there (the rating mix). */
  mix(businessUnit: string, rating: number | null): TalentDrill
  /** Reviews calibration measured in a business unit: all of them, or those it moved down or up. */
  calibration(businessUnit: string, part: 'all' | 'down' | 'up'): TalentDrill
  /** The ratings behind a business unit's average in one cycle. */
  cycleUnit(cycle: string, businessUnit: string): TalentDrill
  /** The exit cohort at one rating: everyone rated, or who left (by type) within 12 months. */
  exitCohort(rating: number, part: ExitPart): TalentDrill
  /* 9-box */
  nineBox(performance: PerfBand, potential: Potential, part: 'all' | 'highRisk'): TalentDrill
  /* Succession */
  /** Critical roles with a successor ready now (the coverage numerator). */
  coverage(): TalentDrill
  /** One row per role, for any list of roles. */
  roles(roles: readonly RoleRow[], title: string, note?: string): TalentDrill
  /** Roles in a business unit by the readiness of their best successor (null: every role there). */
  coverageCell(businessUnit: string, coverage: Coverage | null): TalentDrill
  /** The successors counted on one role's bench, or those at one readiness. */
  roleBench(roleId: string, readiness: Readiness | null): TalentDrill
  /** Successors counted in a business unit (null readiness: all); `perRole` notes the ratio. */
  bench(scope: BenchScope, businessUnit: string, readiness: Readiness | null, perRole?: boolean): TalentDrill
  /** Roles in a business unit: all of them, or those with nobody named. */
  benchRoles(scope: BenchScope, businessUnit: string, part: 'all' | 'none'): TalentDrill
  /** Potential assessments: everyone, or one row of a breakdown; all assessed or the high potentials. */
  hipo(dim: HipoDim | null, row: HipoGroupRow | null, part: 'assessed' | 'high'): TalentDrill
  /* Retention */
  band(band: RiskBand, where: 'scope' | 'company'): TalentDrill
  keyTalent(): TalentDrill
  /** High-band people with a factor, or for whom it is the main reason. */
  driver(key: FactorKey, part: 'any' | 'main'): TalentDrill
  /** The back-test: everyone scored in a band a year ago, or who of them left (noted as a rate or a share of leavers). */
  backTest(band: RiskBand, part: 'scored' | 'left' | 'shareOfLeavers'): TalentDrill
  regrettedHigh(period: 'current' | 'prior'): TalentDrill
  hipoExits(): TalentDrill
  promotionOverdue(): TalentDrill
  /* Learning */
  /** Required assignments due in the period (one course or all), by outcome. */
  onTime(course: string | null, part: OnTimePart): TalentDrill
  completions(month: string, kind: 'Required' | 'Optional' | null): TalentDrill
  overdueCell(dim: 'department' | 'location', cell: OverdueCell, part: 'pastDue' | 'overdue'): TalentDrill
  /** The overdue assignments where the overdue finding concentrates. */
  overdueSegment(): TalentDrill
  hours(businessUnit: string): TalentDrill
}

/**
 * Standard employee columns that read the same on every row of these lists (everyone active
 * today, or everyone a leaver; employees only), so they are left out.
 */
const SAME_HIDE = ['status', 'employmentType']
/** Role lists show one plan row per role, so its own successor and readiness would mislead. */
const ROLE_HIDE = ['successor', 'readiness']

const HIGH = 4
const isHigh = (r: Review) => (normRating(r.rating) ?? 0) >= HIGH
const isHipo = (r: Review) => r.potential === 'High'
const n = (v: number) => fmt(v, 'int')
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ')
const cap = (s: string) => s.replace(/^./, (m) => m.toUpperCase())

const DIM_NOUN: Record<HighShareDim | HipoDim, [string, string]> = {
  department: ['department', 'departments'],
  businessUnit: ['business unit', 'business units'],
  level: ['level', 'levels'],
}

/** "Design Verification", "level L4", or "3 smaller departments" for a folded row. */
function groupName(dim: HighShareDim | HipoDim, group: string, other: boolean, groups?: number): string {
  if (other)
    return groups
      ? `${n(groups)} smaller ${DIM_NOUN[dim][1]} combined`
      : `smaller ${DIM_NOUN[dim][1]} combined`
  return dim === 'level' ? `level ${group}` : group
}

const COVERAGE_PHRASE: Record<Coverage, string> = {
  'Ready now': 'with a successor ready now',
  'Ready in 1-2 years': 'whose best successor is ready in 1-2 years',
  'Ready in 3+ years': 'whose best successor is ready in 3+ years',
  'No successor': 'with no successor',
}

const BENCH_TITLE: Record<BenchScope, string> = {
  All: 'Critical and key roles',
  Critical: 'Critical roles',
  Key: 'Key roles',
}

const inBench = (scope: BenchScope) => (r: RoleRow) => scope === 'All' || r.criticality === scope

export function buildDrills(x: DrillInputs): TalentDrills {
  const {
    base,
    performance: perf,
    nineBox: nb,
    succession: succ,
    retention: ret,
    overdue,
    learning,
    risk,
  } = x
  const { ctx, asOf } = base
  const scope = ctx.scopeLabel
  const asOfText = formatDate(asOf)
  const asOfSub = join(`As of ${asOfText}`, scope)
  const windowSub = join(ctx.window.label, scope)
  const cycleName = perf.cycle?.cycle ?? 'the latest cycle'
  const cycleSub = join(perf.cycle?.cycle, scope)
  const pr = perf.records
  const sr = succ.records
  const lr = learning.records
  const common = new Set(ret.commonFactors)

  const people = (ids: Iterable<string>): Employee[] => {
    const out: Employee[] = []
    for (const id of ids) {
      const e = base.byId.get(id)
      if (e) out.push(e)
    }
    return out
  }
  const when = (ok: boolean, build: () => DrillSpec): TalentDrill => (ok ? build : null)

  /* ───────── extras ───────── */

  const riskExtra: DrillExtra<Employee> = {
    columns: [
      { key: 'riskScore', label: 'Flight-risk score', format: 'int' },
      { key: 'riskBand', label: 'Flight-risk band' },
      { key: 'mainReason', label: 'Main reason' },
      { key: 'alsoReason', label: 'Also' },
      { key: 'latestRating', label: 'Latest rating', format: 'int' },
    ],
    values: (e) => {
      const r = risk.scores.get(e.employeeId)
      const [main, also] = r ? reasonsFor(r.factors, common) : [null, null]
      return {
        riskScore: r?.score ?? null,
        riskBand: r?.band ?? null,
        mainReason: main?.reason ?? null,
        alsoReason: also?.reason ?? null,
        latestRating: ratingAt(base, e.employeeId, asOf),
      }
    },
  }

  /** "Last rating" for leavers: the rating they held when they left. */
  const lastRatingExtra = (ratings: ReadonlyMap<string, number | null>): DrillExtra<Employee> => ({
    columns: [{ key: 'lastRating', label: 'Last rating', format: 'int' }],
    values: (e) => ({ lastRating: ratings.get(e.employeeId) ?? null }),
  })

  const calibrationExtra: DrillExtra<Review> = {
    columns: [{ key: 'calibrationChange', label: 'Calibration change' }],
    values: (r) => {
      const d = (normRating(r.rating) ?? 0) - (normRating(r.preCalibrationRating) ?? 0)
      return { calibrationChange: d < 0 ? `Down ${-d}` : d > 0 ? `Up ${d}` : 'No change' }
    },
  }

  const daysOverdueExtra: DrillExtra<LearningRecord> = {
    columns: [{ key: 'daysOverdue', label: 'Days overdue', format: 'days' }],
    values: (l) => ({
      daysOverdue: !l.completedDate && l.dueDate && l.dueDate < asOf ? daysBetween(l.dueDate, asOf) : null,
    }),
  }

  const daysLateExtra: DrillExtra<LearningRecord> = {
    columns: [{ key: 'daysLate', label: 'Days late', format: 'days' }],
    values: (l) => ({
      daysLate:
        l.completedDate && l.dueDate && l.completedDate > l.dueDate
          ? daysBetween(l.dueDate, l.completedDate)
          : null,
    }),
  }

  const roleById = new Map(succ.roles.map((r) => [r.roleId, r]))
  const roleExtra: DrillExtra<SuccessionPlan> = {
    columns: [
      { key: 'businessUnit', label: 'Business unit' },
      { key: 'bestReadiness', label: 'Best successor' },
      { key: 'benchSize', label: 'Successors', format: 'int' },
      { key: 'benchReadyNow', label: 'Ready now', format: 'int' },
      { key: 'successorNames', label: 'Successors named' },
    ],
    values: (p) => {
      const r = roleById.get(p.roleId)
      return {
        businessUnit: r?.businessUnit ?? null,
        bestReadiness: r?.coverage ?? null,
        benchSize: r?.successors ?? null,
        benchReadyNow: r?.readyNow ?? null,
        successorNames: r?.successorNames || null,
      }
    },
  }

  /** One plan row per role (its first), so a role list counts roles, not successors. */
  const roleSpec = (list: readonly RoleRow[], title: string, subtitle: string, note?: string): TalentDrill =>
    when(list.length > 0, () =>
      drillSpec({
        kind: 'succession',
        title,
        subtitle,
        rows: list.flatMap((r) => sr.plans.get(r.roleId)?.slice(0, 1) ?? []),
        extra: roleExtra,
        hide: ROLE_HIDE,
        note,
      }),
    )

  const benchOf = (roles: readonly RoleRow[], readiness: Readiness | null): SuccessionPlan[] =>
    roles.flatMap((r) =>
      (sr.bench.get(r.roleId) ?? []).filter((p) => !readiness || p.readiness === readiness),
    )

  const SUCCESSORS_NOTE = 'One row per successor still employed; successors who have left are not counted.'

  /* ───────── performance ───────── */

  const highShareRecords = (dim: HighShareDim) =>
    dim === 'department' ? pr.byDepartment : dim === 'businessUnit' ? pr.byBusinessUnit : pr.byLevel

  const exitSub = perf.exitCycle
    ? join(
        `Rated in ${perf.exitCycle.cycle}, exits to ${formatDate(addMonths(perf.exitCycle.cycleDate, 12))}`,
        scope,
      )
    : scope

  /* ───────── learning ───────── */

  const onTimeRows = (list: readonly LearningRecord[], part: OnTimePart): LearningRecord[] =>
    part === 'due'
      ? [...list]
      : part === 'onTime'
        ? list.filter(isOnTime)
        : part === 'late'
          ? list.filter((l) => !!l.completedDate && !isOnTime(l))
          : list.filter((l) => !l.completedDate)
  const ON_TIME_TITLE: Record<OnTimePart, string> = {
    due: 'Required assignments due',
    onTime: 'Required training completed on time',
    late: 'Required training completed late',
    open: 'Required training not completed',
  }

  return {
    ratedActive: () =>
      when(pr.ratedActive.length > 0, () =>
        drillSpec({
          kind: 'reviews',
          title: `Active employees rated in ${cycleName}`,
          subtitle: asOfSub,
          rows: pr.ratedActive,
          note: `Rate = ${n(pr.ratedActive.length)} rated ÷ ${n(perf.activeCount)} employees active on ${asOfText}.`,
        }),
      ),

    highPerformers: () => {
      const rows = [...pr.byRating[3], ...pr.byRating[4]]
      return when(perf.highShare != null && rows.length > 0, () =>
        drillSpec({
          kind: 'reviews',
          title: `Rated 4 or 5 in ${cycleName}`,
          subtitle: cycleSub,
          rows,
          note: `Share = ${n(rows.length)} rated 4 or 5 ÷ ${n(perf.rated)} rated, including people who have left since.`,
        }),
      )
    },

    rating: (rating) => {
      const rows = pr.byRating[rating - 1] ?? []
      return when(perf.rated >= MIN_GROUP && rows.length > 0, () =>
        drillSpec({
          kind: 'reviews',
          title: `Rated ${ratingLabel(rating)} in ${cycleName}`,
          subtitle: cycleSub,
          rows,
          note: `Share = ${n(rows.length)} ÷ ${n(perf.rated)} rated.`,
        }),
      )
    },

    highShare: (dim, row, part, fold) => {
      const map = highShareRecords(dim)
      const groups = fold ?? [row]
      // A combined row opens only when every group in it can be opened, so the count holds.
      if (!groups.every((g) => map.has(g.group))) return null
      const list = groups.flatMap((g) => map.get(g.group) ?? [])
      const rows = part === 'high' ? list.filter(isHigh) : list
      const other = !!fold || !!row.other
      const where = groupName(
        dim,
        row.group,
        other,
        fold ? fold.reduce((s, g) => s + (g.groups ?? 1), 0) : row.groups,
      )
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'reviews',
          title: part === 'high' ? `Rated 4 or 5, ${where}` : `People rated, ${where}`,
          subtitle: cycleSub,
          rows,
          note:
            part === 'high'
              ? `Share = ${n(rows.length)} rated 4 or 5 ÷ ${n(list.length)} rated.`
              : other
                ? `Groups with fewer people are combined so no number covers fewer than ${MIN_GROUP}.`
                : undefined,
        }),
      )
    },

    unitHigh: (businessUnit) => {
      const list = pr.mix.get(businessUnit) ?? []
      const rows = list.filter(isHigh)
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'reviews',
          title: `Rated 4 or 5, ${businessUnit}`,
          subtitle: cycleSub,
          rows,
          note: `Share = ${n(rows.length)} rated 4 or 5 ÷ ${n(list.length)} rated.`,
        }),
      )
    },

    mix: (businessUnit, rating) => {
      const list = pr.mix.get(businessUnit)
      const rows = list ? (rating == null ? list : list.filter((r) => normRating(r.rating) === rating)) : []
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'reviews',
          title:
            rating == null
              ? `People rated, ${businessUnit}`
              : `Rated ${ratingLabel(rating)}, ${businessUnit}`,
          subtitle: cycleSub,
          rows,
          note: rating == null ? undefined : `Share = ${n(rows.length)} ÷ ${n(list!.length)} rated.`,
        }),
      )
    },

    calibration: (businessUnit, part) => {
      const list = pr.calibration.get(businessUnit) ?? []
      const moved = (r: Review) => (normRating(r.preCalibrationRating) ?? 0) - (normRating(r.rating) ?? 0)
      const rows =
        part === 'down'
          ? list.filter((r) => moved(r) > 0)
          : part === 'up'
            ? list.filter((r) => moved(r) < 0)
            : list
      const row = perf.calibration.find((c) => c.businessUnit === businessUnit)
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'reviews',
          title:
            part === 'all'
              ? `Calibrated ratings, ${businessUnit}`
              : `Ratings calibration moved ${part}, ${businessUnit}`,
          subtitle: cycleSub,
          rows,
          extra: calibrationExtra,
          note:
            part === 'all'
              ? `Average proposed ${fmt(row?.proposed ?? null, 'num2')}, average final ${fmt(row?.final ?? null, 'num2')}: calibration shift ${fmt(row?.shift ?? null, 'num2')}.`
              : `Share = ${n(rows.length)} moved ${part} ÷ ${n(list.length)} with a proposed and a final rating.`,
        }),
      )
    },

    cycleUnit: (cycle, businessUnit) => {
      const rows = pr.cycles.get(cycleKey(cycle, businessUnit)) ?? []
      const row = perf.cycles.find((c) => c.cycle === cycle && c.businessUnit === businessUnit)
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'reviews',
          title: `Ratings, ${businessUnit}, ${cycle}`,
          subtitle: join(cycle, scope),
          rows,
          note: `Average rating ${fmt(row?.mean ?? null, 'num2')} over ${plural(rows.length, 'person', 'people')}.`,
        }),
      )
    },

    exitCohort: (rating, part) => {
      const g = pr.exitCohort[rating - 1]
      const cycle = perf.exitCycle?.cycle ?? 'the exit cycle'
      if (!g) return null
      const label = ratingLabel(rating)
      if (part === 'rated') {
        return when(g.reviews.length > 0, () =>
          drillSpec({
            kind: 'reviews',
            title: `Rated ${label} in ${cycle}`,
            subtitle: exitSub,
            rows: g.reviews,
          }),
        )
      }
      const rows =
        part === 'Voluntary'
          ? g.voluntary
          : part === 'Involuntary'
            ? g.involuntary
            : [...g.voluntary, ...g.involuntary]
      const how = part === 'Voluntary' ? 'voluntarily ' : part === 'Involuntary' ? 'involuntarily ' : ''
      const ratings = new Map(g.reviews.map((r) => [r.employeeId, normRating(r.rating)]))
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'employees',
          title: `Left ${how}within 12 months, rated ${label} in ${cycle}`,
          subtitle: exitSub,
          rows,
          hide: SAME_HIDE,
          extra: {
            columns: [{ key: 'cycleRating', label: `Rating (${cycle})`, format: 'int' }],
            values: (e) => ({ cycleRating: ratings.get(e.employeeId) ?? null }),
          },
          note: `Rate = ${n(rows.length)} left ÷ ${n(g.reviews.length)} people rated ${label}.`,
        }),
      )
    },

    nineBox: (performance, potential, part) => {
      const cell = nb.cells.find((c) => c.performance === performance && c.potential === potential)
      const list = cell
        ? part === 'highRisk'
          ? cell.people.filter((p) => p.riskBand === 'High')
          : cell.people
        : []
      const byId = new Map<string, NineBoxPerson>(list.map((p) => [p.employeeId, p]))
      const cycle = nb.cycle?.cycle
      return when(!!cell && list.length > 0, () =>
        drillSpec({
          kind: 'employees',
          title: `${cap(cell!.label)}${part === 'highRisk' ? ', high flight risk' : ''}`,
          subtitle: join(cycle, `active as of ${asOfText}`, scope),
          rows: people(list.map((p) => p.employeeId)),
          hide: SAME_HIDE,
          extra: {
            columns: [
              { key: 'boxRating', label: cycle ? `Rating (${cycle})` : 'Rating', format: 'int' },
              { key: 'boxPotential', label: cycle ? `Potential (${cycle})` : 'Potential' },
              { key: 'riskBand', label: 'Flight-risk band' },
              { key: 'riskScore', label: 'Flight-risk score', format: 'int' },
            ],
            values: (e) => {
              const p = byId.get(e.employeeId)
              return {
                boxRating: p?.rating ?? null,
                boxPotential: p?.potential ?? null,
                riskBand: p?.riskBand ?? null,
                riskScore: p?.riskScore ?? null,
              }
            },
          },
          note:
            part === 'all' && cell!.share != null
              ? `${fmt(cell!.share, 'pct')} of ${plural(nb.placed, 'person', 'people')} placed in the 9-box.`
              : undefined,
        }),
      )
    },

    coverage: () => {
      const list = succ.roles.filter((r) => r.criticality === 'Critical' && r.readyNow > 0)
      return roleSpec(
        list,
        'Critical roles with a successor ready now',
        asOfSub,
        `Rate = ${n(succ.criticalCovered)} covered ÷ ${n(succ.critical)} critical roles. A successor who has left does not count.`,
      )
    },

    roles: (list, title, note) => roleSpec(list, title, asOfSub, note),

    coverageCell: (businessUnit, coverage) =>
      roleSpec(
        succ.roles.filter(
          (r) => r.businessUnit === businessUnit && (coverage == null || r.coverage === coverage),
        ),
        coverage
          ? `Roles ${COVERAGE_PHRASE[coverage]}, ${businessUnit}`
          : `Critical and key roles, ${businessUnit}`,
        asOfSub,
      ),

    roleBench: (roleId, readiness) => {
      const role = roleById.get(roleId)
      const rows = role ? benchOf([role], readiness) : []
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'succession',
          title: `${readiness ? `Successors ${readiness.toLowerCase()}` : 'Named successors'} for ${role!.roleTitle}`,
          subtitle: asOfSub,
          rows,
          note: SUCCESSORS_NOTE,
        }),
      )
    },

    bench: (benchScope, businessUnit, readiness, perRole) => {
      const roles = succ.roles.filter((r) => r.businessUnit === businessUnit && inBench(benchScope)(r))
      const rows = benchOf(roles, readiness)
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'succession',
          title: `${readiness ? `Successors ${readiness.toLowerCase()}` : 'Named successors'}, ${businessUnit}`,
          subtitle: join(BENCH_TITLE[benchScope], `as of ${asOfText}`, scope),
          rows,
          note: perRole
            ? `Successors per role = ${n(rows.length)} successors ÷ ${plural(roles.length, 'role')}. ${SUCCESSORS_NOTE}`
            : SUCCESSORS_NOTE,
        }),
      )
    },

    benchRoles: (benchScope, businessUnit, part) =>
      roleSpec(
        succ.roles.filter(
          (r) =>
            r.businessUnit === businessUnit &&
            inBench(benchScope)(r) &&
            (part === 'all' || r.successors === 0),
        ),
        part === 'none'
          ? `${BENCH_TITLE[benchScope]} with nobody named, ${businessUnit}`
          : `${BENCH_TITLE[benchScope]}, ${businessUnit}`,
        asOfSub,
      ),

    hipo: (dim, row, part) => {
      const potCycle = succ.potentialCycle?.cycle
      let list: Review[] | undefined
      if (dim && row) list = (dim === 'level' ? sr.hipoByLevel : sr.hipoByUnit).get(row.group)
      else if (succ.hipoShare != null) list = sr.assessed
      const rows = list ? (part === 'high' ? list.filter(isHipo) : list) : []
      const where = dim && row ? groupName(dim, row.group, !!row.other) : null
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'reviews',
          title:
            part === 'high'
              ? `High potentials${where ? `, ${where}` : potCycle ? ` in ${potCycle}` : ''}`
              : `Assessed for potential${where ? `, ${where}` : potCycle ? ` in ${potCycle}` : ''}`,
          subtitle: join(potCycle, `active as of ${asOfText}`, scope),
          rows,
          note:
            part === 'high'
              ? `Share = ${n(rows.length)} high potential ÷ ${n(list!.length)} assessed.`
              : undefined,
        }),
      )
    },

    band: (band, where) => {
      const company = where === 'company'
      const total = company ? risk.scores.size : ret.scored
      const row = ret.bands.find((b) => b.band === band)
      const count = company ? null : (row?.people ?? 0)
      const shown = company ? row?.companyShare != null : row?.share != null
      return when(total >= MIN_GROUP && shown && (count == null || count > 0), () => {
        const rows = company
          ? people([...risk.scores.values()].filter((s) => s.band === band).map((s) => s.employeeId))
          : ret.bandPeople[band]
        return drillSpec({
          kind: 'employees',
          title: `People in the ${band.toLowerCase()} flight-risk band`,
          subtitle: company ? join(`As of ${asOfText}`, 'Whole company') : asOfSub,
          rows,
          hide: SAME_HIDE,
          extra: riskExtra,
          note: `Share = ${n(rows.length)} ÷ ${plural(total, 'person', 'people')} scored${company ? ' company-wide' : ''}.`,
        })
      })
    },

    keyTalent: () =>
      when(ret.keyTalent.length > 0, () =>
        drillSpec({
          kind: 'employees',
          title: 'Key talent at risk',
          subtitle: asOfSub,
          rows: people(ret.keyTalent.map((k) => k.employeeId)),
          hide: SAME_HIDE,
          extra: riskExtra,
          note: `Rated 4 or 5 and in the high flight-risk band: ${n(ret.keyTalent.length)} of ${n(ret.highPerformers)} active people rated 4 or 5.`,
        }),
      ),

    driver: (key, part) => {
      const high = ret.bandPeople.High
      const rows = high.filter((e) => {
        const f = risk.scores.get(e.employeeId)?.factors ?? []
        return part === 'any' ? f.some((h) => h.key === key) : reasonsFor(f, common)[0]?.key === key
      })
      const label = factorDef.get(key)?.label ?? key
      return when(high.length >= MIN_GROUP && rows.length > 0, () =>
        drillSpec({
          kind: 'employees',
          title:
            part === 'any'
              ? `${label}: people in the high band`
              : `${label}: the main reason in the high band`,
          subtitle: asOfSub,
          rows,
          hide: SAME_HIDE,
          extra: {
            columns: [
              { key: 'factorPoints', label: 'Points from this factor', format: 'int' },
              { key: 'factorDetail', label: 'Detail' },
              ...riskExtra.columns.filter((c) => c.key !== 'riskBand'),
            ],
            values: (e) => {
              const hit = risk.scores.get(e.employeeId)?.factors.find((h) => h.key === key)
              return {
                factorPoints: hit?.points ?? null,
                factorDetail: hit?.reason ?? null,
                ...riskExtra.values(e),
              }
            },
          },
          note:
            part === 'any'
              ? `Share = ${n(rows.length)} ÷ ${plural(high.length, 'person', 'people')} in the high band.`
              : 'The main reason is the factor adding the most points among those most of the high band does not share.',
        }),
      )
    },

    backTest: (band, part) => {
      const bt = risk.backTest
      const row = bt.bands.find((b) => b.band === band)
      const count = part === 'scored' ? (row?.people ?? 0) : (row?.leavers ?? 0)
      return when(row?.rate != null && count > 0, () => {
        const inBand = [...bt.scored.values()].filter((s) => s.band === band)
        const ids = inBand.map((s) => s.employeeId).filter((id) => part === 'scored' || bt.leaverIds.has(id))
        return drillSpec({
          kind: 'employees',
          title:
            part === 'scored'
              ? `Scored in the ${band.toLowerCase()} band on ${formatDate(bt.scoredOn)}`
              : `Left after being scored in the ${band.toLowerCase()} band`,
          subtitle: join(`Scored ${formatDate(bt.scoredOn)}, exits ${bt.outcome.label}`, 'Whole company'),
          rows: people(ids),
          extra: {
            columns: [
              { key: 'scoreThen', label: 'Score a year earlier', format: 'int' },
              { key: 'bandThen', label: 'Band a year earlier' },
            ],
            values: (e) => {
              const s = bt.scored.get(e.employeeId)
              return { scoreThen: s?.score ?? null, bandThen: s?.band ?? null }
            },
          },
          note:
            part === 'left'
              ? `Rate = ${n(ids.length)} left ÷ ${n(inBand.length)} scored in the ${band.toLowerCase()} band${bt.exitKind === 'voluntary' ? ' (voluntary exits)' : ''}.`
              : part === 'shareOfLeavers'
                ? `Share = ${n(ids.length)} ÷ ${n(bt.leavers)} people who left, whatever their band.`
                : undefined,
        })
      })
    },

    regrettedHigh: (period) => {
      const r = ret.regrettedHigh
      const list = period === 'current' ? r.current : r.prior
      return when(r.available && list.length > 0, () =>
        drillSpec({
          kind: 'employees',
          title: 'Regretted exits of people rated 4 or 5',
          subtitle: join(period === 'current' ? ctx.window.label : ctx.prior.label, scope),
          rows: people(list.map((p) => p.employeeId)),
          hide: SAME_HIDE,
          extra: lastRatingExtra(new Map(list.map((p) => [p.employeeId, p.rating]))),
          note: 'Voluntary exits marked regrettable whose last rating before leaving was 4 or 5.',
        }),
      )
    },

    hipoExits: () => {
      const h = ret.hipoExits
      return when(h.available && h.people.length > 0, () =>
        drillSpec({
          kind: 'employees',
          title: 'High potentials rated 4 or 5 who resigned',
          subtitle: join(h.window.label, scope),
          rows: people(h.people.map((p) => p.employeeId)),
          hide: SAME_HIDE,
          extra: lastRatingExtra(new Map(h.people.map((p) => [p.employeeId, p.rating]))),
          note: 'Regretted voluntary exits whose latest potential on record was High.',
        }),
      )
    },

    promotionOverdue: () => {
      const rows = overdue.rows
      const byId = new Map(rows.map((r) => [r.employeeId, r]))
      const [c1, c2] = overdue.cycles
      return when(overdue.available && rows.length > 0, () =>
        drillSpec({
          kind: 'employees',
          title: 'High performers overdue for promotion',
          subtitle: asOfSub,
          rows: people(rows.map((r) => r.employeeId)),
          hide: SAME_HIDE,
          extra: {
            columns: [
              { key: 'lastPromotion', label: 'Last promotion', format: 'date' },
              { key: 'twoRatings', label: 'Last two annual ratings' },
              { key: 'riskBand', label: 'Flight-risk band' },
            ],
            values: (e) => {
              const r = byId.get(e.employeeId)
              return {
                lastPromotion: r?.lastPromotion ?? null,
                twoRatings: r?.ratings ?? null,
                riskBand: r?.riskBand ?? null,
              }
            },
          },
          note: `Rated 4 or 5 in ${c1?.cycle ?? 'both'} and ${c2?.cycle ?? 'annual cycles'}, at least 3 years here, no promotion in 36 months: ${n(rows.length)} of ${n(overdue.eligible)} eligible.`,
        }),
      )
    },

    onTime: (course, part) => {
      const list = course ? lr.due.filter((l) => l.course === course) : lr.due
      const rows = onTimeRows(list, part)
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'learning',
          title: `${ON_TIME_TITLE[part]}${course ? `, ${course}` : ''}`,
          subtitle: windowSub,
          rows,
          extra: part === 'late' ? daysLateExtra : part === 'open' ? daysOverdueExtra : undefined,
          note:
            part === 'onTime'
              ? `Rate = ${n(rows.length)} on time ÷ ${n(list.length)} due. Employees employed on the due date only.`
              : 'Required assignments due in the period, for employees employed on the due date.',
        }),
      )
    },

    completions: (month, kind) => {
      const rows = kind
        ? (lr.completions.get(completionKey(month, kind)) ?? [])
        : [
            ...(lr.completions.get(completionKey(month, 'Required')) ?? []),
            ...(lr.completions.get(completionKey(month, 'Optional')) ?? []),
          ]
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'learning',
          title: `${kind ? `${kind} courses` : 'Courses'} completed in ${formatMonth(month)}`,
          subtitle: scope,
          rows,
        }),
      )
    },

    overdueCell: (dim, cell, part) => {
      if (cell.overdue == null) return null
      const rows = lr.pastDue
        .filter(
          (p) => p.l.course === cell.course && p.e[dim] === cell.group && (part === 'pastDue' || p.overdue),
        )
        .map((p) => p.l)
      return when(rows.length > 0, () =>
        drillSpec({
          kind: 'learning',
          title: `${part === 'overdue' ? 'Overdue' : 'Past due'} on ${cell.course}, ${cell.group}`,
          subtitle: asOfSub,
          rows,
          extra: daysOverdueExtra,
          note:
            part === 'overdue'
              ? `Share = ${n(rows.length)} overdue ÷ ${n(cell.pastDue)} past due. Employees active today only.`
              : 'Required assignments past their due date, completed late or not yet completed.',
        }),
      )
    },

    overdueSegment: () => {
      const c = learning.concentration
      const t = c?.top
      return when(!!c && !!t && lr.segment.length > 0, () =>
        drillSpec({
          kind: 'learning',
          title: `Overdue on ${c!.course}, ${segmentName(t!.dim, t!.value)}`,
          subtitle: asOfSub,
          rows: lr.segment,
          extra: daysOverdueExtra,
          note: `${n(t!.affected)} of ${n(t!.population)} past-due assignments in ${segmentName(t!.dim, t!.value)} are not completed.`,
        }),
      )
    },

    hours: (businessUnit) => {
      const rows = lr.hours.get(businessUnit) ?? []
      const row = learning.hours.find((h) => h.businessUnit === businessUnit)
      return when(rows.length > 0 && row?.perEmployee != null, () =>
        drillSpec({
          kind: 'learning',
          title: `Learning hours, ${businessUnit}`,
          subtitle: windowSub,
          rows,
          extra: {
            columns: [{ key: 'courseHours', label: 'Hours', format: 'hours' }],
            values: (l) => ({ courseHours: l.hours ?? null }),
          },
          note: `Hours per employee = ${fmt(row!.hours, 'hours')} ÷ ${fmt(row!.avgHeadcount, 'num1')} average employees.`,
        }),
      )
    },
  }
}

/** For tests and callers that want the spec now: the drill's spec, or null. */
export const specOf = (d: TalentDrill): DrillSpec | null => (d ? d() : null)
