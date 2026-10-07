/**
 * The drills of the Onboarding figures whose marks are groups of a filterable dimension
 * (docs/FILTERS.md, part 4), shared by each figure's marks and its table's cells. A site, a
 * department or a business unit carries the filter that reproduces it, so the records panel
 * offers "Filter to" and "Leave out"; a month of day-one readiness sets that month as the period.
 * Starts follow their employee record (or the accepted offer's req), plan lines their own fields,
 * so the groups below are keyed the way the filters are.
 *
 * A region of the day-30 pulse is the set of its sites, named as the region ("Filter to Asia
 * Pacific"), as HR ops and Listening do.
 *
 * Left without a filter: the "Unknown" bucket and folded "Other (k)" rows, tasks, owners and
 * check-ins, the manager someone joined (a leader filter is a whole org, not one manager's
 * starts), survey groups other than regions, single people and records, and the plan's months and
 * the start calendar's weeks (the plan year and the weeks ahead don't follow the period).
 */
import { byGroup } from '@/charts/kit/groupDrill'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Employee } from '@/data/schema'
import type { FilterDimension } from '@/data/scope'
import type { DrillSource } from '@/drill/Drill'
import type { DrillFilter, DrillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { breakdown, respondentIndex, respondentKey } from '@/lib/surveys'
import type { OnboardingBase } from '../engine/base'
import {
  candidatesDrill,
  coverageDrills,
  employeesDrill,
  groupScope,
  lateTasksDrill,
  monthPeriod,
  monthSub,
  planDrill,
  planMonthDrill,
  planMonthLinesDrill,
  readinessDrill,
  reqsDrill,
  startEmployees,
  startsDrill,
  surveyDrill,
  tasksDrill,
  transactionsDrill,
  withScope,
} from '../engine/drills'
import {
  type CheckInItem,
  type LateCell,
  type NewHireTx,
  PULSE_SURVEY,
  type PulseFacts,
  type RateGroup,
} from '../engine/first90'
import { ACCEPT_TO_START, FORECAST, NEW_HIRE_TX, OPEN_REQS, RENEGE, UPCOMING } from '../engine/lineage'
import type { CoverageRow, PlanLineView, PlanModel, UnitCut, UnitMonthCell } from '../engine/plan'
import { regionOf, regionSites, type Start } from '../engine/starts'
import type { CalendarRow, DaysRow, RenegeRow } from '../engine/upcoming'

type Uses = readonly FieldRef[]
type Build<T> = (d: T) => DrillSource

/** A group the filters can name: not the "Unknown" bucket for a missing value. */
export const named = (v: string | null | undefined): string | null => (v && v !== 'Unknown' ? v : null)

/** Say a figure's dimension once: each mark's records carry its group's filter. */
const inGroup =
  <T>(dim: FilterDimension, group: (d: T) => string | null | undefined) =>
  (build: Build<T>): Build<T> =>
    byGroup(dim, (d: T) => named(group(d)), build)

/** No dimension: the marks open their records without a filter. */
const noGroup = <T>(build: Build<T>): Build<T> => build

/** A thunk that adds a filter to whatever spec it builds. */
const scoped =
  <S extends DrillSpec>(src: (() => S | null) | null, filter: DrillFilter | undefined) =>
  (): S | null =>
    withScope(src ? src() : null, filter)

/* ───────────── upcoming starts ───────────── */

type CalendarCell = Pick<CalendarRow, 'week' | 'businessUnit' | 'starts' | 'people'>

/** A segment of the start calendar: one business unit's starts in one week. */
export const calendarCellDrill = (b: OnboardingBase): Build<CalendarCell> =>
  inGroup(
    'businessUnit',
    (r: CalendarCell) => r.businessUnit,
  )((r) =>
    r.starts
      ? () =>
          startsDrill(b, r.people, `Starts in the week of ${formatDate(r.week)}, ${r.businessUnit}`, {
            uses: UPCOMING,
          })
      : null,
  )

/** Offer accepted to start by location: the site's accepted offers. */
export const acceptToStartDrill = (b: OnboardingBase): Build<DaysRow> =>
  inGroup(
    'location',
    (r: DaysRow) => r.location,
  )((r) =>
    r.offers
      ? () => candidatesDrill(b, r.records, `Offers accepted, ${r.location}`, { uses: ACCEPT_TO_START })
      : null,
  )

/**
 * Reneges by location: the site's accepted offers, or its reneges. Under the anonymity minimum a
 * site shows its size only, so its reneges open nothing.
 */
export const renegeDrill = (b: OnboardingBase, which: 'accepted' | 'reneged'): Build<RenegeRow> =>
  inGroup(
    'location',
    (x: RenegeRow) => x.location,
  )((x) => {
    if (which === 'accepted')
      return x.accepted.length
        ? () => candidatesDrill(b, x.accepted, `Offers accepted, ${x.location}`, { uses: RENEGE })
        : null
    return x.rate != null && x.reneged.length
      ? () => candidatesDrill(b, x.reneged, `Reneges, ${x.location}`, { uses: RENEGE })
      : null
  })

/* ───────────── first 90 days ───────────── */

export interface MonthStarts {
  month: string
  monthName: string
  rows: readonly Start[]
}

/**
 * Day-one readiness by month: the month's starts, those ready, and (a point on the line) those
 * not ready, or on a 100% month those who were. Each sets the month as the period.
 */
export function dayOneMonthDrills(b: OnboardingBase, ready: ReadonlySet<Start>, uses: Uses) {
  const period = (r: MonthStarts) => monthPeriod(r.month, b.window)
  const o = (r: MonthStarts) => ({ subtitle: monthSub(b, r.month), uses })
  const isReady = (p: Start) => ready.has(p)
  return {
    starts: (r: MonthStarts): DrillSource =>
      r.rows.length
        ? scoped(() => employeesDrill(b, startEmployees(r.rows), `Starts in ${r.monthName}`, o(r)), period(r))
        : null,
    ready: (r: MonthStarts): DrillSource =>
      r.rows.some(isReady)
        ? scoped(
            () =>
              employeesDrill(
                b,
                startEmployees(r.rows.filter(isReady)),
                `Ready on day one, ${r.monthName}`,
                o(r),
              ),
            period(r),
          )
        : null,
    notReady: (r: MonthStarts): DrillSource =>
      r.rows.length ? scoped(() => readinessDrill(b, r.rows, ready, r.monthName, o(r)), period(r)) : null,
  }
}

/** Day-one readiness by site: the site's starts, those ready, and (a bar) those not ready. */
export function dayOneSiteDrills(b: OnboardingBase, ready: ReadonlySet<Start>, uses: Uses) {
  const g = inGroup('location', (x: RateGroup<Start>) => x.group)
  return {
    starts: g((x) =>
      x.n ? () => employeesDrill(b, startEmployees(x.rows), `Starts, ${x.group}`, { uses }) : null,
    ),
    ready: g((x) =>
      x.met
        ? () =>
            employeesDrill(
              b,
              startEmployees(x.rows.filter((p) => ready.has(p))),
              `Ready on day one, ${x.group}`,
              {
                uses,
              },
            )
        : null,
    ),
    notReady: g((x) => (x.rate == null ? null : () => readinessDrill(b, x.rows, ready, x.group, { uses }))),
  }
}

/** New hires entered by day -3, by site: due, on time, and (a bar) the late ones. */
export function newHireSiteDrills(b: OnboardingBase) {
  const g = inGroup('location', (x: RateGroup<NewHireTx>) => x.group)
  const txs = (rows: readonly NewHireTx[]) => rows.map((x) => x.tx)
  const o = { uses: NEW_HIRE_TX }
  return {
    due: g((x) =>
      x.n ? () => transactionsDrill(b, txs(x.rows), `New hire transactions, ${x.group}`, o) : null,
    ),
    onTime: g((x) =>
      x.met
        ? () =>
            transactionsDrill(
              b,
              txs(x.rows.filter((t) => t.onTime)),
              `New hires entered by day -3, ${x.group}`,
              o,
            )
        : null,
    ),
    // The late ones; on a 100% bar, the ones entered on time.
    bar: g((x) => {
      if (x.rate == null) return null
      const late = x.rows.filter((t) => !t.onTime)
      return late.length
        ? () => transactionsDrill(b, txs(late), `New hires entered late, ${x.group}`, o)
        : () => transactionsDrill(b, txs(x.rows), `New hires entered by day -3, ${x.group}`, o)
    }),
  }
}

/**
 * Check-ins on time, by check-in or by department (`dim`): due, on time, late or missed, and (a
 * bar) the late or missed ones, or on a 100% bar the ones held on time.
 */
export function checkInDrills(b: OnboardingBase, uses: Uses, dim: 'department' | null) {
  const g = dim ? inGroup(dim, (x: RateGroup<CheckInItem>) => x.group) : noGroup<RateGroup<CheckInItem>>
  const open = (x: RateGroup<CheckInItem>, title: string, only?: 'late' | 'onTime') => () =>
    tasksDrill(
      b,
      x.rows.filter((r) => !only || (only === 'late' ? !r.onTime : r.onTime)).map((r) => r.task),
      title,
      { uses },
    )
  return {
    due: g((x) => (x.n ? open(x, `Check-ins due, ${x.group}`) : null)),
    onTime: g((x) => (x.met ? open(x, `Check-ins on time, ${x.group}`, 'onTime') : null)),
    late: g((x) =>
      x.met != null && x.n - x.met ? open(x, `Check-ins late or missed, ${x.group}`, 'late') : null,
    ),
    bar: g((x) =>
      x.rate == null
        ? null
        : x.met === x.n
          ? open(x, `Check-ins on time, ${x.group}`, 'onTime')
          : open(x, `Check-ins late or missed, ${x.group}`, 'late'),
    ),
  }
}

/**
 * Early voluntary attrition by department (`dim`) or by the manager someone joined (no filter):
 * the group's starts and those who resigned early. Hidden groups open nothing.
 */
export function attritionDrills(
  b: OnboardingBase,
  leavers: readonly Employee[],
  uses: Uses,
  dim: 'department' | null,
) {
  const g = dim ? inGroup(dim, (x: RateGroup<Employee>) => x.group) : noGroup<RateGroup<Employee>>
  const left = new Set(leavers)
  return {
    starts: g((x) =>
      x.rate == null ? null : () => employeesDrill(b, x.rows, `Starts, ${x.group}`, { uses }),
    ),
    left: g((x) =>
      x.rate == null || !x.met
        ? null
        : () =>
            employeesDrill(
              b,
              x.rows.filter((e) => left.has(e)),
              `Resigned early, ${x.group}`,
              { uses },
            ),
    ),
  }
}

/* ───────────── hiring plan ───────────── */

/**
 * The filter of a plan coverage row: its business unit, or its department (with the business unit
 * when another unit has a department of the same name). None for an "Unknown" unit or department.
 */
export function coverageScope(p: PlanModel, r: CoverageRow): DrillFilter | undefined {
  if (r.department == null) return groupScope('businessUnit', r.businessUnit)
  if (!named(r.businessUnit) || !named(r.department)) return undefined
  const shared = p.byDepartment.filter((x) => x.department === r.department).length > 1
  return shared
    ? { businessUnit: [r.businessUnit], department: [r.department] }
    : groupScope('department', r.department)
}

/** Every drill of one plan coverage row, each with the row's filter. */
export function coverageRowDrills(
  b: OnboardingBase,
  p: PlanModel,
  r: CoverageRow,
  where: string,
  uses: { plan: Uses; actual: Uses; gap: Uses },
) {
  const f = coverageScope(p, r)
  const d = coverageDrills(b, p, r, where, uses)
  const s = <S extends DrillSpec>(src: (() => S | null) | null) => (src ? scoped(src, f) : null)
  return {
    planYtd: s(d.planYtd),
    actualYtd: s(d.actualYtd),
    planFull: s(d.planFull),
    gap: s(d.gap),
    committed: r.committed
      ? s(() => startsDrill(b, r.committedStarts, `Committed starts, ${where}`, { uses: UPCOMING }))
      : null,
    openReqs: r.openReqs ? s(() => reqsDrill(b, r.reqs, `Open reqs, ${where}`, { uses: OPEN_REQS })) : null,
    forecast: r.forecastReqs.length
      ? s(() =>
          reqsDrill(
            b,
            r.forecastReqs.map((x) => x.req),
            `Open reqs behind the forecast, ${where}`,
            { uses: FORECAST },
          ),
        )
      : null,
  }
}

export interface QuarterRoleRow {
  businessUnit: string
  /** What stands behind the roles: "Accepted offer", "Open req", "No req" … */
  coverage: string
  starts: number
  lines: PlanLineView[]
}

/** A segment of the coming quarter's roles: one business unit's planned starts with one coverage. */
export const quarterRoleDrill = (b: OnboardingBase, quarter: string, uses: Uses): Build<QuarterRoleRow> =>
  inGroup(
    'businessUnit',
    (r: QuarterRoleRow) => r.businessUnit,
  )(
    (r) => () =>
      planDrill(b, r.lines, `${quarter} roles, ${r.businessUnit}: ${r.coverage.toLowerCase()}`, { uses }),
  )

/* ───────────── day-30 pulse ───────────── */

/**
 * The day-30 pulse by region: a shown region opens its answers by location, filtered to its sites
 * and named as the region ("Filter to Asia Pacific"); a hidden or folded one opens every region's
 * groups, without a filter. Answers follow the respondent's employee record, as the figure groups
 * them, so "Filter to" keeps the region's respondents and mean.
 */
export function pulseRegionDrill(
  b: OnboardingBase,
  employees: readonly Employee[],
  pulse: Pick<PulseFacts, 'answers' | 'byRegion' | 'overall' | 'item'>,
  o: { title: string; driver: string; uses: Uses },
): Build<{ region: string }> {
  const meta = { item: pulse.item, driver: o.driver, uses: o.uses }
  const whole = () =>
    surveyDrill(b, PULSE_SURVEY, pulse.byRegion, pulse.overall, `${o.title}, by region`, {
      groupBy: 'Region',
      ...meta,
    })
  const shown = new Map(
    (pulse.byRegion?.groups ?? []).filter((g) => !g.suppressed).map((g) => [g.group, g] as const),
  )
  const who = respondentIndex({ employees })
  return byGroup(
    'location',
    (r: { region: string }) => (shown.has(r.region) ? regionSites(employees, r.region) : null),
    (r: { region: string }) => {
      const g = shown.get(r.region)
      if (!g) return whole
      return () => {
        const answers = pulse.answers.filter(
          (x) => regionOf(who(x.respondentKey).employee?.location) === r.region,
        )
        const bySite = breakdown(
          answers,
          respondentKey(who, (j) => j.employee?.location),
          { min: b.settings.surveyMin },
        )
        return surveyDrill(b, PULSE_SURVEY, bySite, g, `${o.title} in ${r.region}, by location`, {
          groupBy: 'Location',
          ...meta,
        })
      }
    },
    (r) => r.region,
  )
}

/* ───────────── new figures ───────────── */

/**
 * Late day-one tasks by task and region (or site): a cell's late tasks, with the region's sites as
 * the filter named as the region ("Filter to Asia Pacific"), or the site itself. Hidden cells and
 * the "Unknown" place open nothing or carry no filter.
 */
export function lateCellDrill(
  b: OnboardingBase,
  employees: readonly Employee[],
  by: 'region' | 'site',
  uses: Uses,
): Build<LateCell> {
  return byGroup(
    'location',
    (c: LateCell) =>
      by === 'region' ? (named(c.place) ? regionSites(employees, c.place) : null) : named(c.place),
    (c) => (c.items.length ? () => lateTasksDrill(b, c, { uses }) : null),
    (c) => (by === 'region' ? c.place : null),
  )
}

/**
 * Starts against plan by unit and month: the people who started in the cell's unit that month
 * (or, when nobody started, its plan lines), with the unit as the filter. No period: the plan year
 * does not follow the period picker.
 */
export const planMonthCellDrill = (
  b: OnboardingBase,
  p: PlanModel,
  cut: UnitCut,
  uses: { actual: Uses; plan: Uses },
): Build<UnitMonthCell> =>
  inGroup(
    cut,
    (c: UnitMonthCell) => c.unit,
  )((c) =>
    c.actual
      ? () => planMonthDrill(b, c, { uses: uses.actual })
      : c.planned
        ? () => planMonthLinesDrill(b, p, c, { uses: uses.plan })
        : null,
  )
