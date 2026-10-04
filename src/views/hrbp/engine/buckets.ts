/**
 * Drill specs for every chart bucket, table cell and tile of the HR business partner view: the
 * engine rows already carry their records, so each builder only picks them and labels them.
 * Pure; returns null when a bucket is hidden (n < 5) or has nothing behind it, so no click opens
 * an empty or suppressed list.
 */
import type { Employee, JobChange } from '@/data/schema'
import { MIN_GROUP, RATING_LABELS } from '@/data/schema'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { addDays, addMonths, formatDate, formatMonth, formatRange } from '@/lib/dates'
import { isActiveAt } from '@/lib/people'
import {
  type AttritionDim,
  type AttritionModel,
  COMPANY_SERIES,
  type ExitType,
  type GroupRateRow,
  leaversIn,
  NOT_RATED,
  type QuarterExitRow,
  type ReasonRow,
  type RegrettedQuarterRow,
  type TypedCountRow,
} from './attrition'
import { type Prep, possessive, quoted } from './base'
import {
  changesSpec,
  employeesOnSpec,
  firstYearSpec,
  growthSpec,
  hiresSpec,
  joinedLeftSpec,
  LEAVER_HIDE,
  layeredSpec,
  leaversSpec,
  managersSpec,
  periodName,
  rateNote,
  scopeLine,
  scopePart,
  shareNote,
  titled,
  workersSpec,
} from './drill'
import {
  type DeptMoveRow,
  type LevelRateRow,
  type MovementModel,
  type PromotionQuarterRow,
  type SincePromotionRow,
  yearsSincePromotion,
} from './movement'
import type { ChainRow, LayerRow, ManagerRow, OrgModel, SpanBucketRow } from './org'
import type { ScoreRow } from './scorecard'
import type { BridgeRow, CountRow, FlowRow, GrowthRow, MixRow } from './workforce'
import { NO_LEVEL } from './workforce'

type Spec = DrillSpec | null
const n = (v: number): string => v.toLocaleString('en-US')
const yearAgoOf = (p: Prep) => addDays(p.t12.start, -1)

/* ───────── workforce ───────── */

export type CountDim = 'department' | 'location' | 'businessUnit' | 'level' | 'tenure'

const COUNT_TITLE: Record<CountDim, (label: string) => string> = {
  department: (l) => `Employees in ${l}`,
  location: (l) => `Employees in ${l}`,
  businessUnit: (l) => `Employees in ${l}`,
  level: (l) => (l === NO_LEVEL ? 'Employees with no level recorded' : `Employees at level ${l}`),
  tenure: (l) =>
    l.startsWith('Under') ? `Employees with ${l.toLowerCase()} of tenure` : `Employees with ${l} of tenure`,
}
const COUNT_PLURAL: Record<CountDim, string> = {
  department: 'departments',
  location: 'locations',
  businessUnit: 'business units',
  level: 'levels',
  tenure: 'tenure bands',
}

/** A headcount bar or cell: the employees in the group today. */
export function countSpec(p: Prep, dim: CountDim, row: CountRow): Spec {
  if (!row.records.length) return null
  return employeesOnSpec(p, p.asOf, { title: COUNT_TITLE[dim](row.label), rows: row.records })
}

/** The "Other (k)" bar of a headcount chart: the employees in the folded groups. */
export function countOtherSpec(p: Prep, dim: CountDim, rows: readonly CountRow[]): Spec {
  const records = rows.flatMap((r) => r.records)
  if (!records.length) return null
  return employeesOnSpec(p, p.asOf, {
    title: `Employees in the ${rows.length} smaller ${COUNT_PLURAL[dim]}`,
    rows: records,
    note: `Groups folded into Other: ${rows.map((r) => r.label).join(', ')}.`,
  })
}

/** One worker type in one site or business unit. */
export function mixSpec(p: Prep, row: MixRow): Spec {
  if (!row.records.length) return null
  return workersSpec(p, `${row.workerType} in ${row.group}`, row.records)
}

/** Every contractor and intern in a site or business unit (the whole bar). */
export function mixGroupSpec(p: Prep, rows: readonly MixRow[], group: string): Spec {
  const records = rows.filter((r) => r.group === group).flatMap((r) => r.records)
  if (!records.length) return null
  return workersSpec(p, `Contractors and interns in ${group}`, records)
}

