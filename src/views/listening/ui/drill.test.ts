/**
 * "Filter to this" on Listening (docs/FILTERS.md, part 4): grouped survey results of a filterable
 * group reproduce their number after "Filter to", "Leave out" removes the group, only groups at
 * the survey minimum set a filter, and nothing sets a leader (never from a manager cut).
 */
import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { SurveyType } from '@/data/schema'
import { vocabularyOf } from '@/data/urlScope'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { filterDimensions, filterInData } from '@/drill/filter'
import { applyDrillFilter, expectFilterTo, expectLeaveOut } from '@/drill/testing'
import type { DrillFilter } from '@/drill/types'
import { compute, type ListeningModel } from '../engine'
import { listeningActions } from '../engine/actions'
import {
  type ExitLocation,
  type GroupScore,
  type RegionReadiness,
  type StageCell,
  type StayGroup,
  scoresOf,
} from '../engine/cuts'
import { cutsFor, type HeatCell, type SurveyModel } from '../engine/measures'
import type { CutKey } from '../engine/prepare'
import { sampleContext } from '../engine/testkit'
import {
  engagementOrgDrill,
  exitLocationDrill,
  heatCellDrill,
  readinessDrills,
  stageCellDrill,
  stayGroupDrill,
} from './drill'

const ctx = sampleContext({ features: { engagementSurveys: true } })
const filterOf = (src: DrillSource): DrillFilter | undefined => resolveDrill(src)?.filter
const sm = (c: AnalyticsContext, survey: SurveyType): SurveyModel => {
  const s = compute(c).surveys.get(survey)
  if (!s) throw new Error(`No ${survey} answers in scope`)
  return s
}

