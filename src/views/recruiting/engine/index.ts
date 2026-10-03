/**
 * Recruiting engine: every number the view shows, as a pure function of the analytics context.
 * Results are cached per context object, so the tabs share one computation.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { LEVELS } from '@/data/schema'
import { addMonths, monthKey, monthStart, monthsBetween } from '@/lib/dates'
import { computeBase, type RecruitingBase } from './base'
import { recruitingFindings } from './findings'
import { type SpeedCell, speedByMonth } from './flow'
import { recruitingKpis } from './kpis'
import {
  type PipelineStage,
  pipelineToday,
  type QueueGroup,
  queueGroups,
  type WaitDot,
  waitingDots,
} from './pipeline'
import { inWin } from './prepare'
import {
  type MonthReqRow,
  medianTtf,
  type OpenByDeptRow,
  openByDepartment,
  openedFilledByMonth,
  type RecruiterRow,
  recruiterLoad,
  type TtfRow,
  ttfBy,
} from './reqs'
import {
  acceptanceBy,
  acceptanceByQuarter,
  declineReasons,
  type ExitReasonRow,
  exitReasons,
  type GroupAcceptance,
  type QuarterAcceptance,
  type ReasonRow,
  type SourceMonthRow,
  type SourceRow,
  sourceRows,
  sourcesByMonth,
} from './sources'

export interface HiresMonthRow {
  month: string
  hires: number
}

export interface RecruitingModel {
  base: RecruitingBase
  kpis: Kpi[]
  findings: Finding[]
  pipeline: PipelineStage[]
  queue: QueueGroup[]
  waiting: WaitDot[]
  speed: SpeedCell[]
  hiresByMonth: HiresMonthRow[]
  acceptanceByQuarter: QuarterAcceptance[]
  openByDepartment: OpenByDeptRow[]
  ttfByLevel: TtfRow[]
  ttfByDepartment: TtfRow[]
  /** Company median time to fill (unscoped), the reference line. */
  companyTtf: number | null
  ttf: number | null
  openAges: number[]
  openedFilled: MonthReqRow[]
  recruiters: RecruiterRow[]
  teamMedianWait: number | null
  sources: SourceRow[]
  sourcesByMonth: SourceMonthRow[]
  /** The source whose applications moved most against the overall trend vs the prior window. */
  changedSource: string | null
  acceptanceByLocation: GroupAcceptance[]
  companyAcceptance: number | null
  declineReasons: ReasonRow[]
  exitReasons: ExitReasonRow[]
}

function hiresByMonth(b: RecruitingBase): HiresMonthRow[] {
  const months = monthsBetween(addMonths(monthStart(b.window.end), -23), b.window.end)
  const m = new Map(months.map((k) => [k, 0]))
  for (const a of b.apps) {
    if (a.outcome !== 'Hired' || !a.exitDate || a.exitDate > b.window.end) continue
    const k = monthKey(a.exitDate)
    if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return months.map((month) => ({ month, hires: m.get(month) ?? 0 }))
}

export function computeRecruitingUncached(ctx: AnalyticsContext): RecruitingModel {
  const b = computeBase(ctx)
  const sources = sourceRows(b.cohort, b.priorCohort)
  // The source that moved most against the overall trend in applications.
  const overall = b.priorCohort.length ? b.cohort.length / b.priorCohort.length - 1 : 0
  const gap = (s: SourceRow) => Math.abs((s.change ?? 0) - overall)
  const changed = sources
    .filter((s) => s.priorApplications >= 30 && s.change != null)
    .sort((x, y) => gap(y) - gap(x))[0]
  const companyOffers = b.companyApps.filter(
    (a) => (a.outcome === 'Hired' || a.outcome === 'Declined') && inWin(a.exitDate, b.window),
  )
  const companyHired = companyOffers.filter((a) => a.outcome === 'Hired').length
  const recruiters = recruiterLoad(b.req.open, b.actives, b.apps, b.window)
  return {
    base: b,
    kpis: recruitingKpis(b),
    findings: recruitingFindings(b),
    pipeline: pipelineToday(b.actives),
    queue: queueGroups(b.actives),
    waiting: waitingDots(b.actives),
    speed: speedByMonth(b.apps, b.window.end),
    hiresByMonth: hiresByMonth(b),
    acceptanceByQuarter: acceptanceByQuarter(b.apps, b.window.end),
    openByDepartment: openByDepartment(b.req.open, b.asOf),
    ttfByLevel: ttfBy(b.filled, (r) => r.level, LEVELS),
    ttfByDepartment: ttfBy(b.filled, (r) => r.department),
    companyTtf: b.cov.hasFilledDate ? medianTtf(b.companyFilled) : null,
    ttf: b.cov.hasFilledDate ? medianTtf(b.filled) : null,
    openAges: b.req.rows.map((r) => r.daysOpen),
    openedFilled: openedFilledByMonth(b.reqs, b.window.end),
    recruiters: recruiters.rows,
    teamMedianWait: recruiters.teamMedianWait,
    sources,
    sourcesByMonth: sourcesByMonth(
      b.apps,
      b.window.end,
      sources.map((s) => s.source),
    ),
    changedSource: changed?.source ?? null,
    acceptanceByLocation: acceptanceBy(b.offers, (a) => a.location),
    companyAcceptance: companyOffers.length ? companyHired / companyOffers.length : null,
    declineReasons: declineReasons(b.offers),
    exitReasons: exitReasons(b.apps, b.window),
  }
}

const cache = new WeakMap<AnalyticsContext, RecruitingModel>()

export function computeRecruiting(ctx: AnalyticsContext): RecruitingModel {
  let m = cache.get(ctx)
  if (!m) {
    m = computeRecruitingUncached(ctx)
    cache.set(ctx, m)
  }
  return m
}
