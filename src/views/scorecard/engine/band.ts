/**
 * The Scorecard's chart band (docs/DESIGN-REFRESH.md 4.1, docs/ROLES.md 2.1, docs/CHARTS.md
 * Scorecard): targets met as a status split, every measure against its target (in practice order
 * or furthest from target first), voluntary attrition by business unit against the company, and
 * voluntary and regretted attrition by quarter. Read from the scorecard model and People stats'
 * model, both already computed for the context, so nothing is counted a second way. Pure.
 */
import type { SplitKey } from '@/charts/kit/bulletModel'
import type { Column } from '@/charts/types'
import type { Employee, ISODate } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import { type Format, fmt, MINUS } from '@/lib/format'
import type { HrbpModel } from '@/views/hrbp/engine'
import { SCOPE_SERIES } from '@/views/hrbp/engine/attrition'
import type { Prep } from '@/views/hrbp/engine/base'
import { exitsByGroup, type GroupOptions } from '@/views/hrbp/engine/rates'
import type { ScoreCounts, ScorecardModel, ScoreRow } from './model'
import { isShareFormat, type ScoreStatus, STATUS_WORD } from './status'

/* ───────── targets met ───────── */

/** The status split's counts: met, watch, missed, no target, and not shown ("—"). */
export function standingCounts(c: ScoreCounts): Record<SplitKey, number> {
  return { met: c.met, watch: c.watch, missed: c.missed, none: c.noTarget, hidden: c.unknown }
}

/** The status a split segment stands for. */
export const SPLIT_STATUS: Record<SplitKey, ScoreStatus> = {
  met: 'met',
  watch: 'watch',
  missed: 'missed',
  none: 'none',
  hidden: 'unknown',
}

/* ───────── measures against target ───────── */

export type MeasureOrder = 'practice' | 'gap'

export interface MeasureRow {
  id: string
  practice: string
  measure: string
  /** The value judged (null when missing, hidden by the data standard or for anonymity). */
  value: number | null
  /** The target in the value's unit, or null (none, or not comparable). */
  target: number | null
  format: Format
  status: ScoreStatus
  statusWord: string
  valueText: string
  targetText: string
  /** Signed distance from target in the value's unit: below zero misses ("−6.9 pts", "+7 d"). */
  gap: number | null
  gapText: string
  /** Why the value reads "—", when it does. */
  hiddenReason: string | null
  metricId: string | null
  row: ScoreRow
}

/**
 * How far a value sits from its target, signed so that below zero is short of it, in the value's
 * own unit (a share's points as a fraction). Null without a value or a comparable target.
 */
export function signedGap(row: Pick<ScoreRow, 'target' | 'kpi' | 'shown'>): number | null {
  const t = row.target
  const v = row.shown && !row.kpi.suppressed ? row.kpi.value : null
  if (!t || v == null || !Number.isFinite(v)) return null
  return t.comparator === '>=' ? v - t.value : t.value - v
}

/** "+2.1 pts", "−7 d", "+3": the gap as the measure's unit prints it. */
export function gapText(gap: number | null, format: Format): string {
  if (gap == null) return ''
  if (isShareFormat(format)) return fmt(gap, 'pts')
  if (format === 'days') return fmt(gap, 'deltaDays')
  const plain = format === 'num1' || format === 'num2' || format === 'ratio' ? format : 'int'
  const text = fmt(Math.abs(gap), plain)
  return gap > 0 ? `+${text}` : gap < 0 ? `${MINUS}${text}` : `±${text}`
}

export function measureRow(r: ScoreRow): MeasureRow {
  const gap = signedGap(r)
  return {
    id: r.id,
    practice: r.practice,
    measure: r.kpi.label,
    value: r.shown && !r.kpi.suppressed ? r.kpi.value : null,
    target: r.target?.value ?? null,
    format: r.kpi.format,
    status: r.status,
    statusWord: STATUS_WORD[r.status],
    valueText: r.valueText,
    targetText: r.targetText,
    gap,
    gapText: gapText(gap, r.kpi.format),
    hiddenReason: r.hiddenReason,
    metricId: r.metricId,
    row: r,
  }
}

