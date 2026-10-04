/**
 * Columns for every Compensation figure: what the table view shows and every export writes.
 * Amount columns are marked `pay: true` so they disappear unless pay amounts are switched on.
 * Module constants keep figure registrations stable across renders.
 */
import type { Column, Definition } from '@/charts'
import { fmt } from '@/lib/format'
import type { Bin, ExceptionRow, PromotionRow, RewardsMixRow, SpendRow } from './engine/cycle'
import type { JobMarketRow, MarketRow } from './engine/market'
import type { PersonRow } from './engine/model'
import type {
  BonusByRatingRow,
  DifferentiationRow,
  EquityByRatingRow,
  MatrixCell,
  MeritByRatingRow,
  RatingDot,
} from './engine/performance'
import type {
  CompaGroupRow,
  CompressionRow,
  OutsideRangeRow,
  PenetrationRow,
  PositionMixRow,
  TenureDot,
} from './engine/ranges'
import type { CycleSettings } from './engine/settings'

export const BIN_COLUMNS: Column<Bin>[] = [
  { key: 'from', label: 'From', format: 'ratio' },
  { key: 'to', label: 'To', format: 'ratio' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'share', label: 'Share', format: 'pct' },
]

export const MERIT_BIN_COLUMNS: Column<Bin>[] = [
  { key: 'from', label: 'Merit from', format: 'pct2' },
  { key: 'to', label: 'Merit to', format: 'pct2' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'share', label: 'Share', format: 'pct' },
]

export const PERSON_COLUMNS: Column<PersonRow>[] = [
  { key: 'id', label: 'Employee ID', format: 'text' },
  { key: 'name', label: 'Name', format: 'text' },
  { key: 'department', label: 'Department', format: 'text' },
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'location', label: 'Location', format: 'text' },
  { key: 'compa', label: 'Compa-ratio', format: 'ratio' },
  { key: 'position', label: 'Range position', format: 'text' },
]

export const POSITION_COLUMNS: Column<PositionMixRow>[] = [
  { key: 'group', label: 'Group', format: 'text' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'below', label: 'Below minimum', format: 'pct' },
  { key: 'q1', label: 'Q1', format: 'pct' },
  { key: 'q2', label: 'Q2', format: 'pct' },
  { key: 'q3', label: 'Q3', format: 'pct' },
  { key: 'q4', label: 'Q4', format: 'pct' },
  { key: 'above', label: 'Above maximum', format: 'pct' },
]

export const compaColumns = (groupLabel: string): Column<CompaGroupRow>[] => [
  { key: 'group', label: groupLabel, format: 'text' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'median', label: 'Median compa-ratio', format: 'ratio' },
  { key: 'p25', label: '25th percentile', format: 'ratio' },
  { key: 'p75', label: '75th percentile', format: 'ratio' },
  { key: 'inBand', label: 'In healthy band', format: 'pct' },
  { key: 'belowMin', label: 'Below minimum', format: 'int' },
  { key: 'aboveMax', label: 'Above maximum', format: 'int' },
]
export const COMPA_BY_LOCATION = compaColumns('Location')
export const COMPA_BY_LEVEL = compaColumns('Level')
export const COMPA_BY_DEPARTMENT = compaColumns('Department')

export const PENETRATION_COLUMNS: Column<PenetrationRow>[] = [
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'p10', label: '10th percentile', format: 'pct0' },
  { key: 'q1', label: '25th percentile', format: 'pct0' },
  { key: 'median', label: 'Median', format: 'pct0' },
  { key: 'q3', label: '75th percentile', format: 'pct0' },
  { key: 'p90', label: '90th percentile', format: 'pct0' },
]

export const TENURE_DOT_COLUMNS: Column<TenureDot>[] = [
  { key: 'id', label: 'Employee ID', format: 'text' },
  { key: 'name', label: 'Name', format: 'text' },
  { key: 'tenureBand', label: 'Tenure band', format: 'text' },
  { key: 'tenure', label: 'Tenure', format: 'years' },
  { key: 'compa', label: 'Compa-ratio', format: 'ratio' },
  { key: 'position', label: 'Range position', format: 'text' },
]

