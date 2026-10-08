/**
 * The records behind every number of the Level pyramid (docs/ANALYSES.md, 5.5): employees with
 * their level a year ago, tenure band and direct reports; job changes for promotions; managers
 * with their spans. "Filter to this" is set where a number is a filterable group: a level (or two
 * levels, or a band), and a level or band inside a business unit. A tenure band, a worker type,
 * "Other" and "Not recorded" set no filter, and neither does anything a year ago (the filters
 * read today's level). The company's outline is an aggregate and opens nothing.
 */
import type { Column } from '@/charts/types'
import type { Employee, Level } from '@/data/schema'
import { groupFilter } from '@/drill/filter'
import { type DrillExtra, type DrillFilter, type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { tenureBand, tenureYears } from '@/lib/people'
import { count, listJoin } from '../../../engine/base'
import {
  changesSpec,
  employeesOnSpec,
  hiresSpec,
  joinedLeftSpec,
  leaversSpec,
  managersSpec,
  scopeLine,
  scopePart,
  titled,
  WORKER_HIDE,
} from '../../../engine/drill'
import {
  type Band,
  type FlowRow,
  type LevelRow,
  type MixRow,
  type PyramidData,
  type RatioRow,
  type SegmentRow,
  type SpanRow,
  splitLabel,
} from './model'

const YEAR_AGO_COL = 'pyramidYearAgoLevel'
const TENURE_COL = 'pyramidTenureBand'
const DIRECTS_COL = 'pyramidDirects'

/** The extra columns every pyramid list carries (5.5): level a year ago, tenure band, direct reports. */
export function pyramidExtra(d: PyramidData): DrillExtra<Employee> {
  const columns: Column[] = [
    ...(d.hasHistory ? [{ key: YEAR_AGO_COL, label: 'Level a year ago', format: 'text' as const }] : []),
    { key: TENURE_COL, label: 'Tenure band', format: 'text' },
    { key: DIRECTS_COL, label: 'Direct reports', format: 'int' },
  ]
  return {
    columns,
    values: (e) => {
      const was =
        d.hasHistory &&
        e.hireDate <= d.yearAgoDate &&
        (!e.terminationDate || e.terminationDate > d.yearAgoDate)
          ? (d.history.levelAt(e, d.yearAgoDate) ?? 'Not recorded')
          : d.hasHistory
            ? 'Joined since'
            : null
      return {
        ...(d.hasHistory ? { [YEAR_AGO_COL]: was } : {}),
        [TENURE_COL]: tenureBand(tenureYears(e, d.asOf)),
        [DIRECTS_COL]: d.directsOf(e.employeeId),
      }
    },
  }
}

const who = (d: PyramidData, workers = false) =>
  workers ? 'Workers' : d.prep.set.countContractors ? 'Employees and contractors' : 'Employees'

const withFilter = <S extends DrillSpec>(spec: S, filter: DrillFilter | undefined, label?: string): S =>
  filter ? { ...spec, filter, ...(label ? { filterLabel: label } : {}) } : spec

/** "L1 and L2", "M1 to E3". */
export const levelsText = (levels: readonly Level[]): string =>
  levels.length <= 2 ? listJoin([...levels]) : `${levels[0]} to ${levels[levels.length - 1]}`

/** People at a set of levels today, with Filter to those levels. */
export function levelsSpec(
  d: PyramidData,
  levels: readonly Level[],
  rows: readonly Employee[],
  opts: { title?: string; note?: string; filterLabel?: string; workers?: boolean } = {},
): DrillSpec<'employees'> | null {
  if (!rows.length) return null
  const spec = employeesOnSpec(d.prep, d.asOf, {
    title: opts.title ?? titled(`${who(d, opts.workers)} at ${levelsText(levels)}`, scopePart(d.prep)),
    rows,
    extra: pyramidExtra(d),
    note: opts.note,
  })
  const shaped = opts.workers ? { ...spec, hide: WORKER_HIDE } : spec
  return withFilter(shaped, groupFilter('level', [...levels]), opts.filterLabel)
}

/** A pyramid row: its people today, Filter to the level. */
export const rowSpec = (d: PyramidData, r: LevelRow, workers = false): DrillSpec<'employees'> | null =>
  levelsSpec(d, [r.level], r.records, {
    workers,
    note: `${count(r.today, 'person', 'people')} at ${r.level} on ${formatDate(d.asOf)}.`,
  })

/** The outline from the table: the people at the level a year ago (shown with today's records). */
export function yearAgoSpec(d: PyramidData, r: LevelRow, workers = false): DrillSpec<'employees'> | null {
  if (!r.yearAgoRecords.length) return null
  const spec = employeesOnSpec(d.prep, d.yearAgoDate, {
    title: titled(`${who(d, workers)} at ${r.level} on ${formatDate(d.yearAgoDate)}`, scopePart(d.prep)),
    rows: r.yearAgoRecords,
    extra: pyramidExtra(d),
    note: `${count(r.yearAgoRecords.length, 'person', 'people')} held ${r.level} on ${formatDate(d.yearAgoDate)}, shown with their current record.`,
  })
  return workers ? { ...spec, hide: [] } : spec
}

/** The change in a level: who joined it and who left it in 12 months. */
export function changeSpec(d: PyramidData, r: LevelRow): DrillSpec<'employees'> | null {
  if (r.yearAgo == null) return null
  const before = new Set(r.yearAgoRecords.map((e) => e.employeeId))
  const now = new Set(r.records.map((e) => e.employeeId))
  const joined = r.records.filter((e) => !before.has(e.employeeId))
  const left = r.yearAgoRecords.filter((e) => !now.has(e.employeeId))
  if (!joined.length && !left.length) return null
  return joinedLeftSpec(
    d.prep,
    titled(`Joined and left ${r.level}, last 12 months`, scopePart(d.prep)),
    joined,
    left,
    {
      when: d.prep.t12.label,
      note: `${r.today.toLocaleString('en-US')} today − ${r.yearAgo.toLocaleString('en-US')} a year ago. ${count(joined.length, 'person', 'people')} joined the level and ${left.length.toLocaleString('en-US')} left it, by hire, promotion, exit or another change.`,
    },
  )
}

/** A segment of a split: its people at the level today; level and business unit for a named unit. */
export function segmentSpec(d: PyramidData, s: SegmentRow): DrillSpec<'employees'> | null {
  if (!s.records.length) return null
  const workers = s.split === 'workerType'
  const spec = employeesOnSpec(d.prep, d.asOf, {
    title: titled(`${s.segment}, ${s.level}`, scopePart(d.prep)),
    rows: s.records,
    extra: pyramidExtra(d),
    note: `${count(s.today, 'person', 'people')} at ${s.level} in ${s.segment} (${splitLabel(s.split).toLowerCase()}) on ${formatDate(d.asOf)}.`,
  })
  const shaped = workers ? { ...spec, hide: WORKER_HIDE } : spec
  if (!s.unit) return shaped
  return withFilter(
    shaped,
    { ...groupFilter('level', s.level), ...groupFilter('businessUnit', s.unit) },
    `${s.level} in ${s.unit}`,
  )
}

/** Both levels of a size-against-the-level-below row, Filter to the two levels. */
export function ratioSpec(d: PyramidData, r: RatioRow): DrillSpec<'employees'> | null {
  const levels = [...r.upper, ...r.lower]
  return levelsSpec(d, levels, r.records, {
    title: titled(`${who(d)} at ${r.label.replace(' against ', ' and ')}`, scopePart(d.prep)),
    filterLabel: r.label.replace(' against ', ' and '),
    note:
      r.ratio == null
        ? `${count(r.upperCount, 'person', 'people')} and ${count(r.lowerCount, 'person', 'people')}. The ratio is hidden: the level below has fewer than ${d.prep.set.minGroup} people.`
        : `${r.upperCount.toLocaleString('en-US')} ÷ ${r.lowerCount.toLocaleString('en-US')} = ${r.ratio.toFixed(2)}.`,
  })
}

/**
 * The managers at a management level with their direct report counts. No Filter to: filtering to
 * the level would leave their reports out of scope, so the spans would not reproduce.
 */
export function spanSpec(d: PyramidData, r: SpanRow): DrillSpec<'employees'> | null {
  if (!r.records.length || r.median == null) return null
  return managersSpec(d.prep, titled(`Managers at ${levelsText(r.levels)}`, scopePart(d.prep)), r.records, {
    note: `${count(r.managers, 'manager', 'managers')} with at least one active direct report. The median is ${r.median}.`,
  })
}

type FlowCell = 'yearAgo' | 'hired' | 'promotedIn' | 'promotedOut' | 'left' | 'other' | 'today'

/** One cell of the flow table: employees for people, job changes for promotions. */
export function flowSpec(d: PyramidData, r: FlowRow, cell: FlowCell): DrillSpec | null {
  const p = d.prep
  const when = p.t12.label
  const scope = scopePart(p)
  const level = r.level
  switch (cell) {
    case 'yearAgo': {
      if (!r.records.yearAgo.length) return null
      return employeesOnSpec(p, d.yearAgoDate, {
        title: titled(`${who(d)} at ${level} on ${formatDate(d.yearAgoDate)}`, scope),
        rows: r.records.yearAgo,
        extra: pyramidExtra(d),
      })
    }
    case 'today': {
      if (!r.records.today.length) return null
      return withFilter(
        employeesOnSpec(p, d.asOf, {
          title: titled(`${who(d)} at ${level}`, scope),
          rows: r.records.today,
          extra: pyramidExtra(d),
        }),
        groupFilter('level', level),
      )
    }
    case 'hired':
      return r.records.hired.length
        ? hiresSpec(p, titled(`Hired at ${level}, last 12 months`, scope), r.records.hired, {
            when,
            note: 'Placed at the level they held on their hire date.',
          })
        : null
    case 'left':
      return r.records.left.length
        ? leaversSpec(p, titled(`Left from ${level}, last 12 months`, scope), r.records.left, {
            when,
            note: 'Placed at the level they held on their last day.',
          })
        : null
    case 'promotedIn':
      return r.records.promotedIn.length
        ? changesSpec(p, titled(`Promotions into ${level}, last 12 months`, scope), r.records.promotedIn, {
            when,
          })
        : null
    case 'promotedOut':
      return r.records.promotedOut.length
        ? changesSpec(p, titled(`Promotions out of ${level}, last 12 months`, scope), r.records.promotedOut, {
            when,
          })
        : null
    case 'other':
      return r.records.other.length
        ? drillSpec({
            kind: 'employees',
            title: titled(`Other changes at ${level}, last 12 months`, scope),
            subtitle: scopeLine(p, when),
            rows: r.records.other,
            hide: ['employmentType'],
            extra: pyramidExtra(d),
            note: 'People who moved into or out of the level by something other than a hire, a promotion or an exit: a demotion, a level correction or another change.',
          })
        : null
  }
}

/** One band of a business unit (or the company) in the level mix. */
export function mixSpec(d: PyramidData, r: MixRow, band: Band): DrillSpec<'employees'> | null {
  if (!r.records.length) return null
  // The company's records are not listed in Manager mode (an aggregate there).
  if (r.company && d.prep.ctx.access.lock) return null
  const spec = employeesOnSpec(d.prep, d.asOf, {
    title: r.company
      ? `${band.label} levels, whole company`
      : titled(`${band.label} levels in ${r.group}`, scopePart(d.prep)),
    rows: r.records,
    extra: pyramidExtra(d),
    note: `${count(r.people, 'person', 'people')} at ${levelsText(band.levels)}${r.groupTotal ? `, of ${r.groupTotal.toLocaleString('en-US')} in ${r.company ? 'the company' : r.group}` : ''}.`,
  })
  if (!r.unit) return r.company ? { ...spec, subtitle: `As of ${formatDate(d.asOf)} · Whole company` } : spec
  return withFilter(
    spec,
    { ...groupFilter('businessUnit', r.unit), ...groupFilter('level', [...band.levels]) },
    `${band.label} levels in ${r.unit}`,
  )
}