export type GrowthCell = 'yearAgo' | 'now' | 'change' | 'growth'

/** A growth bar or table cell: the employees then, now, or who joined and left in between. */
export function growthCellSpec(p: Prep, row: GrowthRow, cell: GrowthCell): Spec {
  if (cell === 'yearAgo') {
    if (!row.records.before.length) return null
    const d = yearAgoOf(p)
    return employeesOnSpec(p, d, {
      title: `Employees in ${row.group} on ${formatDate(d)}`,
      rows: row.records.before,
    })
  }
  if (cell === 'now') {
    if (!row.records.now.length) return null
    return employeesOnSpec(p, p.asOf, {
      title: `Employees in ${row.group} on ${formatDate(p.asOf)}`,
      rows: row.records.now,
    })
  }
  return growthSpec(p, row)
}

/** Engineering or the other functions (none while the share is hidden). */
export function engineeringSpec(p: Prep, row: { group: string; records: Employee[] }): Spec {
  if (!row.records.length) return null
  return employeesOnSpec(p, p.asOf, {
    title:
      row.group === 'Engineering' ? 'Employees in engineering departments' : 'Employees in other functions',
    rows: row.records,
  })
}

/** Hires or leavers in one month (a segment of the monthly flows). */
export function flowSpec(p: Prep, row: FlowRow): Spec {
  if (!row.records.length) return null
  const when = formatMonth(`${row.month}-01`)
  return row.series === 'Hires'
    ? hiresSpec(p, `Hires, ${when}`, row.records, { when })
    : leaversSpec(p, `Leavers, ${when}`, row.records, { when })
}

/** Everyone hired or leaving in a month (the whole month), once each. */
export function flowMonthSpec(p: Prep, rows: readonly FlowRow[], month: string): Spec {
  const hired = rows.find((r) => r.month === month && r.series === 'Hires')?.records ?? []
  const left = rows.find((r) => r.month === month && r.series === 'Exits')?.records ?? []
  if (!hired.length && !left.length) return null
  const hiredIds = new Set(hired.map((e) => e.employeeId))
  const leftIds = new Set(left.map((e) => e.employeeId))
  const people = [...hired, ...left.filter((e) => !hiredIds.has(e.employeeId))]
  const when = formatMonth(`${month}-01`)
  return drillSpec({
    kind: 'employees',
    title: `Hires and leavers, ${when}`,
    subtitle: scopeLine(p, when),
    rows: people,
    hide: ['employmentType'],
    note: `${n(hired.length)} hired and ${n(left.length)} left.`,
    extra: {
      columns: [{ key: 'movement', label: 'Movement', format: 'text' }],
      values: (e) => ({
        movement: hiredIds.has(e.employeeId)
          ? leftIds.has(e.employeeId)
            ? 'Hired and left'
            : 'Hired'
          : 'Left',
      }),
    },
  })
}

/** A step of the headcount bridge. */
export function bridgeSpec(p: Prep, row: BridgeRow): Spec {
  if (!row.records.length) return null
  const t12 = p.t12.label
  switch (row.key) {
    case 'start':
      return employeesOnSpec(p, yearAgoOf(p), { rows: row.records })
    case 'hires':
      return hiresSpec(p, 'Hires, last 12 months', row.records, { when: t12 })
    case 'exits':
      return leaversSpec(p, 'Leavers, last 12 months', row.records, { when: t12 })
    case 'other': {
      const joined = row.records.filter((e) => isActiveAt(e, p.asOf))
      const left = row.records.filter((e) => !isActiveAt(e, p.asOf))
      return joinedLeftSpec(p, 'Other changes, last 12 months', joined, left, {
        when: t12,
        note: 'On one roster date and not the other, without a hire or exit in between (rehires, conversions, records moved in or out).',
      })
    }
    default:
      return employeesOnSpec(p, p.asOf, { rows: row.records })
  }
}

/* ───────── scorecard ───────── */

export type ScoreCell =
  | 'headcount'
  | 'netChange'
  | 'voluntary'
  | 'regretted'
  | 'firstYear'
  | 'promotionRate'
  | 'avgSpan'

