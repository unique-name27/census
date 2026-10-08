/**
 * The wording of every Compensation KPI popover and figure definitions panel, read from the
 * metric dictionary (`ctx.metrics.def(id)`, with your changes), so an edit in Metric definitions
 * shows everywhere. A metric whose meaning depends on its settings gets one more sentence stating
 * the values in force ("The healthy band is 0.90 to 1.10."). Pure.
 */
import type { Definition } from '@/charts/types'
import { fmt } from '@/lib/format'
import type { MetricDefinition } from '@/metrics/api'
import type { MetricsApi } from '@/metrics/types'
import { type CompMetricId, M } from '../metrics'
import type { FigureId } from './lineage'
import type { CompRules } from './rules'
import { RATINGS } from './settings'
import { settingPct } from './text'

type Defs = Pick<MetricsApi, 'def'>

/** The metric each figure shows: its definitions panel leads with it and links to it. */
export const FIGURE_METRIC: Readonly<Record<FigureId, CompMetricId>> = {
  'comp-compa-distribution': M.compaRatio,
  'comp-position-by-bu': M.positionMix,
  'comp-compa-by-location': M.compaMedian,
  'comp-compa-by-level': M.compaMedian,
  'comp-compa-by-department': M.compaMedian,
  'comp-pay-attrition': M.compaMedian,
  'comp-compa-location-level': M.compaMedian,
  'comp-penetration-by-level': M.penetration,
  'comp-compa-by-tenure': M.compaRatio,
  'comp-below-min-cause': M.belowMin,
  'comp-below-minimum': M.belowMin,
  'comp-above-maximum': M.aboveMax,
  'comp-compression': M.compression,
  'comp-compa-by-rating': M.compaRatio,
  'comp-merit-by-rating': M.vsGuideline,
  'comp-merit-matrix': M.vsGuideline,
  'comp-differentiation-by-department': M.differentiation,
  'comp-bonus-by-rating': M.bonus,
  'comp-equity-by-rating': M.equity,
  'comp-market-vs-range': M.marketVsMid,
  'comp-market-by-function': M.marketGap,
  'comp-market-by-location': M.marketGap,
  'comp-market-by-level': M.marketGap,
  'comp-jobs-below-market': M.marketGap,
  'comp-spend-by-bu': M.spend,
  'comp-merit-distribution': M.meritPct,
  'comp-guideline-exceptions': M.exceptions,
  'comp-promotions': M.promotions,
  'comp-rewards-mix': M.mix,
}

/* ───────── concept rows (not metrics) ───────── */

export const DEF_FX: Definition = {
  term: 'Currency',
  text: 'Amounts are converted to US dollars with each row’s FX rate. Rows without a rate keep their ratios but are left out of USD totals.',
}
export const DEF_LATEST_RATING: Definition = {
  term: 'Latest rating',
  text: 'The most recent performance rating on or before the as-of date, the one merit proposals are drafted against.',
}
export const DEF_ANNUAL_RATING: Definition = {
  term: 'Annual rating',
  text: 'The rating from the latest annual cycle, the one the payout followed.',
}
/** The charts of ratios and counts: the pay amounts switch does not change them. */
export const DEF_NO_AMOUNTS: Definition = {
  term: 'Pay amounts',
  text: 'Ratios and counts only, so Show pay amounts does not change this chart.',
}
export const DEF_LEVEL_GROUPS: Definition = {
  term: 'Level groups',
  text: 'Levels are grouped so each cell holds enough people to show: L1-L2, L3-L4, L5-L6, M1 managers, M2 directors and E1-E3 executives.',
}
export const DEF_BELOW_CAUSE: Definition = {
  term: 'Cause',
  text: 'Promoted means a promotion in Job changes in the 12 months to the as-of date; it wins over hired, a hire date in those 12 months. Neither means paid below minimum for longer. Without Job changes at the data standard, the split is hired in the last 12 months or not.',
}

/* ───────── wording from the dictionary ───────── */

const ratio = (v: number) => fmt(v, 'ratio')
/** "3.0 pts", "0.20 pts": an unsigned gap in points. */
const pts = (v: number, digits: 1 | 2) => fmt(Math.abs(v), digits === 1 ? 'pts' : 'pts2').replace('+', '')
const int = (v: number) => fmt(v, 'int')