export const BELOW_MIN_COLUMNS: Column<OutsideRangeRow>[] = [
  { key: 'id', label: 'Employee ID', format: 'text' },
  { key: 'name', label: 'Name', format: 'text' },
  { key: 'department', label: 'Department', format: 'text' },
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'location', label: 'Location', format: 'text' },
  { key: 'compa', label: 'Compa-ratio', format: 'ratio' },
  { key: 'gapPct', label: 'Increase to minimum', format: 'pct' },
  { key: 'gapUsd', label: 'Gap to minimum (USD)', format: 'moneyFull', pay: true },
  { key: 'promoted', label: 'Promoted in last 12 months', format: 'text' },
]

export const ABOVE_MAX_COLUMNS: Column<OutsideRangeRow>[] = [
  { key: 'id', label: 'Employee ID', format: 'text' },
  { key: 'name', label: 'Name', format: 'text' },
  { key: 'department', label: 'Department', format: 'text' },
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'location', label: 'Location', format: 'text' },
  { key: 'tenure', label: 'Tenure', format: 'years' },
  { key: 'compa', label: 'Compa-ratio', format: 'ratio' },
  { key: 'gapPct', label: 'Over maximum', format: 'pct' },
  { key: 'gapUsd', label: 'Over maximum (USD)', format: 'moneyFull', pay: true },
]

export const COMPRESSION_COLUMNS: Column<CompressionRow>[] = [
  { key: 'department', label: 'Department', format: 'text' },
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'newN', label: 'New hires', format: 'int' },
  { key: 'newMedian', label: 'New-hire median', format: 'ratio' },
  { key: 'incN', label: 'Incumbents', format: 'int' },
  { key: 'incMedian', label: 'Incumbent median', format: 'ratio' },
  { key: 'gap', label: 'Gap', format: 'num2' },
]

export const RATING_DOT_COLUMNS: Column<RatingDot>[] = [
  { key: 'id', label: 'Employee ID', format: 'text' },
  { key: 'name', label: 'Name', format: 'text' },
  { key: 'rating', label: 'Latest rating', format: 'text' },
  { key: 'compa', label: 'Compa-ratio', format: 'ratio' },
]

export const MERIT_BY_RATING_COLUMNS: Column<MeritByRatingRow>[] = [
  { key: 'rating', label: 'Latest rating', format: 'text' },
  { key: 'n', label: 'Proposals', format: 'int' },
  { key: 'mean', label: 'Mean merit', format: 'pct2' },
  { key: 'median', label: 'Median merit', format: 'pct2' },
  { key: 'guideline', label: 'Guideline', format: 'pct2' },
  { key: 'diff', label: 'Mean vs guideline', format: 'pts' },
]

export const MATRIX_COLUMNS: Column<MatrixCell>[] = [
  { key: 'rating', label: 'Latest rating', format: 'text' },
  { key: 'position', label: 'Range position', format: 'text' },
  { key: 'n', label: 'Proposals', format: 'int' },
  { key: 'mean', label: 'Mean merit', format: 'pct2' },
  { key: 'guideline', label: 'Guideline', format: 'pct2' },
  { key: 'diff', label: 'Mean vs guideline', format: 'pts' },
]

export const DIFFERENTIATION_COLUMNS: Column<DifferentiationRow>[] = [
  { key: 'group', label: 'Department', format: 'text' },
  { key: 'n45', label: 'Rated 4-5', format: 'int' },
  { key: 'merit45', label: 'Mean merit, 4-5', format: 'pct2' },
  { key: 'n3', label: 'Rated 3', format: 'int' },
  { key: 'merit3', label: 'Mean merit, 3', format: 'pct2' },
  { key: 'ratio', label: 'Ratio', format: 'times' },
]

export const BONUS_COLUMNS: Column<BonusByRatingRow>[] = [
  { key: 'rating', label: 'Annual rating', format: 'text' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'mean', label: 'Mean payout of target', format: 'pct' },
  { key: 'median', label: 'Median payout of target', format: 'pct' },
]