/** A scorecard cell: the records behind that org's number (none for a hidden value). */
export function scoreSpec(p: Prep, row: ScoreRow, cell: ScoreCell): Spec {
  const r = row.records
  const org = row.label
  const period = periodName(p)
  switch (cell) {
    case 'headcount':
      return r.active.length
        ? employeesOnSpec(p, p.asOf, { title: titled('Employees', org), rows: r.active })
        : null
    case 'netChange':
      if (row.netChange == null || (!r.joined.length && !r.left.length)) return null
      return joinedLeftSpec(p, titled('Joined and left', org, 'last 12 months'), r.joined, r.left, {
        when: p.t12.label,
        note: `Net change = ${n(r.joined.length)} joined − ${n(r.left.length)} left.`,
      })
    case 'voluntary':
      if (row.voluntary == null) return null
      return leaversSpec(p, titled('Voluntary leavers', org, period), r.voluntary, {
        note: rateNote(
          r.voluntary.length,
          ['voluntary exit', 'voluntary exits'],
          r.avgHeadcount,
          p.window.months,
        ),
      })
    case 'regretted':
      if (row.regretted == null) return null
      return leaversSpec(p, titled('Regretted leavers', org, period), r.regretted, {
        note: rateNote(
          r.regretted.length,
          ['regretted exit', 'regretted exits'],
          r.avgHeadcount,
          p.window.months,
        ),
      })
    case 'firstYear':
      if (row.firstYear == null) return null
      return firstYearSpec(
        p,
        titled('Left within their first year', org),
        r.firstYear,
        { size: r.cohort, from: addDays(addMonths(p.asOf, -24), 1), to: addMonths(p.asOf, -12) },
        `${org} · ${p.ctx.scopeLabel}`,
      )
    case 'promotionRate':
      if (row.promotionRate == null) return null
      return changesSpec(p, titled('Promotions', org, period), r.promotions, {
        note: shareNote(r.promotions.length, ['promotion', 'promotions'], r.avgHeadcount),
      })
    case 'avgSpan': {
      if (row.avgSpan == null || !r.managers.length) return null
      const directs = r.managers.reduce((s, m) => s + m.directs, 0)
      return managersSpec(p, titled('Managers', org), r.managers, {
        note: `Average span = ${n(directs)} direct reports ÷ ${n(r.managers.length)} managers.`,
      })
    }
  }
}

/* ───────── attrition ───────── */

const TYPE_LEAVERS: Record<ExitType, string> = {
  Voluntary: 'Voluntary leavers',
  Involuntary: 'Involuntary leavers',
  'Not recorded': 'Leavers with no exit type',
}

/** A quarter's exits: one exit type (a segment) or every type (the whole column). */
export function quarterExitSpec(p: Prep, rows: readonly QuarterExitRow[]): Spec {
  const first = rows[0]
  // A hidden quarter (average headcount under 5) has no records to show.
  if (!first || rows.some((r) => r.rate == null)) return null
  const records = rows.flatMap((r) => r.records)
  if (!records.length) return null
  const what = rows.length === 1 ? TYPE_LEAVERS[first.type] : 'Leavers'
  return leaversSpec(p, `${what}, ${first.quarter}`, records, {
    when: formatRange(first.start, first.end),
    note: rateNote(records.length, ['exit', 'exits'], first.avgHeadcount, 3),
  })
}

/** Regretted leavers in one quarter, for this scope or for the company. */
export function regrettedQuarterSpec(p: Prep, row: RegrettedQuarterRow, start: string): Spec {
  if (row.rate == null || !row.records.length) return null
  const company = row.series === COMPANY_SERIES
  const when = formatRange(start, row.quarterEnd)
  return leaversSpec(p, titled('Regretted leavers', company && 'company', row.quarter), row.records, {
    subtitle: company ? `${when} · Whole company` : scopeLine(p, when),
    note: rateNote(row.records.length, ['regretted exit', 'regretted exits'], row.avgHeadcount, 3),
  })
}

/** Voluntary leavers who gave one reason. */
export function reasonSpec(p: Prep, row: ReasonRow): Spec {
  if (!row.records.length) return null
  return leaversSpec(p, titled(`Voluntary leavers citing ${quoted(row.reason)}`, periodName(p)), row.records)
}

