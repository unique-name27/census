/**
 * "Filter to this" on Onboarding (docs/FILTERS.md, part 4): the grouped drills set the filter that
 * reproduces their group, the invariant holds on a sample of them on every tab, a month of day-one
 * readiness sets its period, a region of the day-30 pulse is its sites, and no drill sets a filter
 * on anything the view does not scope by: tasks, owners, check-ins, the manager someone joined,
 * other survey groups, plan months and the weeks ahead set none.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { FILTER_DIMENSIONS } from '@/data/scope'
import { vocabularyOf } from '@/data/urlScope'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { canLeaveOut, filterInData } from '@/drill/filter'
import { applyDrillFilter, expectFilterTo, expectLeaveOut, rescopeContext } from '@/drill/testing'
import type { DrillFilter } from '@/drill/types'
import { formatMonth } from '@/lib/dates'
import { computeOnboarding } from '../engine'
import { candidatesDrill, planDrill, surveyDrill } from '../engine/drills'
import type { RateGroup } from '../engine/first90'
import { PULSE_DRIVER } from '../engine/first90'
import { PULSE, STARTERS, TASKS, union } from '../engine/lineage'
import type { CoverageRow } from '../engine/plan'
import { sampleContext } from '../engine/testkit'
import type { CalendarRow, DaysRow, RenegeRow } from '../engine/upcoming'
import {
  acceptToStartDrill,
  attritionDrills,
  calendarCellDrill,
  checkInDrills,
  coverageRowDrills,
  dayOneMonthDrills,
  dayOneSiteDrills,
  type MonthStarts,
  named,
  newHireSiteDrills,
  pulseRegionDrill,
  type QuarterRoleRow,
  quarterRoleDrill,
  renegeDrill,
} from './drill'

const filterOf = (src: DrillSource): DrillFilter | undefined => resolveDrill(src)?.filter
const model = (x: AnalyticsContext) => computeOnboarding(x)
const uses = union(STARTERS, TASKS)
const ready = (x: AnalyticsContext) => new Set(model(x).first90.dayOne.ready)
const months = (x: AnalyticsContext): (MonthStarts & { rate: number | null; n: number })[] =>
  model(x).first90.dayOne.byMonth.map((r) => ({ ...r, monthName: formatMonth(`${r.month}-01`) }))

/** The coming quarter's roles as the Hiring plan tab lists them: one row per unit and coverage. */
function quarterRows(x: AnalyticsContext): QuarterRoleRow[] {
  const p = model(x).plan
  if (!p) return []
  return p.quarter.units.flatMap((u) =>
    (['accepted', 'open', 'on-hold', 'cancelled', 'no-req'] as const).flatMap((c) => {
      const lines = u.lines.filter((v) => v.coverage === c)
      const starts = lines.reduce((n, v) => n + v.line.plannedHires, 0)
      return starts ? [{ businessUnit: u.businessUnit, coverage: c, starts, lines }] : []
    }),
  )
}

const covUses = { plan: uses, actual: uses, gap: uses }
const coverage = (x: AnalyticsContext, cut: 'unit' | 'department', r: CoverageRow) => {
  const p = model(x).plan!
  return coverageRowDrills(model(x).base, p, r, cut, covUses)
}

let ctx: AnalyticsContext
beforeAll(() => {
  ctx = sampleContext()
}, 60_000)

