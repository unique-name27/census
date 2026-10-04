/**
 * HR business partner engine: a pure function of the analytics context. Ported from the
 * earlier HRBP dashboard (hrbp.mjs) onto the shared definitions in `@/lib/people`.
 */
import type { Finding, Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { ID } from '../metrics'
import { type AttritionModel, computeAttrition } from './attrition'
import { type Prep, prepare, quarterBlocks } from './base'
import { tagFindings } from './drillUses'
import { computeFindings } from './findings'
import { computeKpis, type KpiModel } from './kpis'
import { all, HEADCOUNT, ifPresent, PAST_HEADCOUNT, resolveLineage, scopeLineage } from './lineage'
import { computeMovement, type MovementModel } from './movement'
import { computeOrg, type OrgModel } from './org'
import { countsFor, headcountAt } from './population'
import { computeScorecard, type Scorecard } from './scorecard'
import { settingsOf } from './settings'
import { movementKpis, orgKpis } from './tiles'
import { computeWorkforce, type WorkforceModel } from './workforce'

export interface HrbpModel {
  prep: Prep
  kpi: KpiModel
  /** The Movement tab's tiles. */
  movementKpis: Kpi[]
  /** The Org design tab's tiles. */
  orgKpis: Kpi[]
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
  const findings = tagFindings(computeFindings(prep, { kpi, attrition, org, workforce }))
  return {
    prep,
    kpi,
    movementKpis: movementKpis(prep, movement),
    orgKpis: orgKpis(prep, org),
    workforce,
    attrition,
    movement,
    org,
    scorecard,
    findings,
  }
}

/**
 * Folder-tab number: employees at asOf (with contractors when that setting is on), with the last
 * 8 quarter-end headcounts. Its fields are the Employees tile's (headcount in the scope), plus the
 * past headcount behind the spark when the roster keeps its leavers.
 */
export function hrbpHeadline(ctx: AnalyticsContext): {
  value: number
  spark: number[]
  uses: readonly FieldRef[]
  metricId: string
  /** Contractors count in headcount (the setting is on). */
  withContractors: boolean
} {
  const emps = ctx.data.employees
  const withContractors = settingsOf(ctx.metrics).countContractors
  const counts = countsFor(withContractors)
  const present = (ref: FieldRef) => ctx.quality.fieldTier(ref) !== 'none'
  return {
    metricId: ID.headcount,
    withContractors,
    value: headcountAt(emps, ctx.asOf, counts),
    spark: quarterBlocks(ctx.asOf, 8).map((b) => headcountAt(emps, b.end, counts)),
    uses: resolveLineage(all(HEADCOUNT, ifPresent(PAST_HEADCOUNT), scopeLineage(ctx.filters)), present),
  }
}

export type { Prep } from './base'
export { talkingPoints } from './talkingPoints'