describe('Listening: Filter to and Leave out', () => {
  it('the driver heat table by business unit and location keeps a cell’s score and respondents', () => {
    for (const survey of ['HR service survey', 'Candidate experience'] as const)
      for (const cut of ['businessUnit', 'location'] as const) {
        const cells = {
          name: `${survey} heat by ${cut}`,
          rows: (c: AnalyticsContext) => sm(c, survey).heat[cut]?.cells ?? [],
          key: (r: HeatCell) => `${r.driver}|${r.group}`,
          value: (r: HeatCell) => r.value,
          drill: (r: HeatCell, c: AnalyticsContext) => heatCellDrill(c, compute(c), sm(c, survey), cut)(r),
          // One group's column of a driver table: the group's own numbers stay the same.
          kind: 'rate' as const,
        }
        expectFilterTo(ctx, cells, { sample: 3 })
        expectFilterTo(ctx, { ...cells, value: (r) => (r.suppressed ? null : r.respondents) }, { sample: 2 })
      }
  }, 120_000)

  it('candidate NPS by stage and department keeps the cell after Filter to its department', () => {
    expectFilterTo(
      ctx,
      {
        name: 'candidate NPS by stage and department',
        rows: (c) => compute(c).stage?.cells ?? [],
        key: (r: StageCell) => `${r.stage}|${r.department}`,
        value: (r) => r.nps,
        drill: (r, c) => stageCellDrill(c, compute(c), sm(c, 'Candidate experience'))(r),
        kind: 'rate',
      },
      { sample: 4 },
    )
  }, 60_000)

  it('day-30 readiness by region filters to the region’s sites, for the survey and the laptops', () => {
    const survey = (x: AnalyticsContext) => readinessDrills(x, compute(x), sm(x, 'Onboarding pulse day 30'))
    const rows = (c: AnalyticsContext) => compute(c).readiness?.regions ?? []
    expectFilterTo(ctx, {
      name: 'day-30 readiness by region',
      rows,
      key: (r: RegionReadiness) => r.region,
      value: (r) => r.mean,
      drill: (r, c) => survey(c).survey(r),
      kind: 'rate',
    })
    const starts = {
      name: 'starts with a laptop task by region',
      rows,
      key: (r: RegionReadiness) => r.region,
      value: (r: RegionReadiness) => r.starts,
      drill: (r: RegionReadiness, c: AnalyticsContext) => survey(c).starts(r),
    }
    expectFilterTo(ctx, starts)
    expectLeaveOut(ctx, starts, { sample: 2 })
    // The actions name the region, not its sites: "Filter to Asia Pacific".
    for (const r of rows(ctx).filter((x) => !x.suppressed))
      for (const src of [survey(ctx).survey(r), survey(ctx).starts(r)]) {
        const spec = resolveDrill(src)
        if (spec?.filter) expect(spec.filterLabel).toBe(r.region)
      }
    expectFilterTo(ctx, {
      ...starts,
      name: 'laptops late by region',
      value: (r) => r.late,
      drill: (r, c) => survey(c).late(r),
    })
  }, 60_000)

  it('stay risks by department and career band filter to the department and its levels', () => {
    const groups = {
      name: 'stay interviews by department and band',
      rows: (c: AnalyticsContext) => compute(c).stay?.groups ?? [],
      key: (r: StayGroup) => r.group,
      value: (r: StayGroup) => r.interviews,
      drill: (r: StayGroup, c: AnalyticsContext) => stayGroupDrill(c, compute(c), sm(c, 'Stay interview'))(r),
    }
    expectFilterTo(ctx, groups, { sample: 4 })
    expectFilterTo(ctx, { ...groups, name: 'top stay risk share', value: (r) => r.share, kind: 'rate' })
    const g = compute(ctx).stay?.groups[0] as StayGroup
    const filter = filterOf(stayGroupDrill(ctx, compute(ctx), sm(ctx, 'Stay interview'))(g)) as DrillFilter
    expect(filterDimensions(filter)).toEqual(['department', 'level'])
    expect(`${filter.department?.[0]} ${g.group.split(' ').at(-1)}`).toBe(g.group)
    // The actions say the group as its row does, not its levels one by one.
    expect(resolveDrill(stayGroupDrill(ctx, compute(ctx), sm(ctx, 'Stay interview'))(g))?.filterLabel).toBe(
      g.group,
    )
  }, 60_000)

  it('the top exit reason by location filters to the location, and Leave out removes its leavers', () => {
    const locations = {
      name: 'exit survey leavers by location',
      rows: (c: AnalyticsContext) => compute(c).exit?.locations ?? [],
      key: (r: ExitLocation) => r.location,
      value: (r: ExitLocation) => r.respondents,
      drill: (r: ExitLocation, c: AnalyticsContext) =>
        exitLocationDrill(c, compute(c), sm(c, 'Exit survey'))(r),
    }
    expectFilterTo(ctx, locations, { sample: 4, variants: true })
    expectLeaveOut(ctx, locations, { sample: 2, variants: true })
    expectFilterTo(ctx, { ...locations, name: 'top exit reason share', value: (r) => r.share, kind: 'rate' })
  }, 60_000)

  it('eNPS by business unit filters to the unit and keeps its score and respondents', () => {
    const rows = (c: AnalyticsContext) => {
      const b = compute(c).engagementByOrg
      return b ? scoresOf(b, 'nps') : []
    }
    const units = {
      name: 'eNPS respondents by business unit',
      rows,
      key: (r: GroupScore) => r.group,
      value: (r: GroupScore) => (r.suppressed ? null : r.respondents),
      drill: (r: GroupScore, c: AnalyticsContext) =>
        engagementOrgDrill(c, compute(c), sm(c, 'Engagement'))(r),
    }
    expectFilterTo(ctx, units, { sample: 4 })
    expectFilterTo(ctx, { ...units, name: 'eNPS by business unit', value: (r) => r.value, kind: 'rate' })
  }, 60_000)

  it('the stay risk and exit reason findings and items name their group, and Filter to keeps it', () => {
    const m = compute(ctx)
    const stay = m.findings.find((f) => f.id === 'listening-stay-risk')
    const exit = m.findings.find((f) => f.id === 'listening-exit-reason')
    expect(stay && exit).toBeTruthy()
    const stayFilter = filterOf(stay?.drill) as DrillFilter
    const exitFilter = filterOf(exit?.drill) as DrillFilter
    expect(filterDimensions(stayFilter)).toEqual(['department', 'level'])
    expect(filterDimensions(exitFilter)).toEqual(['location'])
    const group = m.stay?.flag?.group as string
    const before = m.stay?.groups.find((g) => g.group === group)
    expect(compute(applyDrillFilter(ctx, stayFilter)).stay?.groups).toEqual([before])
    const where = m.exit?.flag?.location as string
    const exitRow = m.exit?.locations.find((l) => l.location === where)
    expect(compute(applyDrillFilter(ctx, exitFilter)).exit?.locations).toEqual([exitRow])
    // The Action center items open the same groups.
    const items = listeningActions(ctx)
    expect(filterOf(items.find((a) => a.id.startsWith('listening:stay:'))?.drill)).toEqual(stayFilter)
    expect(filterOf(items.find((a) => a.id.startsWith('listening:exit:'))?.drill)).toEqual(exitFilter)
  }, 60_000)
})