export const EQUITY_COLUMNS: Column<EquityByRatingRow>[] = [
  { key: 'rating', label: 'Latest rating', format: 'text' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'median', label: 'Median equity as share of base', format: 'pct' },
]

export const marketColumns = (groupLabel: string): Column<MarketRow>[] => [
  { key: 'group', label: groupLabel, format: 'text' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'median', label: 'Median market ratio', format: 'ratio' },
  { key: 'gap', label: 'Gap to market', format: 'pct' },
  { key: 'marketVsMid', label: 'Market median ÷ midpoint', format: 'ratio' },
]
export const MARKET_BY_FAMILY = marketColumns('Job family')
export const MARKET_BY_LOCATION = marketColumns('Location')
export const MARKET_BY_LEVEL = marketColumns('Level')
export const JOBS_COLUMNS: Column<JobMarketRow>[] = [
  { key: 'jobFamily', label: 'Job family', format: 'text' },
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'median', label: 'Median market ratio', format: 'ratio' },
  { key: 'gap', label: 'Gap to market', format: 'pct' },
  { key: 'marketVsMid', label: 'Market median ÷ midpoint', format: 'ratio' },
]

export const SPEND_COLUMNS: Column<SpendRow>[] = [
  { key: 'group', label: 'Business unit', format: 'text' },
  { key: 'n', label: 'Proposals', format: 'int' },
  { key: 'spendPct', label: 'Merit spend', format: 'pct2' },
  { key: 'budgetPct', label: 'Budget', format: 'pct2' },
  { key: 'delta', label: 'Spend vs budget', format: 'pts' },
  { key: 'eligibleBaseUsd', label: 'Eligible base (USD)', format: 'moneyFull', pay: true },
  { key: 'spendUsd', label: 'Merit spend (USD)', format: 'moneyFull', pay: true },
  { key: 'overUsd', label: 'Spend vs budget (USD)', format: 'moneyFull', pay: true },
]

export const EXCEPTION_COLUMNS: Column<ExceptionRow>[] = [
  { key: 'id', label: 'Employee ID', format: 'text' },
  { key: 'name', label: 'Name', format: 'text' },
  { key: 'department', label: 'Department', format: 'text' },
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'rating', label: 'Rating', format: 'int' },
  { key: 'merit', label: 'Merit', format: 'pct2' },
  { key: 'guideline', label: 'Guideline', format: 'pct2' },
  { key: 'diff', label: 'Merit vs guideline', format: 'pts' },
  { key: 'z', label: 'Distance from typical for the rating', format: 'num1' },
  { key: 'promotion', label: 'Promotion', format: 'pct' },
  { key: 'rule', label: 'Why it is listed', format: 'text' },
]

export const PROMOTION_COLUMNS: Column<PromotionRow>[] = [
  { key: 'id', label: 'Employee ID', format: 'text' },
  { key: 'name', label: 'Name', format: 'text' },
  { key: 'department', label: 'Department', format: 'text' },
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'rating', label: 'Rating', format: 'int' },
  { key: 'merit', label: 'Merit', format: 'pct2' },
  { key: 'promotion', label: 'Promotion', format: 'pct' },
  { key: 'total', label: 'Total increase', format: 'pct' },
]

export const MIX_COLUMNS: Column<RewardsMixRow>[] = [
  { key: 'level', label: 'Level', format: 'text' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'base', label: 'Base', format: 'pct' },
  { key: 'bonus', label: 'Target bonus', format: 'pct' },
  { key: 'equity', label: 'Equity', format: 'pct' },
]

/* ───────── definitions ───────── */

