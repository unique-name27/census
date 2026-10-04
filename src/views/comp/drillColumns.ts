/**
 * Table columns that open the records behind each count and rate: the figure columns from
 * columns.ts with `drill` added per cell. A cell drills only when its number has people behind
 * it (a hidden or zero value stays plain text). Pure; the specs are built on click.
 */
import type { Column } from '@/charts'
import type { DrillSource } from '@/drill/Drill'
import type { DrillSpec } from '@/drill/types'
import {
  ABOVE_MAX_COLUMNS,
  BELOW_MIN_COLUMNS,
  BIN_COLUMNS,
  BONUS_COLUMNS,
  COMPRESSION_COLUMNS,
  compaColumns,
  DIFFERENTIATION_COLUMNS,
  EQUITY_COLUMNS,
  EXCEPTION_COLUMNS,
  JOBS_COLUMNS,
  MATRIX_COLUMNS,
  MERIT_BIN_COLUMNS,
  MERIT_BY_RATING_COLUMNS,
  MIX_COLUMNS,
  marketColumns,
  PENETRATION_COLUMNS,
  POSITION_COLUMNS,
  PROMOTION_COLUMNS,
  SPEND_COLUMNS,
} from './columns'
import type { Bin, ExceptionRow, PromotionRow, RewardsMixRow, SpendRow } from './engine/cycle'
import {
  bonusDrill,
  type CompaMeasure,
  compaBinDrill,
  compaGroupDrill,
  compressionDrill,
  type DrillScope,
  differentiationDrill,
  differentiationPeople,
  equityDrill,
  exceptionsDrill,
  lazyDrill,
  marketDrill,
  matrixDrill,
  meritBinDrill,
  meritRatingDrill,
  mixDrill,
  outsideDrill,
  penetrationDrill,
  positionDrill,
  promotionsDrill,
  type RatingSide,
  spendDrill,
} from './engine/drill'
import type { JobMarketRow, MarketRow } from './engine/market'
import type {
  BonusByRatingRow,
  DifferentiationRow,
  EquityByRatingRow,
  MatrixCell,
  MeritByRatingRow,
} from './engine/performance'
import { type CompPerson, POSITIONS } from './engine/population'
import {
  type CompaGroupRow,
  type CompressionRow,
  type OutsideRangeRow,
  type PenetrationRow,
  POSITION_FIELD,
  type PositionMixRow,
} from './engine/ranges'

type DrillBy<T> = Partial<Record<string, (row: T) => DrillSource>>

/** `cols` with `drill` set on the keys in `by`. */
export function withDrill<T>(cols: readonly Column<T>[], by: DrillBy<T>): Column<T>[] {
  return cols.map((c) => {
    const d = by[c.key]
    return d ? { ...c, drill: d } : c
  })
}

/** Drill only when the row has people behind it and the cell's number is not zero or hidden. */
const when =
  <T extends { members: readonly unknown[] }>(
    value: (r: T) => number | null | undefined,
    make: (r: T) => () => DrillSpec | null,
  ) =>
  (r: T): DrillSource =>
    lazyDrill(r.members.length ? value(r) : 0, make(r))

/* ───────── overview and ranges ───────── */

export function compaGroupColumns(groupLabel: string, m: DrillScope): Column<CompaGroupRow>[] {
  const by = (what: CompaMeasure, value: (r: CompaGroupRow) => number | null) =>
    when<CompaGroupRow>(value, (r) => () => compaGroupDrill(m, r, what))
  return withDrill(compaColumns(groupLabel), {
    n: by('measured', (r) => r.n),
    median: by('measured', (r) => r.median),
    p25: by('measured', (r) => r.p25),
    p75: by('measured', (r) => r.p75),
    inBand: by('inBand', (r) => r.inBand),
    belowMin: by('belowMin', (r) => r.belowMin),
    aboveMax: by('aboveMax', (r) => r.aboveMax),
  })
}

export function positionColumns(m: DrillScope): Column<PositionMixRow>[] {
  const by: DrillBy<PositionMixRow> = {
    n: when<PositionMixRow>(
      (r) => r.n,
      (r) => () => positionDrill(m, r, null),
    ),
  }
  for (const pos of POSITIONS) {
    const key = POSITION_FIELD[pos]
    by[key] = when<PositionMixRow>(
      (r) => r[key],
      (r) => () => positionDrill(m, r, pos),
    )
  }
  return withDrill(POSITION_COLUMNS, by)
}

/**
 * Histogram input that bins exactly like the engine: one item per person at the middle of the
 * engine bin they fall in, so a bar's height, its table row and its drill always agree (a value
 * a hair under an edge can't land in a different bin on screen).
 */
export function binItems(bins: readonly Bin<CompPerson>[]): { v: number; bin: number }[] {
  return bins.flatMap((b, bin) => b.members.map(() => ({ v: (b.from + b.to) / 2, bin })))
}

/** Histogram bins: the people count opens the people in the bin. */
export function binColumns(
  m: DrillScope,
  bins: readonly Bin<CompPerson>[],
  kind: 'compa' | 'merit',
): Column<Bin<CompPerson>>[] {
  const make = kind === 'compa' ? compaBinDrill : meritBinDrill
  const drillBin = (r: Bin<CompPerson>) =>
    lazyDrill(r.members.length, () => make(m, r, r === bins[bins.length - 1]))
  return withDrill(kind === 'compa' ? BIN_COLUMNS : MERIT_BIN_COLUMNS, { n: drillBin, share: drillBin })
}

