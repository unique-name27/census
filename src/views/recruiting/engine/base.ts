/**
 * The shared base every recruiting measure reads: applications evaluated on the as-of date, the
 * active pipeline with next-step states, the window cohorts and the requisition facts.
 */
import type { AnalyticsContext } from '@/data/context'
import type { ISODate, Requisition } from '@/data/schema'
import type { Window } from '@/data/scope'
import { fmt } from '@/lib/format'
import { cohort, type Flow, stageFlow } from './flow'
import { activeItems } from './nextStep'
import { coverage, inWin, prepareApps, reqIndex, stageNorms } from './prepare'
import { filledIn, type ReqFacts, reqFacts } from './reqs'
import { resolvedOffers } from './sources'
import type { ActiveItem, App, Coverage, Norms } from './types'

export interface RecruitingBase {
  asOf: ISODate
  window: Window
  prior: Window
  /** "vs prior 12 months", "vs prior quarter", … */
  compareLabel: string
  /** "last 12 months", "this quarter", … for sentences. */
  windowWords: string
  isCompany: boolean
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
  /** "0 of 9,279 applications match a requisition ID" when fewer than half match; else null. */
  joinNote: string | null
}

/** Below this share of applications matching a req ID, per-req health is not read. */
export const MIN_JOIN_SHARE = 0.5

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
  const reqs = ctx.data.requisitions
  const companyReqs = ctx.all.requisitions
  const companyIndex = reqIndex(companyReqs)
  const companyApps = prepareApps(ctx.all.candidates, companyIndex, asOf)
  const apps =
    ctx.data.candidates === ctx.all.candidates
      ? companyApps
      : prepareApps(ctx.data.candidates, companyIndex, asOf)
  const norms = stageNorms(companyApps)
  const cov = coverage(ctx.all.candidates, companyReqs)
  const actives = activeItems(apps, asOf, norms)
  let matched = 0
  for (const c of ctx.all.candidates) if (companyIndex.has(c.reqId)) matched++
  const join = { candidates: ctx.all.candidates.length, matched }
  const joins = join.candidates > 0 && matched / join.candidates >= MIN_JOIN_SHARE
  const joinNote =
    join.candidates > 0 && companyReqs.length > 0 && !joins
      ? `${fmt(matched, 'int')} of ${fmt(join.candidates, 'int')} applications match a requisition ID`
      : null
  const current = cohort(apps, window)
  const priorCohort = cohort(apps, prior)
  const [compareLabel, windowWords] = COMPARE[ctx.filters.period] ?? COMPARE.custom
  return {
    asOf,
    window,
    prior,
    compareLabel,
    windowWords,
    isCompany: ctx.isCompany,
    reqs,
    apps,
    companyApps,
    companyReqs,
    norms,
    cov,
    actives,
    cohort: current,
    priorCohort,
    flow: stageFlow(current, priorCohort),
    filled: filledIn(reqs, window),
    filledPrior: filledIn(reqs, prior),
    companyFilled: filledIn(companyReqs, window),
    hires: apps.filter((a) => a.outcome === 'Hired' && inWin(a.exitDate, window)),
    hiresPrior: apps.filter((a) => a.outcome === 'Hired' && inWin(a.exitDate, prior)),
    offers: resolvedOffers(apps, window),
    offersPrior: resolvedOffers(apps, prior),
    req: reqFacts(reqs, apps, actives, asOf, joins),
    join,
    joinNote,
  }
}
