/**
 * The shared base every recruiting measure reads: applications evaluated on the as-of date, the
 * active pipeline with next-step states, the window cohorts and the requisition facts, with the
 * dictionary and the calculation settings in force (`settings`, read once from `ctx.metrics`).
 */
import type { AnalyticsContext } from '@/data/context'
import type { Candidate, Employee, ISODate, Requisition } from '@/data/schema'
import type { Window } from '@/data/scope'
import { fmt } from '@/lib/format'
import type { MetricsApi } from '@/metrics/types'
import { type TtfDays, ttfClock } from './clock'
import { cohort, type Flow, stageFlow } from './flow'
import { activeItems } from './nextStep'
import { coverage, inWin, prepareApps, reqIndex, stageNorms } from './prepare'
import { filledIn, type ReqFacts, reqFacts } from './reqs'
import { type RecruitingSettings, recruitingSettings } from './settings'
import { resolvedOffers } from './sources'
import type { ActiveItem, App, Coverage, Norms } from './types'

export interface RecruitingBase {
  /** The metric dictionary in force (wording, targets and settings). */
  metrics: MetricsApi
  /** The calculation settings in force, read from the dictionary. */
  settings: RecruitingSettings
  /** Days to fill one filled req, with the clock the dictionary sets (offer accepted or start date). */
  ttf: TtfDays
  asOf: ISODate
  window: Window
  prior: Window
  /** "vs prior 12 months", "vs prior quarter", … */
  compareLabel: string
  /** "last 12 months", "this quarter", … for sentences. */
  windowWords: string
  /** "Whole company", "Design Verification · Hsinchu": the scope line for drill subtitles. */
  scopeLabel: string
  isCompany: boolean
  /** The unscoped roster, to link hires to the employee they became (drill person cards). */
  roster: readonly Employee[]
  reqs: Requisition[]
  apps: App[]
  /** Unscoped applications, for company norms and benchmarks. */
  companyApps: App[]
  companyReqs: Requisition[]
  norms: Norms
  cov: Coverage
  actives: ActiveItem[]
  cohort: App[]
  priorCohort: App[]
  flow: Flow
  filled: Requisition[]
  filledPrior: Requisition[]
  companyFilled: Requisition[]
  hires: App[]
  hiresPrior: App[]
  offers: App[]
  offersPrior: App[]
  req: ReqFacts
  /** How many candidate rows (company-wide) carry a req ID that exists in Requisitions. */
  join: { candidates: number; matched: number }
  /** Candidate rows (company-wide) whose req ID matches no requisition. */
  unmatched: Candidate[]
  /**
   * "0 of 9,279 applications match a requisition ID" when fewer than the matching share (half, by
   * default) match; else null.
   */
  joinNote: string | null
}

const COMPARE: Record<string, [string, string]> = {
  t12m: ['vs prior 12 months', 'last 12 months'],
  t6m: ['vs prior 6 months', 'last 6 months'],
  t3m: ['vs prior 3 months', 'last 3 months'],
  lastQuarter: ['vs prior quarter', 'last full quarter'],
  ytd: ['vs same period last year', 'year to date'],
  custom: ['vs prior period', 'selected period'],
}

export function computeBase(ctx: AnalyticsContext): RecruitingBase {
  const { asOf, window, prior } = ctx
  const settings = recruitingSettings(ctx.metrics)
  const reqs = ctx.data.requisitions
  const companyReqs = ctx.all.requisitions
  const companyIndex = reqIndex(companyReqs)
  const companyApps = prepareApps(ctx.all.candidates, companyIndex, asOf)
  const apps =
    ctx.data.candidates === ctx.all.candidates
      ? companyApps
      : prepareApps(ctx.data.candidates, companyIndex, asOf)
  const norms = stageNorms(companyApps, settings.norms)
  const cov = coverage(ctx.all.candidates, companyReqs)
  const actives = activeItems(apps, asOf, norms, settings.aging)
  let matched = 0
  const unmatched: Candidate[] = []
  for (const c of ctx.all.candidates) {
    if (companyIndex.has(c.reqId)) matched++
    else unmatched.push(c)
  }
  const join = { candidates: ctx.all.candidates.length, matched }
  const joins = join.candidates > 0 && matched / join.candidates >= settings.joinMinShare
  const joinNote =
    join.candidates > 0 && companyReqs.length > 0 && !joins
      ? `${fmt(matched, 'int')} of ${fmt(join.candidates, 'int')} applications match a requisition ID`
      : null
  const current = cohort(apps, window)
  const priorCohort = cohort(apps, prior)
  const [compareLabel, windowWords] = COMPARE[ctx.filters.period] ?? COMPARE.custom
  return {
    metrics: ctx.metrics,
    settings,
    ttf: ttfClock(settings.ttfEnd, companyApps, ctx.all.employees, asOf),
    asOf,
    window,
    prior,
    compareLabel,
    windowWords,
    scopeLabel: ctx.scopeLabel,
    isCompany: ctx.isCompany,
    roster: ctx.all.employees,
    reqs,
    apps,
    companyApps,
    companyReqs,
    norms,
    cov,
    actives,
    cohort: current,
    priorCohort,
    flow: stageFlow(current, priorCohort, settings.minGroup),
    filled: filledIn(reqs, window),
    filledPrior: filledIn(reqs, prior),
    companyFilled: filledIn(companyReqs, window),
    hires: apps.filter((a) => a.outcome === 'Hired' && inWin(a.exitDate, window)),
    hiresPrior: apps.filter((a) => a.outcome === 'Hired' && inWin(a.exitDate, prior)),
    offers: resolvedOffers(apps, window),
    offersPrior: resolvedOffers(apps, prior),
    req: reqFacts(reqs, apps, actives, asOf, joins, settings.emptyFunnelDays),
    join,
    unmatched,
    joinNote,
  }
}