describe('Filter to on Onboarding', () => {
  it('Upcoming starts: a site’s notice period and reneges reproduce, and Leave out takes them away', () => {
    for (const value of ['days', 'offers'] as const)
      expectFilterTo(
        ctx,
        {
          name: `offer accepted to start by location (${value})`,
          rows: (x) => model(x).upcoming.acceptToStart.byLocation,
          key: (r: DaysRow) => r.location,
          value: (r) => r[value],
          drill: (r, x) => acceptToStartDrill(model(x).base)(r),
          kind: value === 'days' ? 'rate' : 'count',
        },
        { sample: 3 },
      )
    const offers = {
      name: 'accepted offers by location',
      rows: (x: AnalyticsContext) => model(x).upcoming.renege.byLocation,
      key: (r: RenegeRow) => r.location,
      value: (r: RenegeRow) => r.accepted.length,
      drill: (r: RenegeRow, x: AnalyticsContext) => renegeDrill(model(x).base, 'accepted')(r),
    }
    // From inside other filters too: the same site list, a leader's org, everyone but one.
    expectFilterTo(ctx, offers, { sample: 3, variants: true })
    expectLeaveOut(ctx, offers, { sample: 2, variants: true })
    expectFilterTo(
      ctx,
      {
        name: 'renege rate by location',
        rows: (x) => model(x).upcoming.renege.byLocation,
        key: (r) => r.location,
        value: (r) => r.rate,
        drill: (r, x) => renegeDrill(model(x).base, 'accepted')(r),
        kind: 'rate',
      },
      { sample: 3 },
    )
    // A site under the minimum shows its size only: its reneges open nothing.
    const b = model(ctx).base
    for (const r of model(ctx).upcoming.renege.byLocation.filter((x) => x.rate == null))
      expect(renegeDrill(b, 'reneged')(r)).toBeNull()
  })

  it('Upcoming starts: a calendar segment keeps its starts, and the unit keeps all of its own', () => {
    const cal = (x: AnalyticsContext) => model(x).upcoming.calendar
    expectFilterTo(
      ctx,
      {
        name: 'start calendar segments',
        rows: cal,
        key: (r: CalendarRow) => `${r.week} ${r.businessUnit}`,
        value: (r) => r.starts,
        drill: (r, x) => calendarCellDrill(model(x).base)(r),
        // A segment is one week of the unit; the other weeks stay beside it.
        kind: 'rate',
      },
      { sample: 4 },
    )
    const first = cal(ctx).find((r) => named(r.businessUnit))
    expect(first).toBeDefined()
    if (first) {
      const filter = filterOf(calendarCellDrill(model(ctx).base)(first)) as DrillFilter
      expect(filter).toEqual({ businessUnit: [first.businessUnit], modes: {} })
      const unit = (rows: readonly CalendarRow[]) =>
        rows.filter((r) => r.businessUnit === first.businessUnit).reduce((n, r) => n + r.starts, 0)
      const after = cal(applyDrillFilter(ctx, filter))
      expect(after.reduce((n, r) => n + r.starts, 0)).toBe(unit(cal(ctx)))
    }
  })

  it('First 90 days: a site’s readiness and a department’s check-ins and early attrition reproduce', () => {
    for (const value of ['rate', 'n'] as const)
      expectFilterTo(
        ctx,
        {
          name: `day-one readiness by site (${value})`,
          rows: (x) => model(x).first90.dayOne.bySite,
          key: (g) => g.group,
          value: (g) => g[value],
          drill: (g, x) => dayOneSiteDrills(model(x).base, ready(x), uses).starts(g),
          kind: value === 'rate' ? 'rate' : 'count',
        },
        { sample: 3 },
      )
    for (const value of ['rate', 'n'] as const)
      expectFilterTo(
        ctx,
        {
          name: `check-ins on time by department (${value})`,
          rows: (x) => model(x).first90.checkIns.byDepartment,
          key: (g) => g.group,
          value: (g) => g[value],
          drill: (g, x) => checkInDrills(model(x).base, uses, 'department').due(g),
          kind: value === 'rate' ? 'rate' : 'count',
        },
        { sample: 3 },
      )
    for (const value of ['rate', 'n'] as const)
      expectFilterTo(
        ctx,
        {
          name: `early attrition by department (${value})`,
          rows: (x) => model(x).first90.attrition.byDepartment,
          key: (g) => g.group,
          value: (g) => g[value],
          drill: (g, x) =>
            attritionDrills(model(x).base, model(x).first90.attrition.leavers, uses, 'department').starts(g),
          kind: value === 'rate' ? 'rate' : 'count',
        },
        { sample: 3 },
      )
    for (const value of ['rate', 'n'] as const)
      expectFilterTo(
        ctx,
        {
          name: `new hires entered by day -3 by site (${value})`,
          rows: (x) => model(x).first90.newHire.bySite,
          key: (g) => g.group,
          value: (g) => g[value],
          drill: (g, x) => newHireSiteDrills(model(x).base).due(g),
          kind: value === 'rate' ? 'rate' : 'count',
        },
        { sample: 3 },
      )
    // The same filter on every number of the row.
    const m = model(ctx)
    const site = m.first90.dayOne.bySite.find((g) => g.rate != null && !g.folded && named(g.group))
    expect(site).toBeDefined()
    if (site) {
      const d = dayOneSiteDrills(m.base, ready(ctx), uses)
      expect(filterOf(d.notReady(site))).toEqual({ location: [site.group], modes: {} })
      expect(filterOf(d.starts(site))).toEqual(filterOf(d.notReady(site)))
    }
  })

  it('First 90 days: a month of day-one readiness becomes the period, and the tile shows its rate', () => {
    expectFilterTo(
      ctx,
      {
        name: 'day-one readiness by month',
        rows: months,
        key: (r) => r.month,
        value: (r) => r.rate,
        drill: (r, x) => dayOneMonthDrills(model(x).base, ready(x), uses).notReady(r),
        kind: 'rate',
      },
      { sample: 4 },
    )
    for (const r of months(ctx)
      .filter((x) => x.rate != null)
      .slice(-2)) {
      const filter = filterOf(dayOneMonthDrills(model(ctx).base, ready(ctx), uses).starts(r)) as DrillFilter
      expect(filter).toMatchObject({ period: 'custom', customStart: `${r.month}-01` })
      expect(canLeaveOut(filter)).toBe(false)
      const tile = model(applyDrillFilter(ctx, filter)).kpis.first90.find((k) => k.id === 'day-one')
      expect(tile?.value, r.month).toBeCloseTo(r.rate as number, 12)
    }
  })

  it('Hiring plan: a unit’s or a department’s coverage keeps its numbers, and a quarter segment its starts', () => {
    const p = model(ctx).plan
    expect(p).not.toBeNull()
    for (const cut of ['unit', 'department'] as const)
      for (const value of ['planYtd', 'actualYtd', 'planFull', 'committed'] as const)
        expectFilterTo(
          ctx,
          {
            name: `plan coverage by ${cut} (${value})`,
            rows: (x) => (cut === 'unit' ? model(x).plan!.byUnit : model(x).plan!.byDepartment),
            key: (r) => `${r.businessUnit} ${r.department ?? ''}`,
            value: (r) => r[value],
            drill: (r, x) => coverage(x, cut, r).planFull,
          },
          { sample: 3 },
        )
    const unit = {
      name: 'actual starts to date by business unit',
      rows: (x: AnalyticsContext) => model(x).plan!.byUnit,
      key: (r: CoverageRow) => r.businessUnit,
      value: (r: CoverageRow) => r.actualYtd,
      drill: (r: CoverageRow, x: AnalyticsContext) => coverage(x, 'unit', r).actualYtd,
    }
    expectLeaveOut(ctx, unit, { sample: 2 })
    // A department row names the department alone when no other unit has one of that name.
    const dept = p?.byDepartment.find((r) => named(r.department) && r.planFull)
    if (dept)
      expect(filterOf(coverage(ctx, 'department', dept).planFull)).toEqual({
        department: [dept.department],
        modes: {},
      })
    expectFilterTo(
      ctx,
      {
        name: 'coming quarter roles by unit and coverage',
        rows: quarterRows,
        key: (r) => `${r.businessUnit} ${r.coverage}`,
        value: (r) => r.starts,
        drill: (r, x) => quarterRoleDrill(model(x).base, 'Q4 2026', uses)(r),
        kind: 'rate',
      },
      { sample: 3 },
    )
  })

  it('Readout: a site’s reneges, a department’s check-ins and a unit’s plan reproduce under Filter to', () => {
    // A narrower period makes more of the plan and check-in stories fire; check both scopes.
    const checked = new Set<string>()
    for (const base of [ctx, rescopeContext(ctx, { ...ctx.filters, period: 'ytd' })]) {
      const m = model(base)
      for (const f of m.findings) {
        const filter = filterOf(f.drill)
        if (!filter) continue
        checked.add(f.id)
        const after = model(applyDrillFilter(base, filter))
        if (f.id === 'onboarding-renege-location') {
          const site = m.upcoming.renege.byLocation.find((r) => r.location === filter.location?.[0])
          expect(after.upcoming.renege.reneged.length).toBe(site?.reneged.length)
          expect(after.upcoming.renege.rate).toBeCloseTo(site?.rate as number, 12)
        } else if (f.id === 'onboarding-check-ins') {
          const g = m.first90.checkIns.byDepartment.find((r) => r.group === filter.department?.[0])
          expect(after.first90.checkIns.rate).toBeCloseTo(g?.rate as number, 12)
        } else if (f.id.startsWith('onboarding-plan-behind-')) {
          const u = m.plan?.quarter.units.find((r) => r.businessUnit === filter.businessUnit?.[0])
          expect(after.plan?.quarter.units.reduce((n, r) => n + r.uncovered, 0)).toBe(u?.uncovered)
        } else if (f.id.startsWith('onboarding-plan-ytd-')) {
          const u = m.plan?.byUnit.find((r) => r.businessUnit === filter.businessUnit?.[0])
          expect(after.plan?.actual.length).toBe(u?.actualYtd)
        } else if (f.id.startsWith('onboarding-late-')) {
          // The segment's late tasks: a region is its sites, named as the region.
          const spec = resolveDrill(f.drill)
          const task = spec?.title.split(', late, ')[0]
          const lateAfter = after.first90.readinessTasks.filter(
            (x) => x.task.name === task && x.task.state !== 'Not needed' && x.late,
          )
          expect(lateAfter.length, f.id).toBe(spec?.rows.length)
          // Focus on names the same group as the records.
          expect(f.filter?.location ?? f.filter?.department).toEqual(filter.location ?? filter.department)
          if (f.filterLabel) expect(spec?.filterLabel).toBe(f.filterLabel)
        } else throw new Error(`${f.id} sets a filter the test does not check`)
      }
    }
    // Each kind of grouped finding fires on the sample in one of the two scopes.
    for (const kind of [
      'onboarding-check-ins',
      'onboarding-late-',
      'onboarding-plan-behind-',
      'onboarding-plan-ytd-',
      'onboarding-renege-',
    ])
      expect(
        [...checked].some((id) => id.startsWith(kind)),
        kind,
      ).toBe(true)
  })

  it('First 90 days: a region of the day-30 pulse is its sites and keeps its respondents and mean', () => {
    const pulse = (x: AnalyticsContext) => {
      const p = model(x).first90.pulse
      return (p.byRegion?.groups ?? []).map((g) => ({
        region: g.group,
        respondents: g.respondents,
        mean: g.mean,
      }))
    }
    const regionDrill = (x: AnalyticsContext) =>
      pulseRegionDrill(model(x).base, x.all.employees, model(x).first90.pulse, {
        title: 'Day-30 pulse',
        driver: PULSE_DRIVER,
        uses: PULSE,
      })
    for (const value of ['respondents', 'mean'] as const)
      expectFilterTo(
        ctx,
        {
          name: `day-30 pulse by region (${value})`,
          rows: pulse,
          key: (r) => r.region,
          value: (r) => r[value],
          drill: (r, x) => regionDrill(x)(r),
          kind: 'rate',
        },
        { sample: 3 },
      )
    const shown = pulse(ctx).filter((r) => r.mean != null)
    expect(shown.length).toBeGreaterThan(1)
    for (const r of shown) {
      const spec = resolveDrill(regionDrill(ctx)(r))
      expect(spec?.filterLabel).toBe(r.region)
      expect(spec?.filter?.location?.length).toBeGreaterThan(0)
    }
    // A folded or hidden region opens every region's groups, without a filter.
    expect(resolveDrill(regionDrill(ctx)({ region: 'Other (2)' }))?.filter).toBeUndefined()
  })

  it('sets filters only on the org filters and a month’s period, for values in the loaded data', () => {
    const allowed = new Set<string>([...FILTER_DIMENSIONS, 'modes', 'period', 'customStart', 'customEnd'])
    const m = model(ctx)
    const b = m.base
    const f = m.first90
    const r = ready(ctx)
    const site = dayOneSiteDrills(b, r, uses)
    const month = dayOneMonthDrills(b, r, uses)
    const nh = newHireSiteDrills(b)
    const ciDept = checkInDrills(b, uses, 'department')
    const attrDept = attritionDrills(b, f.attrition.leavers, uses, 'department')
    const p = m.plan!
    const org: DrillSource[] = [
      ...m.upcoming.acceptToStart.byLocation.map(acceptToStartDrill(b)),
      ...m.upcoming.renege.byLocation.flatMap((x) => [
        renegeDrill(b, 'accepted')(x),
        renegeDrill(b, 'reneged')(x),
      ]),
      ...m.upcoming.calendar.map(calendarCellDrill(b)),
      ...f.dayOne.bySite.flatMap((g) => [site.starts(g), site.ready(g), site.notReady(g)]),
      ...f.newHire.bySite.flatMap((g) => [nh.due(g), nh.onTime(g), nh.bar(g)]),
      ...f.checkIns.byDepartment.flatMap((g) => [
        ciDept.due(g),
        ciDept.onTime(g),
        ciDept.late(g),
        ciDept.bar(g),
      ]),
      ...f.attrition.byDepartment.flatMap((g) => [attrDept.starts(g), attrDept.left(g)]),
      ...p.byUnit.flatMap((x) => Object.values(coverage(ctx, 'unit', x))),
      ...p.byDepartment.flatMap((x) => Object.values(coverage(ctx, 'department', x))),
      ...quarterRows(ctx).map(quarterRoleDrill(b, p.quarter.label, uses)),
      ...m.findings.map((x) => x.drill),
      ...[...m.kpis.upcoming, ...m.kpis.first90, ...m.kpis.plan].map((k) => k.noteDrill),
    ]
    const vocab = vocabularyOf(ctx)
    let set = 0
    for (const src of org) {
      const filter = filterOf(src)
      if (!filter) continue
      set++
      for (const k of Object.keys(filter)) expect(allowed.has(k), k).toBe(true)
      expect(filter.period, JSON.stringify(filter)).toBeUndefined()
      expect(filter.leaderId).toBeUndefined()
      expect(filterInData(filter, vocab), JSON.stringify(filter)).toBe(true)
    }
    expect(set).toBeGreaterThan(30)
    // Months set only their period.
    for (const x of months(ctx).filter((y) => y.n)) {
      const filter = filterOf(month.starts(x)) as DrillFilter
      expect(Object.keys(filter).sort()).toEqual(['customEnd', 'customStart', 'modes', 'period'])
    }
    // Numbers that are not a group of a filter: none.
    const none: DrillSource[] = [
      ...[...m.kpis.upcoming, ...m.kpis.first90, ...m.kpis.plan].flatMap((k) => [k.drill, k.deltaDrill]),
      ...f.checkIns.byCheckIn.flatMap((g) => Object.values(checkInDrills(b, uses, null)).map((d) => d(g))),
      ...f.attrition.byManager.flatMap((g) =>
        Object.values(attritionDrills(b, f.attrition.leavers, uses, null)).map((d) => d(g)),
      ),
      ...m.upcoming.byTask.map((t) => () => planDrill(b, [], t.task)),
      () =>
        surveyDrill(b, 'Onboarding pulse day 30', f.pulse.byRegion, f.pulse.overall, 'Pulse', {
          groupBy: 'Region',
        }),
      () => candidatesDrill(b, m.upcoming.renege.tracked.accepted, 'Tracked country'),
    ]
    for (const src of none) expect(filterOf(src)).toBeUndefined()
    // The "Unknown" bucket and a folded "Other (k)" are no group.
    const starts = f.dayOne.judged.slice(0, 9)
    const unknown: RateGroup<(typeof starts)[number]> = {
      group: 'Unknown',
      n: 9,
      met: 5,
      rate: 5 / 9,
      rows: starts,
    }
    expect(resolveDrill(site.notReady(unknown))?.rows.length).toBeGreaterThan(0)
    expect(filterOf(site.notReady(unknown))).toBeUndefined()
    const cohort = f.attrition.cohort.slice(0, 9)
    const other: RateGroup<(typeof cohort)[number]> = {
      group: 'Other (3)',
      n: 9,
      met: 1,
      rate: 1 / 9,
      rows: cohort,
      folded: 3,
    }
    expect(resolveDrill(attrDept.starts(other))?.rows.length).toBe(9)
    expect(filterOf(attrDept.starts(other))).toBeUndefined()
  })
})
