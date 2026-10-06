/** Small glue between the HRBP figures and the shared drill panel. */
import { byGroup } from '@/charts/kit/groupDrill'
import type { FilterDimension } from '@/data/scope'
import type { DrillSource } from '@/drill/Drill'
import type { DrillSpec } from '@/drill/types'
import type { AttritionDim, GroupRateRow } from '../engine/attrition'
import type { Prep } from '../engine/base'
import {
  type CountDim,
  countSpec,
  type GrowthCell,
  groupExitSpec,
  growthCellSpec,
  layerBuSpec,
  type ManagerCell,
  managerCellSpec,
  mixGroupSpec,
  mixSpec,
} from '../engine/buckets'
import type { LayerRow, ManagerRow, OrgModel } from '../engine/org'
import type { CountRow, GrowthRow, MixRow, WorkforceModel } from '../engine/workforce'

/**
 * The drill for a table cell or tile: a thunk (the spec is built on click) when there are records
 * behind the number, else nothing, so cells without records don't look clickable.
 */
export const drillWhen = (has: boolean, build: () => DrillSpec | null): DrillSource => (has ? build : null)

/** The org filter a headcount breakdown's groups belong to (tenure bands are no filter). */
const COUNT_FILTER: Partial<Record<CountDim, FilterDimension>> = {
  department: 'department',
  location: 'location',
  businessUnit: 'businessUnit',
  level: 'level',
}

/**
 * The employees behind one bar of a headcount breakdown, with the bar's group as the drill's
 * filter, so the records panel offers "Filter to Bengaluru" (docs/FILTERS.md, part 4). The same
 * source serves the chart's marks and the table's cells.
 */
export function headcountDrill(p: Prep, dim: CountDim): (row: CountRow) => DrillSource {
  const build = (r: CountRow) => drillWhen(r.records.length > 0, () => countSpec(p, dim, r))
  const filter = COUNT_FILTER[dim]
  return filter ? byGroup(filter, 'label', build) : build
}

/**
 * The leavers behind a group's attrition rate. Only the location bars set a filter: a leaver's
 * site and the headcount's site are both today's, as the filters read them. Department and level
 * are rebuilt as they were at each month end and at exit, so "Filter to" would not reproduce them.
 */
export function attritionGroupDrill(
  p: Prep,
  dim: AttritionDim,
  voluntaryOnly: boolean,
): (row: GroupRateRow) => DrillSource {
  const build = (r: GroupRateRow) =>
    drillWhen(r.leavers.length > 0, () => groupExitSpec(p, dim, r, voluntaryOnly))
  return dim === 'location' ? byGroup('location', 'group', build) : build
}

export type MixDim = 'location' | 'businessUnit'

/** One worker type in one site or business unit (a bar segment or table cell). */
export const mixDrill = (p: Prep, dim: MixDim): ((row: MixRow) => DrillSource) =>
  byGroup(dim, 'group', (r: MixRow) => drillWhen(r.records.length > 0, () => mixSpec(p, r)))

/** Every contractor and intern in a site or business unit (the whole bar). */
export const mixGroupDrill = (
  p: Prep,
  dim: MixDim,
  rows: readonly MixRow[],
): ((d: { group: string }) => DrillSource) =>
  byGroup(dim, 'group', (d: { group: string }) => () => mixGroupSpec(p, rows, d.group))

/**
 * A growth bar or cell: the business unit's or department's employees then and now. Both dates use
 * today's org attributes, as the filters do, so "Filter to" keeps the numbers.
 */
export const growthDrill = (
  p: Prep,
  wf: Pick<WorkforceModel, 'growthBy'>,
  cell: GrowthCell,
): ((row: GrowthRow) => DrillSource) =>
  byGroup(wf.growthBy, 'group', (r: GrowthRow) => {
    const has =
      cell === 'yearAgo'
        ? r.records.before.length > 0
        : cell === 'now'
          ? r.records.now.length > 0
          : r.records.joined.length + r.records.left.length > 0
    return drillWhen(has, () => growthCellSpec(p, r, cell))
  })

/** The active workers of a business unit, behind its layer count. */
export const layerDrill = (p: Prep, org: OrgModel): ((row: LayerRow) => DrillSource) =>
  byGroup('businessUnit', 'businessUnit', (r: LayerRow) =>
    drillWhen(r.records.length > 0, () => layerBuSpec(p, org, r)),
  )

/**
 * A manager table cell. "Total org" is the manager's org, so it sets their org as the filter;
 * direct reports and regretted exits from the team are not a filterable group.
 */
export function managerDrill(
  p: Prep,
  org: OrgModel,
  cell: ManagerCell,
  count: (r: ManagerRow) => number,
): (row: ManagerRow) => DrillSource {
  const build = (r: ManagerRow) => drillWhen(count(r) > 0, () => managerCellSpec(p, org, r, cell))
  return cell === 'totalOrg' ? byGroup('leaderId', 'managerId', build) : build
}
