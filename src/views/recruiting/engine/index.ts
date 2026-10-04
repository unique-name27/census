/**
 * Recruiting engine: every number the view shows, as a pure function of the analytics context.
 * Results are cached per context object, so the tabs share one computation.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { LEVELS } from '@/data/schema'
import { addDays, addMonths, monthKey, monthStart, monthsBetween } from '@/lib/dates'
import { computeBase, type RecruitingBase } from './base'
import { tagFindings } from './drillUses'
import { acceptanceDrop, recruitingFindings } from './findings'
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
  acceptance,
  acceptanceBy,
  acceptanceByQuarter,
  declineReasons,
  type ExitReasonRow,
  exitReasons,
  type GroupAcceptance,
  type QuarterAcceptance,
  quarterWindows,
  type ReasonRow,
  resolvedOffers,
  type SourceMonthRow,
  type SourceRow,
  sourceRows,
  sourcesByMonth,
} from './sources'
import type { App } from './types'

export interface HiresMonthRow {
  month: string
  hires: number
  /** The hires counted (for the drill panel; not exported). */
  apps: App[]
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
  teamMedianOpen: number | null
  teamMedianActive: number | null
  sources: SourceRow[]
  sourcesByMonth: SourceMonthRow[]
  /** The source whose applications moved most against the overall trend vs the prior window. */
  changedSource: string | null
  acceptanceByLocation: GroupAcceptance[]
  companyAcceptance: number | null
  /** The latest quarter of the window ("Q3 2026"), for the quarter view of acceptance by location. */
  latestQuarter: { label: string; start: string; end: string; complete: boolean }
  acceptanceByLocationQuarter: GroupAcceptance[]
  companyAcceptanceQuarter: number | null
  /** Which basis the offer-acceptance finding used, so the location chart can open on the same one. */
  acceptanceDropBasis: 'quarter' | 'period' | null
  declineReasons: ReasonRow[]
  exitReasons: ExitReasonRow[]
}

function hiresByMonth(b: RecruitingBase): HiresMonthRow[] {
  const months = monthsBetween(addMonths(monthStart(b.window.end), -23), b.window.end)
  const m = new Map(months.map((k) => [k, [] as App[]]))
  for (const a of b.apps) {
    if (a.outcome !== 'Hired' || !a.exitDate || a.exitDate > b.window.end) continue
    m.get(monthKey(a.exitDate))?.push(a)
  }
  return months.map((month) => {
    const apps = m.get(month) ?? []
    return { month, hires: apps.length, apps }
  })
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
  const companyRate = (w: { start: string; end: string }) => acceptance(resolvedOffers(b.companyApps, w)).rate
  const [, q] = quarterWindows(b.window.end, 2)
  const recruiters = recruiterLoad(b.req.open, b.actives, b.apps, b.window)
  return {
    base: b,
    kpis: recruitingKpis(b),
    findings: tagFindings(recruitingFindings(b)),
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
    teamMedianOpen: recruiters.teamMedianOpen,
    teamMedianActive: recruiters.teamMedianActive,
    sources,
    sourcesByMonth: sourcesByMonth(
      b.apps,
      b.window.end,
      sources.map((s) => s.source),
    ),
    changedSource: changed?.source ?? null,
    acceptanceByLocation: acceptanceBy(b.offers, (a) => a.location),
    companyAcceptance: companyRate(b.window),
    latestQuarter: {
      label: q.key.replace(/^(\d{4}) (Q\d)$/, '$2 $1'),
      start: q.start,
      end: q.end,
      complete: q.end === addDays(addMonths(q.start, 3), -1),
    },
    acceptanceByLocationQuarter: acceptanceBy(resolvedOffers(b.apps, q), (a) => a.location),
    companyAcceptanceQuarter: companyRate(q),
    acceptanceDropBasis: acceptanceDrop(b)?.basis ?? null,
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