/** "5 at 6.0%, 4 at 4.5%, 3 at 3.0%, 2 at 1.0% and 1 at 0.0%" */
export function guidelineText(r: Pick<CompRules, 'cycle'>): string {
  const parts = RATINGS.map((k) => `${k} at ${fmt(r.cycle.guideline[k], 'pct')}`)
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** One sentence with the settings a metric's meaning depends on, in force; null when it has none. */
export function settingsSentence(id: CompMetricId, r: CompRules): string | null {
  switch (id) {
    case M.inBand:
      return `The healthy band is ${ratio(r.cycle.bandLow)} to ${ratio(r.cycle.bandHigh)}.`
    case M.lowCompa:
      return `The threshold is ${ratio(r.lowCompa.threshold)}, and the escalation gap is ${pts(r.lowCompa.attritionGap, 1)}.`
    case M.belowMin:
      return `The readout marks it critical from ${settingPct(r.belowMin.criticalShare)} and ${int(r.belowMin.criticalCount)} people.`
    case M.increaseToMin:
      return `Increases of ${settingPct(r.increaseToMin.largeGap)} or more are marked.`
    case M.compression:
      return `Shown where both sides have ${int(r.compression.minGroup)} or more people; a gap of ${ratio(r.compression.gap)} or more with ${int(r.compression.findingMin)} or more on each side reaches the readout.`
    case M.spend:
      return `The budget is ${fmt(r.cycle.meritBudget, 'pct2')} of eligible base.`
    case M.overBudget:
      return `Flagged from ${pts(r.overBudget.flag, 2)} over the ${fmt(r.cycle.meritBudget, 'pct2')} budget, critical from ${pts(r.overBudget.critical, 2)}.`
    case M.guidelineSpend:
    case M.vsGuideline:
      return `The guideline is ${guidelineText(r)}.`
    case M.exceptions:
      return `The rating 5 floor is ${settingPct(r.exceptions.topRatingFloor)} and the rating 1-2 cap is ${settingPct(r.exceptions.lowRatingCap)}. Unusual means more than ${fmt(r.exceptions.outlierZ, 'num1')} robust deviations from the median merit for the rating, either way, where the rating has ${int(r.exceptions.outlierMinPeers)} or more proposals across the company.`
    case M.differentiation:
      return `Below ${fmt(r.differentiation.floor, 'times')} ratings make little difference to pay. Needs ${int(r.minGroup)} people on each side.`
    case M.marketGap:
      return `The job function chart ranks functions of ${int(r.marketGap.minFunction)} or more people; jobs ${settingPct(r.marketGap.jobWatch)} or more below market are marked.`
    case M.belowMarket:
      return `Flagged at ${settingPct(r.belowMarket.threshold)} or more below market; the ranges trail the market when market medians sit ${settingPct(r.belowMarket.rangeGap)} or more above the midpoints.`
    default:
      return null
  }
}

/** The registered metric; throws for an id the dictionary does not know (a typo, caught by tests). */
function defOf(m: Defs, id: CompMetricId) {
  const d = m.def(id)
  if (!d) throw new Error(`Metric "${id}" is not registered: add it to src/views/comp/metrics.ts.`)
  return d
}

/** The KPI popover text: the dictionary definition, then the settings in force. */
export function metricText(m: Defs, r: CompRules, id: CompMetricId): string {
  const extra = settingsSentence(id, r)
  const text = defOf(m, id).definition
  return extra ? `${text} ${extra}` : text
}

/** A definitions row: the metric's name, its dictionary wording and its formula. */
export function metricRow(m: Defs, r: CompRules, id: CompMetricId): MetricDefinition {
  const d = defOf(m, id)
  const text = metricText(m, r, id)
  return d.formula
    ? { term: d.name, text, formula: d.formula, metricId: id }
    : { term: d.name, text, metricId: id }
}

/** "Groups under 5 people are hidden or folded into Other." */
export const anonymityText = (r: Pick<CompRules, 'minGroup'>): string =>
  `Groups under ${int(r.minGroup)} people are hidden or folded into Other.`

/** Who a figure counts: the metric's population note, then the anonymity rule. */
export function populationRow(m: Defs, r: CompRules, id: CompMetricId): Definition {
  const p = defOf(m, id).population
  return { term: 'Population', text: p ? `${p} ${anonymityText(r)}` : anonymityText(r) }
}

/** Voluntary attrition is People stats' metric: its row reads the dictionary the same way. */
const VOLUNTARY_ID = 'hrbp.attrition.voluntary'
function voluntaryRow(m: Defs): MetricDefinition[] {
  const d = m.def(VOLUNTARY_ID)
  if (!d) return []
  return [
    d.formula
      ? { term: d.name, text: d.definition, formula: d.formula, metricId: VOLUNTARY_ID }
      : { term: d.name, text: d.definition, metricId: VOLUNTARY_ID },
  ]
}

/** Every figure's definitions panel, from the dictionary with your wording and the settings in force. */
export function figureDefinitions(m: Defs, r: CompRules): Record<FigureId, Definition[]> {
  const row = (id: CompMetricId) => metricRow(m, r, id)
  const pop = (id: CompMetricId) => populationRow(m, r, id)
  const compaGroup = [row(M.compaMedian), row(M.lowCompa), row(M.inBand), pop(M.compaMedian)]
  const marketBars = [row(M.marketGap), row(M.marketVsMid), row(M.belowMarket), pop(M.marketGap)]
  return {
    'comp-compa-distribution': [row(M.compaRatio), row(M.inBand), pop(M.compaRatio)],
    'comp-position-by-bu': [row(M.positionMix), pop(M.positionMix)],
    'comp-compa-by-location': compaGroup,
    'comp-compa-by-level': compaGroup,
    'comp-compa-by-department': compaGroup,
    'comp-pay-attrition': [row(M.compaMedian), ...voluntaryRow(m), DEF_NO_AMOUNTS, pop(M.compaMedian)],
    'comp-compa-location-level': [row(M.compaMedian), DEF_LEVEL_GROUPS, DEF_NO_AMOUNTS, pop(M.compaMedian)],
    'comp-penetration-by-level': [row(M.penetration), pop(M.penetration)],
    'comp-compa-by-tenure': [row(M.compaRatio), row(M.positionMix)],
    'comp-below-min-cause': [row(M.belowMin), DEF_BELOW_CAUSE, DEF_NO_AMOUNTS],
    'comp-below-minimum': [row(M.belowMin), row(M.increaseToMin), DEF_FX],
    'comp-above-maximum': [row(M.aboveMax), row(M.overMax), DEF_FX],
    'comp-compression': [row(M.compression), row(M.compaRatio)],
    'comp-compa-by-rating': [row(M.compaRatio), DEF_LATEST_RATING],
    'comp-merit-by-rating': [row(M.vsGuideline), DEF_LATEST_RATING],
    'comp-merit-matrix': [row(M.vsGuideline), row(M.positionMix), DEF_LATEST_RATING],
    'comp-differentiation-by-department': [row(M.differentiation), DEF_LATEST_RATING],
    'comp-bonus-by-rating': [row(M.bonus), DEF_ANNUAL_RATING],
    'comp-equity-by-rating': [row(M.equity), DEF_LATEST_RATING],
    'comp-market-vs-range': [
      row(M.marketVsMid),
      row(M.compaMedian),
      row(M.marketGap),
      DEF_NO_AMOUNTS,
      pop(M.marketGap),
    ],
    'comp-market-by-function': marketBars,
    'comp-market-by-location': marketBars,
    'comp-market-by-level': marketBars,
    'comp-jobs-below-market': [row(M.marketGap), row(M.marketVsMid), pop(M.marketGap)],
    'comp-spend-by-bu': [row(M.spend), row(M.overBudget), DEF_FX],
    'comp-merit-distribution': [row(M.meritPct), row(M.spend)],
    'comp-guideline-exceptions': [row(M.exceptions), row(M.vsGuideline), DEF_LATEST_RATING],
    'comp-promotions': [row(M.promotions), DEF_LATEST_RATING],
    'comp-rewards-mix': [row(M.mix), DEF_FX],
  }
}
