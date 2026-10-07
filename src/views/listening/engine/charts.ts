/**
 * The rows behind the Listening charts added with the design refresh (docs/CHARTS.md,
 * Listening): response rate by program, driver scores over the last waves, and exit reasons in
 * the survey beside the HR record. Each is recounted from the prepared answers or the roster with
 * the view's own helpers, so a chart and the tables beside it agree. Pure.
 *
 * Privacy: a rate is hidden when the invited or responding people are under the minimum (the
 * program row's rule). A wave and driver point needs the survey's minimum of distinct
 * respondents, or it is a gap. The two exit distributions are counted apart, never joined person
 * by person, and either side under the minimum is hidden. Survey reasons under the minimum fold
 * into one row, and an HR-record bar for such a reason opens no names.
 */
import type { AnalyticsContext } from '@/data/context'
import { type SurveyResponse, type SurveyType, VOLUNTARY_REASONS } from '@/data/schema'
import { aggregate, type WaveInfo } from '@/lib/surveys'
import { reasonsOf } from './cuts'
import type { ProgramRow } from './index'
import { driverOrder, inWave, type SurveyModel } from './measures'
import type { Prepared } from './prepare'

/* ───────────── response rate by program ───────────── */

/** The programs whose invited population Census can work out, in program order. */
export const rateBars = (programs: readonly ProgramRow[]): ProgramRow[] => programs.filter((r) => r.rateKnown)

/* ───────────── driver scores by wave ───────────── */

/** How many waves the trend shows. */
export const TREND_WAVES = 4
/** Drivers drawn at most (series are never cycled); the rest are named in the note. */
export const TREND_DRIVERS = 8

export interface DriverTrendPoint {
  survey: SurveyType
  driver: string
  wave: string
  /** The wave's first answer, the point's x. */
  start: string
  /** Mean on 1-5; null when the wave and driver have fewer respondents than the minimum. */
  value: number | null
  respondents: number
  /** The answers behind the point (for its grouped drill, never listed). */
  rows: readonly SurveyResponse[]
}

export interface DriverTrend {
  waves: WaveInfo[]
  drivers: string[]
  points: DriverTrendPoint[]
  /** The driver whose score moved most between the first and last wave shown. */
  emphasis: string | null
  /** Drivers left off the chart (more than eight). */
  folded: number
}

const EMPTY_TREND: DriverTrend = { waves: [], drivers: [], points: [], emphasis: null, folded: 0 }

/**
 * Each driver's mean on 1-5 in each of the last `n` waves of a survey. A survey about managers in
 * a narrowed scope is not compared across waves (`sm.compare`), so it has no trend.
 */
export function driverTrend(p: Prepared, sm: SurveyModel, n = TREND_WAVES): DriverTrend {
  if (!sm.compare) return EMPTY_TREND
  const waves = sm.waves.slice(-n)
  const byWave = waves.map((w) => ({ w, rows: inWave(sm.all, w).filter((r) => r.scale === '1-5') }))
  const all = byWave.flatMap((x) => x.rows)
  if (!all.length) return { ...EMPTY_TREND, waves }
  const order = driverOrder(p, sm.survey, all)
  const drivers = order.slice(0, TREND_DRIVERS)
  const points: DriverTrendPoint[] = []
  for (const driver of drivers)
    for (const { w, rows } of byWave) {
      const mine = rows.filter((r) => (r.driver ?? r.item) === driver)
      const a = aggregate(mine, { min: sm.min })
      points.push({
        survey: sm.survey,
        driver,
        wave: w.wave,
        start: w.start,
        value: mine.length ? a.mean : null,
        respondents: a.respondents,
        rows: mine,
      })
    }
  let emphasis: string | null = null
  let most = 0
  for (const driver of drivers) {
    const shown = points.filter((x) => x.driver === driver && x.value != null)
    if (shown.length < 2) continue
    const move = Math.abs((shown.at(-1)?.value as number) - (shown[0].value as number))
    if (move > most + 1e-9) {
      most = move
      emphasis = driver
    }
  }
  return { waves, drivers, points, emphasis, folded: order.length - drivers.length }
}

/* ───────────── exit reasons: survey and HR record ───────────── */

export const EXIT_SURVEY = 'Exit survey'
export const HR_RECORD = 'HR record'
export type ExitSource = typeof EXIT_SURVEY | typeof HR_RECORD

/** The survey row that holds the reasons too few respondents gave to show on their own. */
export const foldedReason = (min: number): string => `Other reasons, fewer than ${min} each`

export interface ExitReasonRow {
  reason: string
  source: ExitSource
  /** People giving the reason; null when the side is hidden or the reason is folded. */
  count: number | null
  /** Of the side's people who gave a reason; null when the side is hidden or the reason is folded. */
  share: number | null
  /**
   * The bar opens its records. An HR-record bar opens no names when the survey shows that reason
   * for fewer than the minimum: a short named list beside a survey count of 1 or 2 would say how
   * those people answered.
   */
  opens: boolean
}

export interface ExitSide {
  /** Distinct respondents (survey) or voluntary leavers (record) with a reason. */
  people: number
  hidden: boolean
}

