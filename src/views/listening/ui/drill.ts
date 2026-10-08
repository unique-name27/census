/**
 * The Listening figures whose marks are groups of a filterable dimension (docs/FILTERS.md,
 * part 4). Their grouped results carry the group's filter, so the records panel offers "Filter to"
 * and "Leave out". Shared by the figures and their tests.
 *
 * A survey answer follows its respondent (an employee's current org, or a candidate's req), and so
 * do these groups, so "Filter to" reproduces them:
 *  - the driver heat table by business unit or location, and candidate NPS by department (a cell
 *    is one group's score on one driver or stage);
 *  - day-30 readiness by region: the region's sites, for the survey and the late laptops beside it;
 *  - stay risks by department and career band: the department and the levels its people hold;
 *  - the top exit reason by location, and eNPS by business unit.
 *
 * Privacy: only groups at the survey minimum set a filter (a hidden group and "Other" set none),
 * and a manager cut never sets a leader. Tenure, stage, source, recruiter, driver, reason, case
 * category and channel, course and wave are no filters, so their numbers set none.
 */
import { byGroup, withFilter } from '@/charts/kit/groupDrill'
import type { AnalyticsContext } from '@/data/context'
import type { FilterDimension } from '@/data/scope'
import type { DrillSource } from '@/drill/Drill'
import { drillSpec } from '@/drill/types'
import type { ListeningModel } from '../engine'
import {
  deptBandFilter,
  type ExitLocation,
  type GroupScore,
  laptopLate,
  type RegionReadiness,
  readinessRows,
  type StageCell,
  type StayGroup,
} from '../engine/cuts'
import { groupsDrill, itemRowsOf, rowsBy } from '../engine/drills'
import { stageWords } from '../engine/findings'
import * as L from '../engine/lineage'
import { type HeatCell, inHeatColumn, type SurveyModel } from '../engine/measures'
import { CUT_LABEL, type CutKey, cutOf, deptBandOf, type Prepared, regionOfLocation } from '../engine/prepare'

/** The filter a survey cut maps to; tenure and stage are no filters. */
const CUT_DIMENSION: Partial<Record<CutKey, FilterDimension>> = {
  businessUnit: 'businessUnit',
  location: 'location',
  department: 'department',
}

/** A group shown at the survey minimum; a hidden one is no group to filter to. */
const shown = (g: { group: string; suppressed: boolean }): string | null => (g.suppressed ? null : g.group)

/** One cell of the driver heat table: the driver's items for the respondents in the column's group. */
export function heatCellDrill(
  ctx: AnalyticsContext,
  m: ListeningModel,
  sm: SurveyModel,
  cut: CutKey,
): (c: HeatCell) => DrillSource {
  const heat = sm.heat[cut]
  const key = cutOf(m.prepared, cut)
  const open = (c: HeatCell) => () => {
    const answers = heat
      ? sm.period.filter(
          (r) =>
            r.scale === '1-5' && (r.driver ?? r.item) === c.driver && inHeatColumn(heat, key(r), c.group),
        )
      : []
    return groupsDrill(itemRowsOf(answers, sm.survey, null, c.driver, sm.min), {
      survey: sm.survey,
      wave: null,
      title: `${c.driver}, ${CUT_LABEL[cut].toLowerCase()} ${c.group}`,
      subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
      min: sm.min,
      uses: m.uses.heat(sm.survey, cut),
    })
  }
  const dim = CUT_DIMENSION[cut]
  return dim ? byGroup(dim, (c: HeatCell) => shown(c), open) : open
}

/** One cell of candidate NPS by furthest stage and department: its candidates' drivers. */
export function stageCellDrill(
  ctx: AnalyticsContext,
  m: ListeningModel,
  sm: SurveyModel,
): (c: StageCell) => DrillSource {
  const dept = cutOf(m.prepared, 'department')
  const big = new Set(m.stage?.departments ?? [])
  const wave = sm.latest?.wave ?? null
  const inDept = (d: string | null, column: string) =>
    d != null && (column.startsWith('Other (') ? !big.has(d) : d === column)
  return byGroup(
    'department',
    (c: StageCell) => (c.suppressed ? null : c.department),
    (c: StageCell) => () => {
      const keys = new Set(
        sm.latestRows
          .filter(
            (r) => r.scale === '0-10' && r.touchpoint?.trim() === c.stage && inDept(dept(r), c.department),
          )
          .map((r) => r.respondentKey),
      )
      return groupsDrill(
        rowsBy(
          sm.latestRows.filter((r) => keys.has(r.respondentKey)),
          (r) => r.driver ?? r.item,
          { survey: sm.survey, wave, groupBy: 'Driver', min: sm.min },
        ),
        {
          survey: sm.survey,
          wave,
          title: `${c.department}, ${stageWords(c.stage)}, ${wave ?? ''}`,
          subtitle: ctx.scopeLabel,
          min: sm.min,
          uses: m.uses.stage,
        },
      )
    },
  )
}

/** The sites of a region in the loaded data, from the one region index (`Prepared.regions`). */
export function regionSites(p: Pick<Prepared, 'regions'>, region: string): string[] | null {
  const sites = p.regions.sitesOf(region)
  return sites.length ? [...sites] : null
}