const groupName = (dim: AttritionDim, group: string) =>
  dim === 'level' ? (group === NO_LEVEL ? 'no level recorded' : `level ${group}`) : group

/**
 * The leavers behind a group's attrition rate: every exit, or the voluntary ones. Null for a
 * group too small to show its rate.
 */
export function groupExitSpec(p: Prep, dim: AttritionDim, row: GroupRateRow, voluntaryOnly: boolean): Spec {
  const rate = voluntaryOnly ? row.voluntaryRate : row.rate
  if (rate == null || !row.leavers.length) return null
  const rows = voluntaryOnly ? row.leavers.filter((e) => e.terminationType === 'Voluntary') : row.leavers
  if (!rows.length) return null
  return leaversSpec(
    p,
    titled(voluntaryOnly ? 'Voluntary leavers' : 'Leavers', groupName(dim, row.group), periodName(p)),
    rows,
    {
      note: rateNote(
        rows.length,
        voluntaryOnly ? ['voluntary exit', 'voluntary exits'] : ['exit', 'exits'],
        row.avgHeadcount,
        p.window.months,
      ),
    },
  )
}

/** The "Other (k)" bar of a group rate chart: leavers in the folded groups, when they reach 5 together. */
export function groupOtherSpec(
  p: Prep,
  a: Pick<AttritionModel, 'leavers'>,
  dim: AttritionDim,
  rows: readonly GroupRateRow[],
  voluntaryOnly: boolean,
): Spec {
  const avg = rows.reduce((s, r) => s + r.avgHeadcount, 0)
  if (avg < MIN_GROUP) return null
  const all = leaversIn(
    a,
    dim,
    rows.map((r) => r.group),
  )
  const records = voluntaryOnly ? all.filter((e) => e.terminationType === 'Voluntary') : all
  if (!records.length) return null
  const plural = dim === 'department' ? 'departments' : dim === 'location' ? 'locations' : 'levels'
  return leaversSpec(
    p,
    titled(
      `${voluntaryOnly ? 'Voluntary leavers' : 'Leavers'} in the ${rows.length} smaller ${plural}`,
      periodName(p),
    ),
    records,
    {
      note: `${rateNote(
        records.length,
        voluntaryOnly ? ['voluntary exit', 'voluntary exits'] : ['exit', 'exits'],
        avg,
        p.window.months,
      )} Groups: ${rows.map((r) => r.group).join(', ')}.`,
    },
  )
}

const ratingWords = (r: number | null | undefined): string =>
  r == null || !RATING_LABELS[Math.round(r)] ? '—' : `${Math.round(r)} ${RATING_LABELS[Math.round(r)]}`

/** Exits by tenure band or by last rating: one exit type (a segment) or every type (the column). */
export function typedCountSpec(
  p: Prep,
  a: Pick<AttritionModel, 'lastRating'>,
  by: 'tenure' | 'rating',
  rows: readonly TypedCountRow[],
): Spec {
  const first = rows[0]
  const records = rows.flatMap((r) => r.records)
  if (!first || !records.length) return null
  const what = rows.length === 1 ? TYPE_LEAVERS[first.type] : 'Leavers'
  const group =
    by === 'tenure'
      ? `${first.group.startsWith('Under') ? first.group.toLowerCase() : first.group} of tenure at exit`
      : first.group === NOT_RATED
        ? 'not rated before leaving'
        : `last rated ${first.group}`
  return leaversSpec(p, titled(what, group, periodName(p)), records, {
    extra:
      by === 'rating'
        ? {
            columns: [{ key: 'lastRating', label: 'Last rating', format: 'text' }],
            values: (e) => ({ lastRating: ratingWords(a.lastRating.get(e.employeeId)) }),
          }
        : undefined,
  })
}

/** Regretted leavers who reported to one manager (a manager cell in the regretted leavers table). */
export function managerRegrettedSpec(p: Prep, a: Pick<AttritionModel, 'regretted'>, managerId: string): Spec {
  if (!managerId) return null
  const rows = a.regretted.filter((e) => e.managerId === managerId)
  if (!rows.length) return null
  return leaversSpec(
    p,
    titled(`Regretted leavers from ${possessive(p.name(managerId))} team`, periodName(p)),
    rows,
  )
}

/* ───────── movement ───────── */

