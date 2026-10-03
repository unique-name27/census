/**
 * Market position: base pay against the market median for the job (market ratio), by job
 * family, location and level, and the jobs furthest below market. Ratios need no FX. Pure.
 */
import { LEVELS } from '@/data/schema'
import { groupRows, safeMedian, values } from './groups'
import type { CompPerson } from './population'

/** A job family at or below this median market ratio is flagged (5% or more below market). */
export const MARKET_FLAG = 0.95
/** Market medians this far above range midpoints (median market ÷ mid) mean the ranges trail the market. */
export const MARKET_RANGE_GAP = 1.05

export interface MarketRow {
  group: string
  n: number
  /** Median base ÷ market median. */
  median: number | null
  /** median − 1: negative is below market. */
  gap: number | null
  /** Median market median ÷ range midpoint: how the ranges track the market. */
  marketVsMid: number | null
}

function marketRow(group: string, rows: readonly CompPerson[]): MarketRow {
  const xs = values(rows, (p) => p.marketRatio)
  const median = safeMedian(xs)
  return {
    group,
    n: xs.length,
    median,
    gap: median == null ? null : median - 1,
    marketVsMid: safeMedian(values(rows, (p) => p.marketVsMid)),
  }
}

export function marketBy(
  people: readonly CompPerson[],
  key: (p: CompPerson) => string | null,
  order?: readonly string[],
): MarketRow[] {
  const priced = people.filter((p) => p.marketRatio != null)
  return groupRows(priced, key, { order }).map((g) => marketRow(g.label, g.rows))
}

/**
 * The `top` groups furthest below market, lowest first, with every other group's people folded
 * into one "Other (k)" row whose median is computed from those people (not from group medians).
 */
export function marketLowest(
  people: readonly CompPerson[],
  key: (p: CompPerson) => string | null,
  top: number,
): MarketRow[] {
  const priced = people.filter((p) => p.marketRatio != null)
  const groups = groupRows(priced, key)
    .map((g) => ({ g, row: marketRow(g.label, g.rows) }))
    .sort((a, b) => (a.row.median ?? Number.POSITIVE_INFINITY) - (b.row.median ?? Number.POSITIVE_INFINITY))
  if (groups.length <= top + 1) return groups.map((x) => x.row)
  const rest = groups.slice(top)
  const folded = rest.reduce((k, x) => k + Math.max(1, x.g.folded), 0)
  return [
    ...groups.slice(0, top).map((x) => x.row),
    marketRow(
      `Other (${folded})`,
      rest.flatMap((x) => x.g.rows),
    ),
  ]
}

export function marketTotal(people: readonly CompPerson[], label = 'All'): MarketRow {
  return marketRow(
    label,
    people.filter((p) => p.marketRatio != null),
  )
}

export const marketByLevel = (people: readonly CompPerson[]): MarketRow[] =>
  marketBy(people, (p) => p.level, LEVELS)

export interface JobMarketRow extends MarketRow {
  jobFamily: string
  level: string
}

/** Job family × level cells with at least 5 people, lowest market ratio first. */
export function jobsBelowMarket(people: readonly CompPerson[], top = 15): JobMarketRow[] {
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
      ...marketRow(`${c.jobFamily} · ${c.level}`, c.rows),
      jobFamily: c.jobFamily,
      level: c.level,
    }))
    .filter((r) => r.median != null && r.median < 1)
    .sort((a, b) => a.median! - b.median! || a.group.localeCompare(b.group))
    .slice(0, top)
}
