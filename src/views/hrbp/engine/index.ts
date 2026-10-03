/**
 * HR business partner engine: a pure function of the analytics context. Ported from the
 * earlier HRBP dashboard (hrbp.mjs) onto the shared definitions in `@/lib/people`.
 */
import type { Finding } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { headcountAt } from '@/lib/people'
import { type AttritionModel, computeAttrition } from './attrition'
import { type Prep, prepare, quarterBlocks } from './base'
import { computeFindings } from './findings'
import { computeKpis, type KpiModel } from './kpis'
import { computeMovement, type MovementModel } from './movement'
import { computeOrg, type OrgModel } from './org'
import { computeScorecard, type Scorecard } from './scorecard'
import { computeWorkforce, type WorkforceModel } from './workforce'

export interface HrbpModel {
  prep: Prep
  kpi: KpiModel
  workforce: WorkforceModel
  attrition: AttritionModel
  movement: MovementModel
  org: OrgModel
  scorecard: Scorecard
  findings: Finding[]
}

export function computeHrbp(ctx: AnalyticsContext): HrbpModel {
  const prep = prepare(ctx)
  const movement = computeMovement(prep)
  const kpi = computeKpis(prep, movement)
  const workforce = computeWorkforce(prep)
  const attrition = computeAttrition(prep)
  const org = computeOrg(prep)
  const scorecard = computeScorecard(prep)
  const findings = computeFindings(prep, { kpi, attrition, org, workforce })
  return { prep, kpi, workforce, attrition, movement, org, scorecard, findings }
}

/** Folder-tab number: employees at asOf, with the last 8 quarter-end headcounts. */
export function hrbpHeadline(ctx: AnalyticsContext): { value: number; spark: number[] } {
  const emps = ctx.data.employees
  return {
    value: headcountAt(emps, ctx.asOf),
    spark: quarterBlocks(ctx.asOf, 8).map((b) => headcountAt(emps, b.end)),
  }
}

export type { Prep } from './base'
export { talkingPoints } from './talkingPoints'