/**
 * The measures "Gap to target" draws and the ones it can't (CHARTS.md, Gap to target): share
 * measures with a value and a target, by their gap in points, the furthest miss first; measures
 * in other units (days, counts, scores), whose gaps don't compare with points, in scorecard order;
 * and the rest, with no value shown or no target.
 */
export interface GapRows {
  shares: MeasureRow[]
  otherUnits: MeasureRow[]
  rest: MeasureRow[]
}

export function gapRows(model: Pick<ScorecardModel, 'rows'>): GapRows {
  const rows = model.rows.map(measureRow)
  const at = new Map(rows.map((r, i) => [r.id, i]))
  const shares = rows
    .filter((r) => r.gap != null && isShareFormat(r.format))
    .sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0) || (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0))
  return {
    shares,
    otherUnits: rows.filter((r) => r.gap != null && !isShareFormat(r.format)),
    rest: rows.filter((r) => r.gap == null),
  }
}

/**
 * "Median time to fill, 52 d against at most 45 d": a measure the gap chart leaves to the table,
 * as the note names it.
 */
export const otherUnitText = (r: MeasureRow): string =>
  `${r.measure}, ${r.valueText} against ${r.targetText.charAt(0).toLowerCase()}${r.targetText.slice(1)}`

/**
 * Every measure on the scorecard: by practice in folder-tab order (as the table lists them), or
 * as "Gap to target" orders them: share measures furthest from target first, then measures in
 * other units, then those without a value or target.
 */
export function measureRows(
  model: Pick<ScorecardModel, 'rows'>,
  order: MeasureOrder = 'practice',
): MeasureRow[] {
  if (order === 'practice') return model.rows.map(measureRow)
  const g = gapRows(model)
  return [...g.shares, ...g.otherUnits, ...g.rest]
}

/** Measures by status, in the scorecard's order (a status split segment's list). */
export const measuresWith = (model: Pick<ScorecardModel, 'rows'>, status: ScoreStatus): MeasureRow[] =>
  model.rows.filter((r) => r.status === status).map(measureRow)

/* ───────── attrition by quarter ───────── */

export const VOLUNTARY = 'Voluntary'
export const REGRETTED = 'Regretted'

export interface QuarterRateRow {
  /** First day of the quarter's three months (the drill's period and "Filter to"). */
  quarterStart: ISODate
  quarterEnd: ISODate
  quarter: string
  series: typeof VOLUNTARY | typeof REGRETTED
  /** Exits of the kind in the quarter (the leavers behind the rate). */
  exits: number
  avgHeadcount: number
  /** Annualized (unless that setting is off); null under the anonymity minimum. */
  rate: number | null
  records: Employee[]
}

/**
 * Voluntary and regretted attrition per quarter for the scope, the last 8 quarters: People stats'
 * own quarter rows (the Attrition tab's charts), one line each.
 */
export function attritionByQuarter(m: HrbpModel): QuarterRateRow[] {
  // Every exit type shares one set of quarter blocks: their starts, by quarter end.
  const startOf = new Map(m.attrition.quarters.map((q) => [q.end, q.start]))
  const vol = m.attrition.quarters
    .filter((q) => q.type === 'Voluntary')
    .map((q) => ({
      quarterStart: q.start,
      quarterEnd: q.end,
      quarter: q.quarter,
      series: VOLUNTARY as typeof VOLUNTARY,
      exits: q.exits,
      avgHeadcount: q.avgHeadcount,
      rate: q.rate,
      records: q.records,
    }))
  const reg = m.attrition.regrettedByQuarter
    .filter((q) => q.series === SCOPE_SERIES)
    .map((q) => ({
      quarterStart: startOf.get(q.quarterEnd) ?? addMonths(`${q.quarterEnd.slice(0, 7)}-01`, -2),
      quarterEnd: q.quarterEnd,
      quarter: q.quarter,
      series: REGRETTED as typeof REGRETTED,
      exits: q.regretted,
      avgHeadcount: q.avgHeadcount,
      rate: q.rate,
      records: q.records,
    }))
  return [...vol, ...reg]
}