/** Every drill the view builds, with the group it is about when that is a survey group. */
function everyDrill(c: AnalyticsContext, m: ListeningModel): { src: DrillSource; shown: boolean }[] {
  const out: { src: DrillSource; shown: boolean }[] = []
  const add = (src: DrillSource, shown = true) => out.push({ src, shown })
  for (const k of m.kpis) add(k.drill)
  for (const f of m.findings) add(f.drill)
  for (const a of listeningActions(c)) add(a.drill)
  for (const s of m.surveys.values()) {
    for (const cut of cutsFor(s.survey) as CutKey[]) {
      const open = heatCellDrill(c, m, s, cut)
      for (const cell of s.heat[cut]?.cells ?? []) add(open(cell), !cell.suppressed)
    }
  }
  const cx = m.surveys.get('Candidate experience')
  if (cx) for (const cell of m.stage?.cells ?? []) add(stageCellDrill(c, m, cx)(cell), !cell.suppressed)
  const d30 = m.surveys.get('Onboarding pulse day 30')
  if (d30) {
    const r = readinessDrills(c, m, d30)
    for (const x of m.readiness?.regions ?? [])
      for (const f of [r.survey, r.starts, r.late]) add(f(x), !x.suppressed)
  }
  const stay = m.surveys.get('Stay interview')
  if (stay) for (const g of m.stay?.groups ?? []) add(stayGroupDrill(c, m, stay)(g))
  const exit = m.surveys.get('Exit survey')
  if (exit) for (const l of m.exit?.locations ?? []) add(exitLocationDrill(c, m, exit)(l))
  const eng = m.surveys.get('Engagement')
  const b = m.engagementByOrg
  if (eng && b) for (const g of scoresOf(b, 'nps')) add(engagementOrgDrill(c, m, eng)(g), !g.suppressed)
  return out
}

describe('Listening: no drill sets a filter the view does not group by', () => {
  it('org groups at the survey minimum only, in the data, and never a leader', () => {
    const m = compute(ctx)
    const vocab = vocabularyOf(ctx)
    let n = 0
    for (const { src, shown } of everyDrill(ctx, m)) {
      const filter = filterOf(src)
      if (!filter) continue
      n++
      expect(shown, JSON.stringify(filter)).toBe(true)
      expect(filter.leaderId ?? null).toBeNull()
      expect(filter.period).toBeUndefined()
      for (const d of filterDimensions(filter))
        expect(['businessUnit', 'department', 'location', 'level']).toContain(d)
      expect(filterInData(filter, vocab), JSON.stringify(filter)).toBe(true)
    }
    expect(n).toBeGreaterThan(20)
    // Tiles and the upward feedback items are whole-scope numbers or manager cuts: no filter.
    for (const k of m.kpis) expect(filterOf(k.drill)).toBeUndefined()
    for (const a of listeningActions(ctx).filter((x) => x.id.startsWith('listening:manager:')))
      expect(filterOf(a.drill)).toBeUndefined()
  }, 60_000)
})
