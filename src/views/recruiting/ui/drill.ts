/**
 * The drills of the Recruiting figures whose marks are groups of a filterable dimension
 * (docs/FILTERS.md, part 4). Requisitions are scoped by their own department, location and level,
 * and candidates follow their req, so a bar for a department, a site or a level carries the
 * filter that reproduces it and the records panel offers "Filter to" and "Leave out". One source
 * serves a figure's marks and its table's cells. Month and quarter bars set their period in the
 * engine (`hiresMonthDrill`, `reqMonthDrill`, `quarterOffersDrill`).
 *
 * Left without a filter: stages and next-step states (the Pipeline tab), sources, recruiters,
 * reasons, single reqs and candidates, a "Not set" bucket, and a hiring manager's reqs (the
 * leader filter is a whole org, not one manager's own reqs).
 */
import { byGroup } from '@/charts/kit/groupDrill'
import type { Window } from '@/data/scope'
import type { DrillSource } from '@/drill/Drill'
import type { RecruitingBase } from '../engine/base'
import {
  locationOffersDrill,
  monthEndReqsDrill,
  openReqsDrill,
  ttfGroupDrill,
  ttfQuarterDrill,
} from '../engine/drills'
import {
  ALL_REQS,
  type MonthEndDim,
  type MonthEndReqRow,
  type OpenByDeptRow,
  OTHER_SERIES,
  type TtfQuarterRow,
  type TtfRow,
} from '../engine/reqs'
import type { GroupAcceptance } from '../engine/sources'

/** The bucket the engine puts rows with no value in; no filter can name it. */
const NOT_SET = 'Not set'

/** A group the filters can name, or null for the "Not set" bucket. */
export const named = (v: string | null | undefined): string | null => (v && v !== NOT_SET ? v : null)

/** Open reqs by department: the department's open reqs, oldest first. */
export const openReqsDepartmentDrill = (b: RecruitingBase): ((d: OpenByDeptRow) => DrillSource) =>
  byGroup(
    'department',
    (d: OpenByDeptRow) => named(d.department),
    (d) => (d.reqs.length ? () => openReqsDrill(b, d.reqs, `Open reqs, ${d.department}`) : null),
  )

/** Time to fill by level or department: the group's filled reqs (none behind a hidden median). */
export const ttfDrill = (b: RecruitingBase, dim: 'level' | 'department'): ((d: TtfRow) => DrillSource) =>
  byGroup(
    dim,
    (d: TtfRow) => named(d.group),
    (d) => (d.filled.length ? () => ttfGroupDrill(b, d) : null),
  )

/**
 * Offer acceptance by location: the site's resolved offers in `w` (the period, or the latest
 * quarter), or only the accepted or declined ones. Hidden rates carry no records.
 */
export const offersLocationDrill = (
  b: RecruitingBase,
  w: Pick<Window, 'start' | 'end'>,
  only?: 'Hired' | 'Declined',
): ((r: GroupAcceptance) => DrillSource) =>
  byGroup(
    'location',
    (r: GroupAcceptance) => named(r.group),
    (r) =>
      (only ? r.apps.some((a) => a.outcome === only) : r.apps.length)
        ? () => locationOffersDrill(b, r, w, only)
        : null,
  )

/**
 * Open reqs at month end: a segment's reqs open on that date, with its business unit (or its
 * department, when the chart stacks by department) as the filter. "Other" and "Not set" carry
 * none; a month end is a snapshot, so no period is set.
 */
export const openReqsByMonthEndDrill = (
  b: RecruitingBase,
  dim: MonthEndDim = 'businessUnit',
): ((r: MonthEndReqRow) => DrillSource) =>
  byGroup(
    dim,
    (r: MonthEndReqRow) => (r.group === OTHER_SERIES ? null : named(r.group)),
    (r) => (r.list.length ? () => monthEndReqsDrill(b, r.date, r.list, r.group) : null),
  )

/**
 * Median time to fill by quarter: a point's filled reqs with the quarter as the period, and for a
 * level band its levels, named as the band ("Filter to L5 and above"). Hidden medians open nothing.
 */
export const ttfQuarterGroupDrill = (b: RecruitingBase): ((r: TtfQuarterRow) => DrillSource) =>
  byGroup(
    'level',
    (r: TtfQuarterRow) => (r.levels.length ? r.levels : null),
    (r) => (r.filled.length ? () => ttfQuarterDrill(b, r, ALL_REQS) : null),
    (r) => (r.series === ALL_REQS ? null : r.series),
  )
