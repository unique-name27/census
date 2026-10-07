/**
 * The HR ops figures whose marks are groups of a filterable dimension (docs/FILTERS.md, part 4).
 * Their records carry the group's filter, so the records panel offers "Filter to" and "Leave out".
 * Shared by the figures and their tests.
 *
 *  - On leave now by business unit: the unit. Leaves, cases and transactions follow their
 *    person's org on the roster, as the filters do.
 *  - Final pay by jurisdiction: the sites behind the jurisdiction's exits (a jurisdiction is the
 *    set of its sites).
 *  - Retro adjustments by month: the cut-off month as a custom period. The figure shows the
 *    months of the period, so after "Filter to" the month is the whole figure.
 *  - Cases per 100 employees by business unit: the unit (its requesters' cases; "Other" is none).
 *  - On time by transaction type and quarter: the due quarter as a custom period
 *    (engine/trendDrills.ts). The cell keeps its rate, and the tab's period figures then show
 *    that quarter.
 *
 * Everything else HR ops draws is grouped by something the filters do not have (case category,
 * channel, team, transaction type, timing, Atlas measure, leave reason, quarter or month of a
 * fixed trend), so it sets no filter. Readout findings set theirs in engine/findings.ts.
 */
import { byGroup, withFilter } from '@/charts/kit/groupDrill'
import type { DrillSource } from '@/drill/Drill'
import { periodFilter } from '@/drill/filter'
import type { DrillSpec } from '@/drill/types'
import { monthEnd } from '@/lib/dates'
import {
  asOfSub,
  caseDrill,
  changesDrill,
  type DrillScope,
  isLateTx,
  monthName,
  monthSub,
  onTimeDrill,
  retroDrill,
  sitesOf,
  txOutcomeDrill,
} from '../engine/drills'
import type { TxFact } from '../engine/facts'
import { NO_UNIT, type OnLeaveRow } from '../engine/leave'
import { leaveDrill } from '../engine/leaveDrills'
import type { UnitRateRow } from '../engine/rates'
import type { FinalPayRow, RetroMonthRow } from '../engine/transactions'
import { isOther } from '../engine/util'

/** A drill title in plain words: what, then where and when. */
const titled = (...parts: (string | null | undefined | false)[]): string => parts.filter(Boolean).join(', ')

const isOnTime = (f: TxFact) => f.outcome === 'on-time'
const isCompletedLate = (f: TxFact) => f.outcome === 'late'
const isOverdue = (f: TxFact) => f.outcome === 'overdue'

type OnTimeRow = { rate: number | null; records: TxFact[] }

/**
 * Drills for a breakdown of judged transactions (by type or jurisdiction): every judged row for
 * the count and the rate, and the on-time, late and open-past-due ones for their counts. A hidden
 * rate hides its counts and their records with it. With `sites`, each one carries the location
 * filter that reproduces its row, named as the row is ("Filter to California").
 */
export function onTimeCells<T extends OnTimeRow>(
  s: DrillScope,
  noun: string,
  group: (r: T) => string,
  o: { exitType?: boolean; sites?: (r: T) => readonly string[] | null } = {},
) {
  const opts = { exitType: o.exitType }
  const sited = (build: (r: T) => DrillSource) =>
    o.sites ? byGroup('location', o.sites, build, group) : build
  const all = sited((r: T) =>
    r.rate == null ? null : () => onTimeDrill(s, r.records, titled(`${noun} due`, group(r), s.per), opts),
  )
  const some = (pick: (f: TxFact) => boolean, words: string) =>
    sited((r: T) =>
      r.rate == null || !r.records.some(pick)
        ? null
        : () => txOutcomeDrill(s, r.records, pick, titled(`${noun} ${words}`, group(r), s.per), opts),
    )
  return {
    all,
    onTime: some(isOnTime, 'on time'),
    late: some(isLateTx, 'late or open past due'),
    completedLate: some(isCompletedLate, 'completed late'),
    overdue: some(isOverdue, 'open past due'),
  }
}