/** Day-30 readiness by region: the survey by location, and the laptop tasks of the region's starts. */
export function readinessDrills(ctx: AnalyticsContext, m: ListeningModel, sm: SurveyModel) {
  const p = m.prepared
  const ready = readinessRows(p, sm.period)
  const shownRegions = new Set(m.readiness?.byRegion.groups.map((g) => g.group) ?? [])
  const inRegion = (r: { respondentKey: string }, region: string) => {
    const g = regionOfLocation(p, p.emp.get(r.respondentKey)?.location)
    return region.startsWith('Other (') ? !!g && !shownRegions.has(g) : g === region
  }
  const sites = (r: RegionReadiness) => (r.suppressed ? null : regionSites(p, r.region))
  const survey = byGroup(
    'location',
    sites,
    (r: RegionReadiness) => () =>
      groupsDrill(
        rowsBy(
          ready.filter((x) => inRegion(x, r.region)),
          (x) => p.emp.get(x.respondentKey)?.location ?? null,
          { survey: sm.survey, wave: null, groupBy: 'Location', min: sm.min },
        ),
        {
          survey: sm.survey,
          wave: null,
          title: `Day-30 readiness in ${r.region}, by location`,
          subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
          min: sm.min,
          uses: m.uses.readiness,
        },
      ),
    // The region's sites are the filter; the actions say the region: "Filter to APAC".
    (r) => r.region,
  )
  const tasks = (late: boolean) =>
    byGroup(
      'location',
      sites,
      (r: RegionReadiness) => () => {
        const tie = laptopLate(ctx, ctx.window, (loc) => regionOfLocation(p, loc) === r.region)
        return late
          ? drillSpec({
              kind: 'onboardingTasks',
              title: `Laptops shipped late for ${r.region} starts`,
              subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
              note: 'Laptop tasks completed after their due date, or not shipped and past due, for people who started in the period.',
              rows: tie.lateTasks,
              uses: [...L.LAPTOP_TASKS],
            })
          : drillSpec({
              kind: 'onboardingTasks',
              title: `Laptop tasks for ${r.region} starts`,
              subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
              rows: tie.tasks,
              uses: [...L.LAPTOP_TASKS],
            })
      },
      (r) => r.region,
    )
  return { survey, starts: tasks(false), late: tasks(true) }
}

/** Stay risks named by one department and career band, filtered to its department and levels. */
export function stayGroupDrill(
  ctx: AnalyticsContext,
  m: ListeningModel,
  sm: SurveyModel,
): (g: StayGroup) => DrillSource {
  const inGroup = deptBandOf(m.prepared)
  return (g) => () => {
    const answers = sm.period.filter((r) => inGroup(r) === g.group)
    const spec = groupsDrill(
      rowsBy(answers, (r) => r.reason?.trim() || null, {
        survey: sm.survey,
        wave: null,
        groupBy: 'Top stay risk',
        min: sm.min,
      }),
      {
        survey: sm.survey,
        wave: null,
        title: `Stay risks named by ${g.group} key talent`,
        subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
        min: sm.min,
        uses: m.uses.stay,
        note: 'Each person counts once for each reason they named.',
      },
    )
    return withFilter(
      spec,
      deptBandFilter(
        m.prepared,
        g.group,
        answers.map((r) => r.respondentKey),
      ),
      // The group as the row says it ("Design Verification L1-L3"), not its levels one by one.
      g.group,
    )
  }
}

/** Exit survey reasons at one location, filtered to it. */
export function exitLocationDrill(
  ctx: AnalyticsContext,
  m: ListeningModel,
  sm: SurveyModel,
): (l: Pick<ExitLocation, 'location'>) => DrillSource {
  const p = m.prepared
  return byGroup(
    'location',
    'location',
    (l: Pick<ExitLocation, 'location'>) => () =>
      groupsDrill(
        rowsBy(
          sm.period.filter((r) => p.emp.get(r.respondentKey)?.location === l.location),
          (r) => r.reason?.trim() || null,
          { survey: sm.survey, wave: null, groupBy: 'Exit reason', min: sm.min },
        ),
        {
          survey: sm.survey,
          wave: null,
          title: `Exit survey reasons in ${l.location}`,
          subtitle: `${ctx.window.label} · ${ctx.scopeLabel}`,
          min: sm.min,
          uses: m.uses.exitReasons,
        },
      ),
  )
}

/** eNPS of one business unit in the latest wave, by driver, filtered to the unit. */
export function engagementOrgDrill(
  ctx: AnalyticsContext,
  m: ListeningModel,
  sm: SurveyModel,
): (g: GroupScore) => DrillSource {
  const b = m.engagementByOrg
  const bu = cutOf(m.prepared, 'businessUnit')
  const wave = sm.latest?.wave ?? null
  return byGroup(
    'businessUnit',
    shown,
    (g: GroupScore) => () =>
      groupsDrill(
        rowsBy(
          sm.latestRows.filter((r) => {
            const v = bu(r)
            return g.group.startsWith('Other (')
              ? !!v && !b?.groups.some((x) => x.group === v)
              : v === g.group
          }),
          (r) => r.driver ?? r.item,
          { survey: sm.survey, wave, groupBy: 'Driver', min: sm.min },
        ),
        {
          survey: sm.survey,
          wave,
          title: `Engagement, ${g.group}, by driver`,
          subtitle: `${wave ?? ''} · ${ctx.scopeLabel}`,
          min: sm.min,
          uses: m.uses.engagement,
        },
      ),
  )
}
