/**
 * The Talent KPI strip. Missing data is null (renders "—"), small groups are suppressed. Each
 * tile names its metric dictionary entry (`metricId`), and its info popover reads the definition
 * from the dictionary, so an edited definition shows here too.
 * Pure: no React, no DOM.
 */
import type { Kpi } from '@/components/types'
import { fmt } from '@/lib/format'
import { isMaterialChange } from '@/lib/stats'
import type { TalentBase } from './base'
import type { TalentDrills } from './drills'
import { tagKpis } from './drillUses'
import type { LearningResult } from './learning'
import type { TalentLineage } from './lineage'
import type { PerformanceResult } from './performance'
import type { RetentionResult } from './retention'
import type { RiskModel } from './risk'
import { highRangeText, KPI_METRIC, TALENT_METRIC as M } from './settings'
import type { SuccessionResult } from './succession'
import { kpiDefinition } from './wording'

/** A change in an on-time rate is called out at 2 pts or more with at least 20 assignments on both sides. */
const rateMaterial = (cur: number | null, prev: number | null, nCur: number, nPrev: number) =>
  cur != null && prev != null && nCur >= 20 && nPrev >= 20 && Math.abs(cur - prev) >= 0.02

/**
 * "the top 11% of scores company-wide", or the setting's wording when nobody is scored
 * ("about the top 10% of scores company-wide").
 */
export function highBandText(risk: Pick<RiskModel, 'highShare'>, targetShare = 0.1): string {
  return risk.highShare != null && risk.highShare > 0
    ? `the top ${fmt(risk.highShare, 'pct0')} of scores company-wide`
    : `about the top ${fmt(targetShare, 'pct0')} of scores company-wide`
}