/** The sites behind a jurisdiction's exits; none for the folded "Other" row. */
export const jurisdictionSites = (r: Pick<FinalPayRow, 'jurisdiction' | 'records'>): string[] | null =>
  r.jurisdiction === 'other' ? null : sitesOf(r.records)

/** Final pay by jurisdiction: its cells, and its on-time rates by exit type. */
export function finalPayCells(s: DrillScope) {
  const cells = onTimeCells<FinalPayRow>(s, 'Final pay', (r) => r.name, {
    exitType: true,
    sites: jurisdictionSites,
  })
  const byExitType = (type: 'Involuntary' | 'Voluntary') =>
    byGroup(
      'location',
      jurisdictionSites,
      (r: FinalPayRow) => {
        const rate = type === 'Involuntary' ? r.involuntaryRate : r.voluntaryRate
        return rate == null
          ? null
          : () =>
              onTimeDrill(
                s,
                r.records.filter((f) => f.exitType === type),
                titled(`Final pay due, ${type.toLowerCase()} exits`, r.name, s.per),
                { exitType: true },
              )
      },
      (r) => r.name,
    )
  return { ...cells, byExitType }
}

/** The cut-off month of a retro bar as a custom period ("Filter to Mar 2026"). */
export const monthPeriod = (month: string) => periodFilter(`${month}-01`, monthEnd(`${month}-01`))

const inMonth =
  (month: string) =>
  (build: () => DrillSpec | null): (() => DrillSpec | null) =>
  () => {
    const spec = build()
    return spec ? withFilter(spec, monthPeriod(month)) : null
  }

/** Retro adjustments by cut-off month: the retro adjustments, and every job and pay change. */
export function retroCells(s: DrillScope) {
  const retro = (d: RetroMonthRow): DrillSource =>
    d.share == null
      ? null
      : inMonth(d.month)(() =>
          retroDrill(
            s,
            d.records,
            titled('Retro adjustments', `${monthName(d.month)} cut-off`),
            monthSub(s, d.month),
          ),
        )
  const changes = (d: RetroMonthRow): DrillSource =>
    d.share == null
      ? null
      : inMonth(d.month)(() =>
          changesDrill(
            s,
            d.records,
            titled('Job and pay changes', `${monthName(d.month)} cut-off`),
            monthSub(s, d.month),
          ),
        )
  return { retro, changes }
}

/** A unit that is no business unit ("Unknown business unit"; "Other (k)" is caught by the filter). */
const unitOf = (r: Pick<OnLeaveRow, 'unit'>): string | null => (r.unit === NO_UNIT ? null : r.unit)

/**
 * A reason segment within a business unit: its grouped counts (never named people) carry the unit
 * as their filter, so after "Filter to" the segment keeps its number beside the unit's other
 * reasons, as a worker type does within a site on People stats.
 */
export const leaveUnitSegment = <T extends Pick<OnLeaveRow, 'unit'>>(build: (r: T) => DrillSource) =>
  byGroup('businessUnit', unitOf, build)

/** The people on leave now in one business unit (its bar, or its one segment without reasons). */
export function onLeaveUnitDrill(
  s: DrillScope,
): (r: Pick<OnLeaveRow, 'unit' | 'unitRecords'>) => DrillSource {
  return byGroup(
    'businessUnit',
    unitOf,
    (r: Pick<OnLeaveRow, 'unit' | 'unitRecords'>) => () =>
      leaveDrill(s, r.unitRecords, {
        title: `On leave now, ${r.unit}`,
        subtitle: asOfSub(s),
        columns: ['expected', 'days'],
        order: (a, b) => a.start.localeCompare(b.start),
      }),
  )
}

/**
 * The cases behind a business unit's cases per 100 employees, filtered to the unit ("Filter to
 * Operations"); the folded "Other (k)" opens without a filter. Employee relations cases are counted
 * in the note, never listed.
 */
export function unitCasesDrill(s: DrillScope): (r: UnitRateRow) => DrillSource {
  return byGroup(
    'businessUnit',
    (r: UnitRateRow) => (isOther(r.unit) ? null : r.unit),
    (r: UnitRateRow) =>
      r.rate == null ? null : () => caseDrill(s, r.records, { title: titled('Cases opened', r.unit, s.per) }),
  )
}
