/**
 * Columns for every Compensation figure: what the table view shows and every export writes.
 * Amount columns are marked `pay: true` so they disappear unless pay amounts are switched on.
 * Module constants keep figure registrations stable across renders. Figure definitions come from
 * the metric dictionary (`engine/definitions.ts`).
 */
import type { Column } from '@/charts'
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
import type { CompPerson } from './engine/population'
import type {
  CompaGroupRow,
  CompressionRow,
  OutsideRangeRow,
  PenetrationRow,
  PositionMixRow,
  TenureDot,
} from './engine/ranges'

export const BIN_COLUMNS: Column<Bin<CompPerson>>[] = [
  { key: 'from', label: 'From', format: 'ratio' },
  { key: 'to', label: 'To', format: 'ratio' },
  { key: 'n', label: 'People', format: 'int' },
  { key: 'share', label: 'Share', format: 'pct' },
]

export const MERIT_BIN_COLUMNS: Column<Bin<CompPerson>>[] = [
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
export const MARKET_BY_FUNCTION = marketColumns('Job function')
export const MARKET_BY_LOCATION = marketColumns('Location')
export const MARKET_BY_LEVEL = marketColumns('Level')
export const JOBS_COLUMNS: Column<JobMarketRow>[] = [
  { key: 'job', label: 'Job function', format: 'text' },
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
  { key: 'delta', label: 'Spend vs budget', format: 'pts2' },
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