/** The movement tiles. */
export function movementTileSpec(
  p: Prep,
  mv: MovementModel,
  tile: 'promotions' | 'promotionRate' | 'moves' | 'mobility' | 'demotions',
): Spec {
  const scope = scopePart(p)
  const period = periodName(p)
  const r = mv.records
  switch (tile) {
    case 'promotions':
      return changesSpec(p, titled('Promotions', scope, period), r.promotions)
    case 'promotionRate':
      if (mv.promotions.rate == null) return null
      return changesSpec(p, titled('Promotions', scope, period), r.promotions, {
        note: shareNote(mv.promotions.promotions, ['promotion', 'promotions'], mv.promotions.avgHeadcount),
      })
    case 'moves':
      return changesSpec(
        p,
        titled('Transfers and lateral moves', scope, period),
        [...r.transfers, ...r.lateral],
        {
          note: `${n(r.transfers.length)} transfers and ${n(r.lateral.length)} lateral moves.`,
        },
      )
    case 'demotions':
      return changesSpec(p, titled('Demotions', scope, period), r.demotions)
    case 'mobility': {
      if (mv.mobility.rate == null) return null
      const moves = new Map<string, JobChange[]>()
      for (const c of [...r.promotions, ...r.transfers, ...r.lateral]) {
        const arr = moves.get(c.employeeId)
        if (arr) arr.push(c)
        else moves.set(c.employeeId, [c])
      }
      return drillSpec({
        kind: 'employees',
        title: titled('People who moved', scope, period),
        subtitle: scopeLine(p),
        rows: r.movers,
        hide: ['employmentType'],
        note: shareNote(r.movers.length, ['person', 'people'], mv.promotions.avgHeadcount),
        extra: {
          columns: [
            { key: 'moves', label: 'Moves', format: 'int' },
            { key: 'latestMove', label: 'Latest move', format: 'text' },
          ],
          values: (e) => {
            const list = moves.get(e.employeeId) ?? []
            const latest = list.reduce<JobChange | null>(
              (best, c) => (!best || c.effectiveDate > best.effectiveDate ? c : best),
              null,
            )
            return {
              moves: list.length,
              latestMove: latest ? `${latest.changeType}, ${formatDate(latest.effectiveDate)}` : null,
            }
          },
        },
      })
    }
  }
}

/** Promotions in one quarter. */
export function promotionQuarterSpec(p: Prep, row: PromotionQuarterRow): Spec {
  if (row.rate == null || !row.records.length) return null
  return changesSpec(p, `Promotions, ${row.quarter}`, row.records, {
    when: formatRange(row.start, row.end),
    note: shareNote(row.promotions, ['promotion', 'promotions'], row.avgHeadcount),
  })
}

/** Promotions from one level. */
export function promotionLevelSpec(p: Prep, row: LevelRateRow): Spec {
  if (row.rate == null || !row.records.length) return null
  return changesSpec(
    p,
    titled(`Promotions from ${groupName('level', row.level)}`, periodName(p)),
    row.records,
    {
      note: shareNote(row.promotions, ['promotion', 'promotions'], row.avgHeadcount),
    },
  )
}

/** Transfers or lateral moves into one department: one type (a segment) or both (the bar). */
export function deptMoveSpec(p: Prep, rows: readonly DeptMoveRow[]): Spec {
  const first = rows[0]
  const records = rows.flatMap((r) => r.records)
  if (!first || !records.length) return null
  const what =
    rows.length === 1
      ? first.type === 'Transfer'
        ? 'Transfers'
        : 'Lateral moves'
      : 'Transfers and lateral moves'
  return changesSpec(p, titled(`${what} into ${first.department}`, periodName(p)), records)
}

/** Employees by time since their last promotion. */
export function sinceSpec(p: Prep, row: SincePromotionRow): Spec {
  if (!row.records.length) return null
  if (row.band === 'Never promoted') {
    return employeesOnSpec(p, p.asOf, {
      title: 'Employees never promoted',
      rows: row.records,
      note: 'No Promotion event on record since hire, including people hired recently.',
    })
  }
  return employeesOnSpec(p, p.asOf, {
    title: `Employees last promoted ${row.band.startsWith('Under') ? row.band.toLowerCase() : row.band} ago`,
    rows: row.records,
    extra: {
      columns: [
        { key: 'lastPromotion', label: 'Last promotion', format: 'date' },
        { key: 'yearsSince', label: 'Years since', format: 'years' },
      ],
      values: (e) => ({
        lastPromotion: p.history.lastPromotion(e.employeeId, p.asOf),
        yearsSince: yearsSincePromotion(p, e),
      }),
    },
  })
}