export interface ExitVsRecord {
  rows: ExitReasonRow[]
  /** Reasons in the schema's order, then any others, then the folded survey row. */
  reasons: string[]
  survey: ExitSide
  record: ExitSide
  /** Each survey respondent's first reason in the period. */
  respondents: { respondentKey: string; reason: string }[]
  /** Voluntary leavers in the period with a termination reason. */
  leavers: AnalyticsContext['data']['employees']
  /** Survey reasons folded into `foldedReason(min)`: under the minimum, or folded with them. */
  folded: string[]
  /** The folded row's label, or null when nothing is folded. */
  foldedLabel: string | null
}

/** The respondents behind a survey row (a reason, or every folded reason). */
export function surveyKeysOf(x: ExitVsRecord, reason: string): Set<string> {
  const of = reason === x.foldedLabel ? new Set(x.folded) : new Set([reason])
  return new Set(x.respondents.filter((r) => of.has(r.reason)).map((r) => r.respondentKey))
}

/**
 * The exit survey's reasons (once per respondent, in the period) beside the termination reasons of
 * employees who left by choice in the period. Shares are of each side's own people.
 *
 * Privacy: either side under the minimum is hidden. On the survey side a reason fewer than the
 * minimum gave is folded into one row ("Other reasons, fewer than 5 each"); when that row would
 * itself be under the minimum, the next smallest reasons fold in too, so no count under the
 * minimum can be worked out from the total. An HR-record bar for a reason the survey shows under
 * the minimum opens no names.
 */
export function exitReasonsVsRecord(
  ctx: Pick<AnalyticsContext, 'data' | 'window' | 'asOf'>,
  period: readonly SurveyResponse[],
  min: number,
): ExitVsRecord {
  const respondents = reasonsOf(period).map(({ respondentKey, reason }) => ({ respondentKey, reason }))
  const end = ctx.window.end < ctx.asOf ? ctx.window.end : ctx.asOf
  const leavers = ctx.data.employees.filter(
    (e) =>
      e.employmentType === 'Employee' &&
      e.terminationType === 'Voluntary' &&
      !!e.terminationDate &&
      e.terminationDate >= ctx.window.start &&
      e.terminationDate <= end &&
      !!e.terminationReason?.trim(),
  )
  const survey: ExitSide = { people: respondents.length, hidden: respondents.length < min }
  const record: ExitSide = { people: leavers.length, hidden: leavers.length < min }
  const tally = (list: readonly string[]) => {
    const n = new Map<string, number>()
    for (const r of list) n.set(r, (n.get(r) ?? 0) + 1)
    return n
  }
  const fromSurvey = tally(respondents.map((r) => r.reason))
  const fromRecord = tally(leavers.map((e) => (e.terminationReason as string).trim()))
  const known = VOLUNTARY_REASONS as readonly string[]
  const rank = (r: string) => {
    const i = known.indexOf(r)
    return i < 0 ? known.length : i
  }
  // Survey reasons under the minimum fold into one row; while that row is under the minimum,
  // the smallest shown reason joins it (the side's total is at least the minimum).
  const folded = new Set<string>()
  if (!survey.hidden) {
    for (const [reason, n] of fromSurvey) if (n < min) folded.add(reason)
    const sum = () => [...folded].reduce((a, r) => a + (fromSurvey.get(r) ?? 0), 0)
    const rest = [...fromSurvey.entries()]
      .filter(([r]) => !folded.has(r))
      .sort((a, b) => a[1] - b[1] || rank(b[0]) - rank(a[0]))
    while (folded.size && sum() < min && rest.length) folded.add((rest.shift() as [string, number])[0])
  }
  const foldedLabel = folded.size ? foldedReason(min) : null
  const seen = new Set([
    ...(survey.hidden ? [] : [...fromSurvey.keys()].filter((r) => !folded.has(r))),
    ...(record.hidden ? [] : fromRecord.keys()),
  ])
  const reasons = [...seen].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const surveyRows: ExitReasonRow[] = reasons.map((reason) => {
    const count = survey.hidden || folded.has(reason) ? null : (fromSurvey.get(reason) ?? 0)
    return {
      reason,
      source: EXIT_SURVEY,
      count,
      share: count == null ? null : count / survey.people,
      opens: !!count,
    }
  })
  if (foldedLabel) {
    const count = [...folded].reduce((a, r) => a + (fromSurvey.get(r) ?? 0), 0)
    surveyRows.push({
      reason: foldedLabel,
      source: EXIT_SURVEY,
      count,
      share: count / survey.people,
      opens: count > 0,
    })
  }
  const recordRows: ExitReasonRow[] = reasons.map((reason) => {
    const count = record.hidden ? null : (fromRecord.get(reason) ?? 0)
    const fewInSurvey = !survey.hidden && (fromSurvey.get(reason) ?? 0) < min
    return {
      reason,
      source: HR_RECORD,
      count,
      share: count == null ? null : count / record.people,
      opens: !!count && !fewInSurvey,
    }
  })
  return {
    rows: [...surveyRows, ...recordRows],
    reasons: foldedLabel ? [...reasons, foldedLabel] : reasons,
    survey,
    record,
    respondents,
    leavers,
    folded: [...folded].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)),
    foldedLabel,
  }
}
