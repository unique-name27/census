/**
 * Market position: base pay against the market median for the job (market ratio), by job
 * family, location and level, and the jobs furthest below market. Ratios need no FX. Pure.
 */
import { LEVELS, MIN_GROUP } from '@/data/schema'
import type { GroupDim } from './groupFilter'
import { behind, groupRows, safeMedian, values } from './groups'
import type { CompPerson } from './population'
import { defaultRules } from './rules'

/*
 * Statistics take the anonymity minimum as `min` (the model passes the one in force). The
 * below-market and ranges-trail thresholds are settings of 'comp.market.belowMarket', read in
 * `rules.ts`; the smallest family ranked is a setting of 'comp.market.gap'.
 */

export interface MarketRow extends GroupDim {
  group: string
  n: number
  /** Median base ÷ market median. */
  median: number | null
  /** median − 1: negative is below market. */
  gap: number | null
  /** Median market median ÷ range midpoint: how the ranges track the market. */
  marketVsMid: number | null
  /** The people with a market median behind the row; empty when it is hidden (n < 5). */
  members: CompPerson[]
}

function marketRow(group: string, rows: readonly CompPerson[], min: number): MarketRow {
  const xs = values(rows, (p) => p.marketRatio)
  const median = safeMedian(xs, min)
  return {
    group,
    n: xs.length,
    median,
    gap: median == null ? null : median - 1,
    marketVsMid: safeMedian(
      values(rows, (p) => p.marketVsMid),
      min,
    ),
    members: behind(
      rows.filter((p) => p.marketRatio != null),
      xs.length,
      min,
    ),
  }
}

export function marketBy(
  people: readonly CompPerson[],
  key: (p: CompPerson) => string | null,
  order?: readonly string[],
  min = MIN_GROUP,
): MarketRow[] {
  const priced = people.filter((p) => p.marketRatio != null)
  return groupRows(priced, key, { order, min }).map((g) => marketRow(g.label, g.rows, min))
}

/**
 * The `top` groups furthest below market, lowest first, with every other group's people folded
 * into one "Other (k)" row whose median is computed from those people (not from group medians).
 * Groups under `minN` people never rank (a 7-person family is too noisy to lead the chart), so
 * they always fold, even alone. Rows come in display order: lowest first, Other last.
 */
export function marketLowest(
  people: readonly CompPerson[],
  key: (p: CompPerson) => string | null,
  top: number,
  minN = defaultRules().marketGap.minFamily,
  min = MIN_GROUP,
): MarketRow[] {
  const priced = people.filter((p) => p.marketRatio != null)
  const all = groupRows(priced, key, { min })
  const ranks = (g: (typeof all)[number]) => !g.folded && g.rows.length >= minN
  const ranked = all
    .filter(ranks)
    .map((g) => ({ g, row: marketRow(g.label, g.rows, min) }))
    .sort((a, b) => (a.row.median ?? Number.POSITIVE_INFINITY) - (b.row.median ?? Number.POSITIVE_INFINITY))
  const small = all.filter((g) => !ranks(g))
  // One ranked group past the cut keeps its name: folding it into "Other (1)" hides nothing.
  if (!small.length && ranked.length <= top + 1) return ranked.map((x) => x.row)
  const rest = [...ranked.slice(top).map((x) => x.g), ...small]
  const folded = rest.reduce((k, g) => k + Math.max(1, g.folded), 0)
  return [
    ...ranked.slice(0, top).map((x) => x.row),
    marketRow(
      `Other (${folded})`,
      rest.flatMap((g) => g.rows),
      min,
    ),
  ]
}

export function marketTotal(people: readonly CompPerson[], label = 'All', min = MIN_GROUP): MarketRow {
  return marketRow(
    label,
    people.filter((p) => p.marketRatio != null),
    min,
  )
}

export const marketByLevel = (people: readonly CompPerson[], min = MIN_GROUP): MarketRow[] =>
  marketBy(people, (p) => p.level, LEVELS, min)

export interface JobMarketRow extends MarketRow {
  jobFamily: string
  level: string
}

/** Job family × level cells with at least `min` people (the anonymity minimum), lowest market ratio first. */
export function jobsBelowMarket(people: readonly CompPerson[], top = 15, min = MIN_GROUP): JobMarketRow[] {
  const cells = new Map<string, { jobFamily: string; level: string; rows: CompPerson[] }>()
  for (const p of people) {
    if (p.marketRatio == null || !p.level) continue
    const k = `${p.jobFamily}\u0000${p.level}`
    let c = cells.get(k)
    if (!c) {
      c = { jobFamily: p.jobFamily, level: p.level, rows: [] }
      cells.set(k, c)
    }
    c.rows.push(p)
  }
  return [...cells.values()]
    .map((c) => ({
      ...marketRow(`${c.jobFamily} · ${c.level}`, c.rows, min),
      jobFamily: c.jobFamily,
      level: c.level,
    }))
    .filter((r) => r.median != null && r.median < 1)
    .sort((a, b) => a.median! - b.median! || a.group.localeCompare(b.group))
    .slice(0, top)
}