export const DEF_COMPA: Definition = {
  term: 'Compa-ratio',
  text: 'Base salary divided by the midpoint of the salary range for the job and location. 1.00 is paid at the midpoint.',
  formula: 'baseSalary ÷ rangeMid',
}
export const DEF_PENETRATION: Definition = {
  term: 'Range penetration',
  text: 'How far into the range base salary sits: 0% at the minimum, 100% at the maximum. Not capped, so below 0% is under the minimum.',
  formula: '(base − rangeMin) ÷ (rangeMax − rangeMin)',
}
export const DEF_POSITION: Definition = {
  term: 'Range position',
  text: 'Below minimum, the four quarters of the range (Q1 lowest to Q4 highest), or above maximum. Pay equal to the minimum or maximum counts as inside the range.',
}
export const DEF_MARKET: Definition = {
  term: 'Market ratio',
  text: 'Base salary divided by the market median (50th percentile) for the job. Below 1.00 is below market.',
  formula: 'baseSalary ÷ marketP50',
}
export const DEF_MARKET_MID: Definition = {
  term: 'Market median ÷ midpoint',
  text: 'How the salary range tracks the market. Above 1.00 means the market pays more than the range midpoint.',
  formula: 'marketP50 ÷ rangeMid',
}
export const DEF_POPULATION: Definition = {
  term: 'Population',
  text: 'Active employees on the as-of date who have a compensation record. Contractors and interns are not included. Groups under 5 people are hidden or folded into Other.',
}
export const DEF_LATEST_RATING: Definition = {
  term: 'Latest rating',
  text: 'The most recent performance rating on or before the as-of date, the one merit proposals are drafted against.',
}
export const DEF_DIFFERENTIATION: Definition = {
  term: 'Pay for performance',
  text: 'Mean merit for people rated 4-5 divided by mean merit for people rated 3, on each person’s latest rating. Below 1.15× means ratings make little difference to pay. Needs 5 people on each side.',
  formula: 'mean(merit | rating 4-5) ÷ mean(merit | rating 3)',
}
export const DEF_COMPRESSION: Definition = {
  term: 'Pay compression',
  text: 'Median compa-ratio of people hired in the last 12 months against people already in the same department and level. Shown where both sides have 5 or more people; a gap of 0.05 or more with 10 or more on each side reaches the readout.',
  formula: 'median(compa | new hires) − median(compa | incumbents)',
}
export const DEF_SPEND: Definition = {
  term: 'Merit spend',
  text: 'Proposed merit as a share of eligible base salary, both converted to USD. Eligible means the person has a merit proposal. Promotion increases are reported apart and never counted as merit.',
  formula: 'Σ(base × fxToUsd × merit %) ÷ Σ(base × fxToUsd)',
}
export const DEF_FX: Definition = {
  term: 'Currency',
  text: 'Amounts are converted to US dollars with each row’s FX rate. Rows without a rate keep their ratios but are left out of USD totals.',
}
export const DEF_EXCEPTIONS: Definition = {
  term: 'Guideline exception',
  text: 'Rating 5 with merit under 2%, or rating 1-2 with merit over 3%. Proposals that break neither rule but sit far from the typical merit for the rating are listed as unusual. Distance from typical counts robust deviations from the median merit for the rating across the company: beyond 3.5 either way is unusual, and the sign says above or below.',
  formula: 'distance = 0.6745 × (merit − median) ÷ MAD, within the rating',
}

export function bandDefinition(s: CycleSettings): Definition {
  return {
    term: 'Healthy band',
    text: `Compa-ratio from ${fmt(s.bandLow, 'ratio')} to ${fmt(s.bandHigh, 'ratio')}, inclusive. Set it in Cycle settings.`,
  }
}

export function guidelineDefinition(s: CycleSettings): Definition {
  const g = s.guideline
  return {
    term: 'Merit guideline',
    text: `Merit by rating from Cycle settings: 5 at ${fmt(g[5], 'pct')}, 4 at ${fmt(g[4], 'pct')}, 3 at ${fmt(g[3], 'pct')}, 2 at ${fmt(g[2], 'pct')}, 1 at ${fmt(g[1], 'pct')}.`,
  }
}

export function budgetDefinition(s: CycleSettings): Definition {
  return { term: 'Budget', text: `${fmt(s.meritBudget, 'pct2')} of eligible base, from Cycle settings.` }
}