export function penetrationColumns(m: DrillScope): Column<PenetrationRow>[] {
  const all = when<PenetrationRow>(
    (r) => r.n,
    (r) => () => penetrationDrill(m, r),
  )
  return withDrill(PENETRATION_COLUMNS, { n: all, p10: all, q1: all, median: all, q3: all, p90: all })
}

export function compressionColumns(m: DrillScope): Column<CompressionRow>[] {
  const side = (s: 'hires' | 'incumbents' | null) => (r: CompressionRow) =>
    lazyDrill(r.hires.length + r.incumbents.length, () => compressionDrill(m, r, s))
  return withDrill(COMPRESSION_COLUMNS, {
    newN: side('hires'),
    newMedian: side('hires'),
    incN: side('incumbents'),
    incMedian: side('incumbents'),
    gap: side(null),
  })
}

/** Person tables: the gap opens that person's comp row with the gap beside it. */
export function outsideColumns(m: DrillScope, side: 'below' | 'above'): Column<OutsideRangeRow>[] {
  const one = (r: OutsideRangeRow) =>
    lazyDrill(1, () =>
      outsideDrill(m, side, [r.person], `${r.name}, ${side === 'below' ? 'below minimum' : 'above maximum'}`),
    )
  return withDrill(side === 'below' ? BELOW_MIN_COLUMNS : ABOVE_MAX_COLUMNS, { gapPct: one })
}

/* ───────── pay for performance ───────── */

export function meritRatingColumns(m: DrillScope): Column<MeritByRatingRow>[] {
  const all = when<MeritByRatingRow>(
    (r) => r.n,
    (r) => () => meritRatingDrill(m, r),
  )
  return withDrill(MERIT_BY_RATING_COLUMNS, { n: all, mean: all, median: all, diff: all })
}

export function matrixColumns(m: DrillScope): Column<MatrixCell>[] {
  const all = when<MatrixCell>(
    (r) => r.n,
    (r) => () => matrixDrill(m, r),
  )
  return withDrill(MATRIX_COLUMNS, { n: all, mean: all, diff: all })
}

export function differentiationColumns(m: DrillScope): Column<DifferentiationRow>[] {
  const side =
    (s: RatingSide | null, value: (r: DifferentiationRow) => number | null) => (r: DifferentiationRow) =>
      lazyDrill(differentiationPeople(r, s).length ? value(r) : 0, () =>
        differentiationDrill(m, r, r.group, s),
      )
  return withDrill(DIFFERENTIATION_COLUMNS, {
    n45: side('45', (r) => r.n45),
    merit45: side('45', (r) => r.merit45),
    n3: side('3', (r) => r.n3),
    merit3: side('3', (r) => r.merit3),
    ratio: side(null, (r) => r.ratio),
  })
}

export function bonusColumns(m: DrillScope): Column<BonusByRatingRow>[] {
  const all = when<BonusByRatingRow>(
    (r) => r.n,
    (r) => () => bonusDrill(m, r),
  )
  return withDrill(BONUS_COLUMNS, { n: all, mean: all, median: all })
}

export function equityColumns(m: DrillScope): Column<EquityByRatingRow>[] {
  const all = when<EquityByRatingRow>(
    (r) => r.n,
    (r) => () => equityDrill(m, r),
  )
  return withDrill(EQUITY_COLUMNS, { n: all, median: all })
}

/* ───────── market ───────── */

export function marketDrillColumns(groupLabel: string, m: DrillScope): Column<MarketRow>[] {
  const all = when<MarketRow>(
    (r) => r.n,
    (r) => () => marketDrill(m, r),
  )
  return withDrill(marketColumns(groupLabel), { n: all, median: all, gap: all, marketVsMid: all })
}

export function jobsColumns(m: DrillScope): Column<JobMarketRow>[] {
  const all = when<JobMarketRow>(
    (r) => r.n,
    (r) => () => marketDrill(m, r),
  )
  return withDrill(JOBS_COLUMNS, { n: all, median: all, gap: all, marketVsMid: all })
}

/* ───────── merit cycle ───────── */

export function spendColumns(m: DrillScope): Column<SpendRow>[] {
  const priced = when<SpendRow>(
    (r) => r.n,
    (r) => () => spendDrill(m, r, 'priced'),
  )
  return withDrill(SPEND_COLUMNS, {
    n: when<SpendRow>(
      (r) => r.n,
      (r) => () => spendDrill(m, r, 'eligible'),
    ),
    spendPct: priced,
    delta: priced,
    eligibleBaseUsd: priced,
    spendUsd: priced,
    overUsd: priced,
  })
}

/** Exceptions: the gap to the guideline opens that proposal with the reason it is listed. */
export function exceptionColumns(m: DrillScope): Column<ExceptionRow>[] {
  const one = (r: ExceptionRow) =>
    lazyDrill(1, () => exceptionsDrill(m, [r], `${r.name}, ${r.rule.toLowerCase()}`))
  return withDrill(EXCEPTION_COLUMNS, { diff: one, z: one })
}

export function promotionColumns(m: DrillScope): Column<PromotionRow>[] {
  const one = (r: PromotionRow) =>
    lazyDrill(1, () => promotionsDrill(m, [r], `${r.name}, promotion proposed`))
  return withDrill(PROMOTION_COLUMNS, { promotion: one, total: one })
}

export function mixColumns(m: DrillScope): Column<RewardsMixRow>[] {
  const part = (p: string | null, value: (r: RewardsMixRow) => number | null) =>
    when<RewardsMixRow>(value, (r) => () => mixDrill(m, r, p))
  return withDrill(MIX_COLUMNS, {
    n: part(null, (r) => r.n),
    base: part('Base', (r) => r.base),
    bonus: part('Target bonus', (r) => r.bonus),
    equity: part('Equity', (r) => r.equity),
  })
}