/* ───────── voluntary attrition by business unit ───────── */

export interface UnitRateRow {
  group: string
  avgHeadcount: number
  voluntary: number
  /** Annualized voluntary attrition; null under the anonymity minimum. */
  rate: number | null
  /** At least the readout rule's gap above the company, in a unit large enough for the rule. */
  above: boolean
  /** The voluntary leavers behind the rate; empty when the rate is hidden. */
  leavers: Employee[]
}

/**
 * Voluntary attrition per business unit over the window, with People stats' definition and
 * settings (`exitsByGroup`, annualized, the anonymity minimum), and the company rate the units are
 * read against. A unit is marked when it is at least the "Voluntary attrition above the company"
 * rule's gap above it and its average headcount reaches the rule's minimum.
 */
export function voluntaryByUnit(m: HrbpModel): { rows: UnitRateRow[]; company: number | null } {
  const p: Prep = m.prep
  const company = m.attrition.company.voluntary
  const { gap, minAvgHeadcount } = p.set.voluntaryAbove
  const opts: GroupOptions = { counts: p.counts, isRegretted: p.isRegretted }
  const typed = p.has.terminationDate && p.has.terminationType
  const groups = exitsByGroup(p.emps, p.window, (e) => e.businessUnit || 'Not recorded', undefined, opts)
  const rows = [...groups.values()].map((g): UnitRateRow => {
    const rate = typed ? p.rate(g.voluntary, g.avgHeadcount, p.window) : null
    return {
      group: g.key,
      avgHeadcount: g.avgHeadcount,
      voluntary: g.voluntary,
      rate,
      above:
        rate != null && company != null && rate - company >= gap - 1e-12 && g.avgHeadcount >= minAvgHeadcount,
      leavers: rate == null ? [] : g.leavers.filter((e) => e.terminationType === 'Voluntary'),
    }
  })
  rows.sort(
    (a, b) =>
      (b.rate ?? -1) - (a.rate ?? -1) || b.avgHeadcount - a.avgHeadcount || a.group.localeCompare(b.group),
  )
  return { rows, company }
}

/* ───────── targets met by practice (the monthly report's first slide) ───────── */

export interface PracticeStandingRow {
  practice: string
  met: number
  watch: number
  missed: number
  noTarget: number
  notShown: number
  /** "2 of 3", or "—" when no measure is judged. */
  targetsMet: string
}

/** Each practice's measures by status, in folder-tab order (ROLES.md 2.1, the report's slide). */
export function practiceStanding(model: Pick<ScorecardModel, 'practices'>): PracticeStandingRow[] {
  return model.practices.map((p) => {
    const n = (s: ScoreStatus) => p.rows.filter((r) => r.status === s).length
    return {
      practice: p.label,
      met: n('met'),
      watch: n('watch'),
      missed: n('missed'),
      noTarget: n('none'),
      notShown: n('unknown'),
      targetsMet: p.judged ? `${p.met} of ${p.judged}` : '—',
    }
  })
}

/** The slide's columns. */
export const PRACTICE_STANDING_COLUMNS: Column[] = [
  { key: 'practice', label: 'Practice', format: 'text' },
  { key: 'targetsMet', label: 'Targets met', format: 'text', align: 'right' },
  { key: 'met', label: 'Met', format: 'int' },
  { key: 'watch', label: 'Watch', format: 'int' },
  { key: 'missed', label: 'Missed', format: 'int' },
  { key: 'noTarget', label: 'No target', format: 'int' },
  { key: 'notShown', label: 'Not shown', format: 'int' },
]
