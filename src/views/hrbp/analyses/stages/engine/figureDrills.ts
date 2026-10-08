/**
 * The drill behind every mark and table count of Engineering by stage's figures, one builder per
 * figure, so the UI and the tests open the same records (a drill lists exactly what was counted).
 * Each returns null when nothing is behind the number, so it does not look clickable. Only the
 * heatmap's cells set "Filter to this" (a site or business unit). Pure.
 */
import type { DrillSource } from '@/drill/Drill'
import { formatDate } from '@/lib/dates'
import type { EngPerson } from './base'
import type { CapacityRow, FunctionRow, HiringRow, RatioRow, WhereCell } from './capacity'
import { groupPeopleSpec, linesSpec, peopleSpec, reqsSpec, startsSpec, titled } from './drills'
import { PLANNED_USES, REQ_USES, STARTS_USES, WHERE_USES } from './metrics'
import type { StagesModel } from './model'

const scopeOf = (m: StagesModel): string | null => (m.base.ctx.isCompany ? null : m.base.ctx.scopeLabel)
const who = (m: StagesModel): string => (m.base.set.countInterns ? 'Employees and interns' : 'Employees')

export type CapacityPart = 'employees' | 'contractors' | 'interns' | 'both' | 'yearAgo' | 'proposed'

/** A capacity bar segment, the whole bar ('both') or a table cell. */
export function capacityDrill(m: StagesModel, r: CapacityRow, part: CapacityPart): DrillSource {
  const both = [...r.people.employees, ...r.people.contractors]
  const people: EngPerson[] =
    part === 'both'
      ? both
      : part === 'proposed'
        ? both.filter((p) => p.source === 'Proposed')
        : part === 'yearAgo'
          ? r.people.yearAgo
          : r.people[part]
  if (!people.length) return null
  const w = who(m)
  const what =
    part === 'employees'
      ? w
      : part === 'contractors'
        ? 'Contractors'
        : part === 'interns'
          ? 'Interns'
          : part === 'yearAgo'
            ? `${w} on ${formatDate(m.yearAgoDate)}`
            : part === 'proposed'
              ? 'People whose stage is only proposed'
              : `${w} and contractors`
  const where = r.key === 'unmapped' ? 'no stage' : r.stage
  return () =>
    peopleSpec(m.base, titled(`${what} in ${where}`, m.family, scopeOf(m)), people, {
      date: part === 'yearAgo' ? m.yearAgoDate : undefined,
    })
}

export type HiringPart = 'accepted' | 'open' | 'planned'

/** A hiring in flight segment: the upcoming starts, the open reqs or the plan lines of a stage. */
export function hiringDrill(m: StagesModel, r: HiringRow, part: HiringPart): DrillSource {
  const b = m.base
  const scope = scopeOf(m)
  if (part === 'accepted')
    return r.records.starts.length
      ? () =>
          startsSpec(b, titled(`Starts not yet started, ${r.stage}`, m.family, scope), r.records.starts, {
            uses: STARTS_USES,
          })
      : null
  if (part === 'open')
    return r.records.reqs.length
      ? () =>
          reqsSpec(b, titled(`Open reqs, ${r.stage}`, m.family, scope), r.records.reqs, { uses: REQ_USES })
      : null
  return r.records.lines.length
    ? () =>
        linesSpec(b, titled(`Planned starts with no req, ${r.stage}`, m.family), r.records.lines, {
          uses: PLANNED_USES,
        })
    : null
}

/** A ratio: the people in both of its stages. */
export function ratioDrill(m: StagesModel, r: RatioRow): DrillSource {
  if (r.value == null) return null
  return () =>
    peopleSpec(m.base, titled(`${r.def.topWords} and ${r.def.bottomWords}`, m.family, scopeOf(m)), [
      ...r.people.top,
      ...r.people.bottom,
    ])
}

/** A heatmap cell: its people, with "Filter to" on the site or business unit (not on Other). */
export function whereDrill(m: StagesModel, c: WhereCell): DrillSource {
  if (!c.records.length) return null
  return () =>
    groupPeopleSpec(
      m.base,
      titled(`${c.stage}, ${c.group}`, m.family),
      c.records,
      c.dim,
      c.other || c.group === 'Not recorded' ? null : c.group,
      { uses: WHERE_USES },
    )
}

/** A trend point: the people in the stage at that quarter end. */
export function trendDrill(m: StagesModel, stage: string, i: number): DrillSource {
  const t = m.trend.find((x) => x.name === stage)
  const people = t?.records[i] ?? []
  const date = t?.periods[i]
  if (!people.length || !date) return null
  return () =>
    peopleSpec(m.base, titled(`${stage} on ${formatDate(date)}`, m.family, scopeOf(m)), people, { date })
}

export type FunctionPart = 'employees' | 'contractors' | 'openings' | 'planned'

/** A job function's people, open reqs or plan lines. */
export function functionDrill(m: StagesModel, r: FunctionRow, part: FunctionPart): DrillSource {
  const b = m.base
  const scope = scopeOf(m)
  if (part === 'openings')
    return r.records.reqs.length
      ? () =>
          reqsSpec(b, titled(`Open reqs, ${r.jobFunction}`, m.family, scope), r.records.reqs, {
            uses: REQ_USES,
          })
      : null
  if (part === 'planned')
    return r.records.lines.length
      ? () =>
          linesSpec(b, titled(`Planned starts with no req, ${r.jobFunction}`, m.family), r.records.lines, {
            uses: PLANNED_USES,
          })
      : null
  const people = r.records[part]
  return people.length
    ? () =>
        peopleSpec(
          b,
          titled(`${part === 'employees' ? 'Employees' : 'Contractors'}, ${r.jobFunction}`, m.family, scope),
          people,
        )
    : null
}