/* ───────── org design ───────── */

/** The org design tiles: managers, spans, manager ratio and layers. */
export function orgTileSpec(
  p: Prep,
  org: OrgModel,
  tile: 'managers' | 'meanSpan' | 'medianSpan' | 'managerRatio' | 'layers',
): Spec {
  const scope = scopePart(p)
  const managers = org.managers
  if (tile === 'managerRatio') {
    if (org.managerRatio == null) return null
    return workersSpec(
      p,
      titled('Individual contributors', scope),
      org.individuals,
      `Ratio = ${n(org.individuals.length)} individual contributors ÷ ${n(managers.length)} managers.`,
    )
  }
  if (tile === 'layers') {
    if (org.layers == null) return null
    const deepest = p.people.filter((e) => org.layerOf.get(e.employeeId) === org.layers)
    return layeredSpec(
      p,
      titled('People on the deepest layer', scope),
      deepest,
      org.layerOf,
      `The deepest reporting chain has ${org.layers} layers. Layer 1 is the top of the group.`,
    )
  }
  if (!managers.length) return null
  const directs = managers.reduce((s, m) => s + m.directs, 0)
  const note =
    tile === 'meanSpan'
      ? `Mean span = ${n(directs)} direct reports ÷ ${n(managers.length)} managers.`
      : tile === 'medianSpan'
        ? `Median span = the middle value of the Direct reports column (${org.medianSpan ?? '—'}).`
        : 'Active people in scope with at least one active direct report.'
  return managersSpec(p, titled('Managers', scope), managers, { note })
}

const SPAN_WORDS: Record<string, string> = {
  '1': 'a single direct report',
  '2': '2 direct reports',
  '3-5': '3 to 5 direct reports',
  '6-8': '6 to 8 direct reports',
  '9-11': '9 to 11 direct reports',
  '12+': '12 or more direct reports',
}

/** Managers in one span bucket. */
export function spanBucketSpec(p: Prep, row: SpanBucketRow): Spec {
  if (!row.records.length) return null
  return managersSpec(
    p,
    `Managers with ${SPAN_WORDS[row.bucket] ?? `${row.bucket} direct reports`}`,
    row.records,
  )
}

/** Active workers in a business unit with their layer inside it. */
export function layerBuSpec(p: Prep, org: OrgModel, row: LayerRow): Spec {
  if (!row.records.length) return null
  return layeredSpec(
    p,
    `Active workers in ${row.businessUnit}`,
    row.records,
    org.buLayerOf,
    `${row.businessUnit} has ${row.layers} layers. Layer 1 is the unit's top person.`,
  )
}

export type ManagerCell = 'directs' | 'totalOrg' | 'regretted12'

/** A manager table cell: their direct reports, their whole org, or their regretted leavers. */
export function managerCellSpec(p: Prep, org: OrgModel, m: ManagerRow, cell: ManagerCell): Spec {
  if (cell === 'directs')
    return m.reports.length ? workersSpec(p, `Direct reports of ${m.name}`, m.reports) : null
  if (cell === 'totalOrg') {
    const rows = org.peopleBelow(m.managerId)
    return rows.length ? workersSpec(p, `Everyone in ${possessive(m.name)} org`, rows) : null
  }
  if (!m.regrettedLeavers.length) return null
  return drillSpec({
    kind: 'employees',
    title: `Regretted leavers from ${possessive(m.name)} team, last 12 months`,
    subtitle: scopeLine(p, p.t12.label),
    rows: m.regrettedLeavers,
    hide: LEAVER_HIDE,
  })
}

/** Everyone below the only direct report of a single-report chain. */
export function chainBelowSpec(p: Prep, org: OrgModel, c: ChainRow): Spec {
  const rows = org.peopleBelow(c.reportId)
  return rows.length ? workersSpec(p, `People below ${c.report}`, rows) : null
}