export function buildKpis(x: {
  base: TalentBase
  performance: PerformanceResult
  succession: SuccessionResult
  retention: RetentionResult
  learning: LearningResult
  risk: RiskModel
  drill: TalentDrills
  lineage: Pick<TalentLineage, 'kpi'>
}): Kpi[] {
  const { base, performance: perf, succession: succ, retention: ret, learning, risk, drill } = x
  const m = base.ctx.metrics
  const s = base.settings
  const uses = x.lineage.kpi
  const cycle = perf.cycle?.cycle
  const hasReviews = base.has.reviews
  const small = (n: number) => n > 0 && n < s.minGroup
  const range = highRangeText(s.highRating)

  const regretted = ret.regrettedHigh
  const canRegret = regretted.available
  const cur = learning.current
  const prior = learning.prior
  const left = perf.ratedLeft

  return tagKpis([
    {
      id: 'talent-rated',
      metricId: KPI_METRIC['talent-rated'],
      label: 'Rated in latest cycle',
      value: hasReviews && base.active.length ? perf.coverage : null,
      format: 'pct',
      suppressed: small(perf.activeCount),
      note: hasReviews
        ? cycle
          ? small(perf.activeCount)
            ? `${cycle}`
            : `${fmt(perf.ratedActive)} of ${fmt(perf.activeCount)} active employees · ${cycle}`
          : 'No cycle closed by the as-of date'
        : 'Upload Reviews to see this',
      tab: 'performance',
      definition: kpiDefinition(m, M.ratedCoverage, cycle ? `The latest cycle is ${cycle}.` : ''),
      drill: drill.ratedActive(),
      // "1,280 of 1,450 active employees": the 1,280 rated.
      noteDrill: hasReviews && cycle && !small(perf.activeCount) ? drill.ratedActive() : null,
      uses: uses['talent-rated'],
    },
    {
      id: 'talent-high-performers',
      metricId: KPI_METRIC['talent-high-performers'],
      label: 'High performers',
      value: perf.highShare,
      format: 'pct',
      delta: perf.highShare != null ? perf.highShare - s.highGuideline : null,
      deltaLabel: 'vs guideline',
      goodDirection: null,
      spark: perf.highTrend.map((t) => t.share),
      suppressed: small(perf.rated),
      note: hasReviews
        ? `${fmt(perf.rated)} rated${left ? `, incl. ${fmt(left)} who ${left === 1 ? 'has' : 'have'} left` : ''}`
        : 'Upload Reviews to see this',
      tab: 'performance',
      definition: kpiDefinition(m, M.highPerformers, cycle ? `The latest cycle is ${cycle}.` : '', [
        M.ratingDistribution,
      ]),
      drill: drill.highPerformers(),
      // "1,300 rated, incl. 20 who have left": everyone rated in the cycle.
      noteDrill: hasReviews && !small(perf.rated) ? drill.rated() : null,
      uses: uses['talent-high-performers'],
    },
    {
      id: 'talent-high-potentials',
      metricId: KPI_METRIC['talent-high-potentials'],
      label: 'High potentials',
      value: succ.hipoShare,
      format: 'pct',
      suppressed: small(succ.hipoAssessed),
      note: succ.potentialCycle
        ? small(succ.hipoAssessed)
          ? succ.potentialCycle.cycle
          : `${fmt(succ.hipoHigh)} of ${fmt(succ.hipoAssessed)} assessed · ${succ.potentialCycle.cycle}`
        : 'No potential ratings loaded',
      tab: 'succession',
      definition: kpiDefinition(m, M.highPotentials),
      drill: drill.hipo(null, null, 'high'),
      noteDrill: succ.potentialCycle && !small(succ.hipoAssessed) ? drill.hipo(null, null, 'high') : null,
      uses: uses['talent-high-potentials'],
    },
    {
      id: 'talent-succession-coverage',
      metricId: KPI_METRIC['talent-succession-coverage'],
      label: 'Critical roles covered',
      value: succ.coverage,
      format: 'pct',
      goodDirection: 'up',
      note: base.has.succession
        ? succ.critical
          ? `${succ.criticalCovered} of ${succ.critical} have a ready-now successor`
          : 'No critical roles in this scope'
        : 'Upload Succession to see this',
      tab: 'succession',
      definition: kpiDefinition(m, M.criticalCoverage),
      drill: drill.coverage(),
      noteDrill: base.has.succession && succ.critical ? drill.coverage() : null,
      uses: uses['talent-succession-coverage'],
    },
    {
      id: 'talent-regretted-high',
      metricId: KPI_METRIC['talent-regretted-high'],
      label: `Regretted exits, rated ${range}`,
      value: canRegret ? regretted.current.length : null,
      format: 'int',
      delta: canRegret ? regretted.current.length - regretted.prior.length : null,
      deltaLabel: 'vs prior period',
      goodDirection: 'down',
      deltaMaterial:
        canRegret &&
        isMaterialChange(
          regretted.current.length,
          regretted.prior.length,
          regretted.current.length,
          regretted.prior.length,
        ),
      spark: canRegret ? regretted.byQuarter : undefined,
      note: canRegret ? base.ctx.window.label : (regretted.missing ?? undefined),
      tab: 'retention',
      definition: kpiDefinition(m, M.regrettedHigh, 'The trend shows the last 8 quarters.', [
        M.highPerformers,
      ]),
      drill: drill.regrettedHigh('current'),
      deltaDrill: canRegret ? drill.regrettedHigh('prior') : null,
      uses: uses['talent-regretted-high'],
    },
    {
      id: 'talent-training-on-time',
      metricId: KPI_METRIC['talent-training-on-time'],
      label: 'Required training on time',
      value: cur.rate,
      format: 'pct',
      delta: cur.rate != null && prior.rate != null ? cur.rate - prior.rate : null,
      deltaLabel: learning.mixDiffers ? 'vs prior period, different courses' : 'vs prior period',
      goodDirection: 'up',
      deltaMaterial: !learning.mixDiffers && rateMaterial(cur.rate, prior.rate, cur.due, prior.due),
      spark: learning.trend.some((v) => v != null) ? learning.trend : undefined,
      suppressed: small(cur.due),
      note: base.has.learning
        ? learning.hasDueDates
          ? // The tile shows the target and whether it is met (the metric's own target).
            `${fmt(cur.due)} assignments due`
          : 'Due date is missing'
        : 'Upload Learning to see this',
      tab: 'learning',
      definition: kpiDefinition(m, M.requiredOnTime),
      drill: cur.rate != null ? drill.onTime(null, 'onTime') : null,
      deltaDrill: cur.rate != null && prior.rate != null ? drill.onTimePrior() : null,
      // "1,200 assignments due": all of them, with how each turned out.
      noteDrill:
        base.has.learning && learning.hasDueDates && !small(cur.due) ? drill.onTime(null, 'due') : null,
      uses: uses['talent-training-on-time'],
    },
    {
      id: 'talent-key-talent-risk',
      metricId: KPI_METRIC['talent-key-talent-risk'],
      label: 'Key talent at risk',
      value: hasReviews && ret.scored ? ret.keyTalent.length : null,
      format: 'int',
      note:
        hasReviews && ret.highPerformers >= s.minGroup
          ? `${fmt(ret.keyTalent.length / ret.highPerformers, 'pct')} of ${fmt(ret.highPerformers)} active people rated ${range}`
          : hasReviews && ret.highPerformers
            ? `Fewer than ${s.minGroup} active people rated ${range}`
            : undefined,
      tab: 'retention',
      definition: kpiDefinition(m, M.keyTalent, `Today the high band is ${highBandText(risk, s.highBand)}.`, [
        M.highPerformers,
        M.riskBands,
      ]),
      drill: drill.keyTalent(),
      // "12.0% of 300 active people rated 4-5": those 300 people.
      noteDrill: hasReviews && ret.highPerformers >= s.minGroup ? drill.activeHighPerformers() : null,
      uses: uses['talent-key-talent-risk'],
    },
  ])
}
