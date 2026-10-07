/**
 * The Compliance figures whose marks are groups of a filterable dimension (docs/FILTERS.md,
 * part 4). Their records carry the group's filter, so the records panel offers "Filter to" and
 * "Leave out". Shared by the figures and their tests.
 *
 *  - I-9 Section 2 on time by site: the site (the employee's location).
 *  - Jurisdictions with people, and the employees each calendar entry covers (in the statutory
 *    calendar and in the year-ahead heatmap's month list): the sites of the people the
 *    jurisdiction covers. A jurisdiction is the set of its sites; US federal law covers every US
 *    site, so its people include each US state's. The actions name the jurisdiction ("Filter to
 *    US Federal"), not its sites.
 *  - People in licensed roles by site and status: the site, for the whole bar and for each status segment
 *    (after "Filter to" the segment keeps its count beside the site's other statuses).
 *
 * Everything else Compliance draws is grouped by something the filters do not have (expiry month
 * and quarter, reverification status, authorization category, license status, business days to
 * I-9 Section 2), so it sets no filter. Authorization expiries by month and business unit cut a
 * month as well as a unit, so a segment is no group of one dimension and sets none either.
 */
import { byGroup } from '@/charts/kit/groupDrill'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Employee } from '@/data/schema'
import type { DrillSource } from '@/drill/Drill'
import type { SiteStatusRow } from '../engine/charts'
import type { DeadlineRow, JurisdictionRow } from '../engine/deadlines'
import {
  type DrillScope,
  deadlinePeopleDrill,
  i9Drill,
  jurisdictionPeopleDrill,
  licenseDrill,
} from '../engine/drills'
import type { SiteRow } from '../engine/i9'

/** A site that is every one of its starts' location ("Unknown site" is none). */
const siteOf = (r: SiteRow): string | null => (r.rows.every((x) => x.e.location === r.site) ? r.site : null)

/** US starts at a site judged on I-9 Section 2, or the late ones, filtered to the site. */
export function i9SiteCells(s: DrillScope, uses: readonly FieldRef[]) {
  const cell = (late: boolean) =>
    byGroup('location', siteOf, (r: SiteRow) => {
      const rows = late ? r.rows.filter((x) => !x.onTime) : r.rows
      return rows.length
        ? () =>
            i9Drill(s, rows, {
              title: `US starts at ${r.site}${late ? ' with I-9 Section 2 late or missing' : ' judged on I-9 Section 2'}`,
              uses,
            })
        : null
    })
  return { all: cell(false), late: cell(true) }
}

/** The sites of the people a jurisdiction covers, sorted; null when someone has no site. */
export function sitesOfPeople(people: readonly Pick<Employee, 'location'>[]): string[] | null {
  const out = new Set<string>()
  for (const e of people) {
    if (!e.location) return null
    out.add(e.location)
  }
  return out.size ? [...out].sort() : null
}

/** The active employees a jurisdiction covers, filtered to its sites. */
export function jurisdictionDrill(
  s: DrillScope,
  uses: readonly FieldRef[],
): (r: Pick<JurisdictionRow, 'jurisdiction' | 'people'>) => DrillSource {
  return byGroup(
    'location',
    (r: Pick<JurisdictionRow, 'people'>) => sitesOfPeople(r.people),
    (r: Pick<JurisdictionRow, 'jurisdiction' | 'people'>) => () =>
      jurisdictionPeopleDrill(s, r.people, r.jurisdiction.shortName, uses),
    (r) => r.jurisdiction.shortName,
  )
}

/** The employees a calendar entry covers: its jurisdiction's, filtered to its sites. */
export const deadlineDrill = (s: DrillScope, uses: readonly FieldRef[]): ((d: DeadlineRow) => DrillSource) =>
  byGroup(
    'location',
    (d: DeadlineRow) => sitesOfPeople(d.people),
    (d: DeadlineRow) => () => deadlinePeopleDrill(s, d, uses),
    (d) => d.jurisdiction.shortName,
  )

/** A license site that is a real location ("Unknown site" is none). */
const licenseSite = (d: SiteStatusRow): string | null => (d.location === 'Unknown site' ? null : d.location)

/** Licensed roles at a site (the bar) and with one status there (a segment), filtered to the site. */
export function licenseSiteCells(s: DrillScope, uses: readonly FieldRef[]) {
  const site = byGroup(
    'location',
    licenseSite,
    (d: SiteStatusRow) => () =>
      licenseDrill(s, d.siteRows, { title: `Roles that need an export license at ${d.location}`, uses }),
  )
  const segment = byGroup(
    'location',
    licenseSite,
    (d: SiteStatusRow) => () =>
      licenseDrill(s, d.rows, { title: `Export licenses at ${d.location}: ${d.status}`, uses }),
  )
  return { site, segment }
}
