/**
 * The merit cycle: spend against budget (USD, eligible base), the spend the guideline itself
 * implies, guideline exceptions, robust merit outliers within each rating, promotions (kept apart
 * from merit) and the total rewards mix. Pure.
 */
import type { Severity } from '@/components/types'
import { LEVELS, MIN_GROUP } from '@/data/schema'
import { isNum } from '@/lib/format'
import { median, sum } from '@/lib/stats'
import { groupRows, safeMedian, safeShare, values } from './groups'
import type { CompPerson } from './population'
import { type CycleSettings, guidelineFor, type RatingKey, ratingKey } from './settings'
import { shownGap } from './text'

/** Guideline rules from the spec: a top rating should get at least 2%, a low rating at most 3%. */
export const TOP_RATING_FLOOR = 0.02
export const LOW_RATING_CAP = 0.03
/** Robust outlier test within a rating: |0.6745 × (x − median) ÷ MAD| above this. */
export const OUTLIER_Z = 3.5
/** MAD floor so a tightly clustered rating doesn't flag tiny differences (0.25 pts). */
export const MAD_FLOOR = 0.0025
/** Peer groups smaller than this get no outlier test. */
export const OUTLIER_MIN_PEERS = 10
/** A business unit or scope this far over budget (fraction points) is flagged. */
export const OVER_BUDGET = 0.002
/** This far over budget (fraction points) the flag becomes critical, at any level. */
export const OVER_BUDGET_CRITICAL = 0.01

/** One severity rule for overspend, so a business unit and a whole scope are judged alike. */
export const overBudgetSeverity = (delta: number): Severity =>
  delta >= OVER_BUDGET_CRITICAL - 1e-9 ? 'critical' : 'warning'

export interface SpendSummary {
  /** People with a merit proposal. */
  eligible: number
  /** Eligible people with an FX rate (the USD totals cover these). */
  priced: number
  skippedFx: number
  spendPct: number | null
  eligibleBaseUsd: number
  spendUsd: number
  budgetPct: number
  budgetUsd: number
  /** spendPct − budget, in fraction points. */
  delta: number | null
  /** spendUsd − budgetUsd. */
  overUsd: number | null
  /** Eligible, priced people with a rating: the people the guideline spend covers. */
  rated: number
  /**
   * Spend the guideline implies: each rated proposal at the guideline for its rating, weighted by
   * base like the actual spend (not prorated, so it compares like with like). Null under 5 people.
   */
  guidelinePct: number | null
  /** Mean merit % over people with a proposal; null under 5 people. */
  meanMerit: number | null
  /** The people with a merit proposal (select priced and rated ones with the drill helpers). */
  members: CompPerson[]
}

export function meritSpend(people: readonly CompPerson[], s: CycleSettings): SpendSummary {
  const eligible = people.filter((p) => p.merit != null)
  const priced = eligible.filter((p) => p.baseUsd != null)
  const base = sum(priced.map((p) => p.baseUsd!))
  const spend = sum(priced.map((p) => p.baseUsd! * p.merit!))
  const rated = priced.filter((p) => guidelineFor(s, p.rating) != null)
  const ratedBase = sum(rated.map((p) => p.baseUsd!))
  const guided = sum(rated.map((p) => p.baseUsd! * guidelineFor(s, p.rating)!))
  const spendPct = base > 0 ? spend / base : null
  return {
    eligible: eligible.length,
    priced: priced.length,
    skippedFx: eligible.length - priced.length,
    spendPct,
    eligibleBaseUsd: base,
    spendUsd: spend,
    budgetPct: s.meritBudget,
    budgetUsd: base * s.meritBudget,
    // From the shown values (two decimals), so "3.54% vs the 3.50% budget" reads "+0.04 pts".
    delta: spendPct == null ? null : shownGap(spendPct, s.meritBudget),
    overUsd: base > 0 ? spend - base * s.meritBudget : null,
    rated: rated.length,
    guidelinePct: ratedBase > 0 && rated.length >= MIN_GROUP ? guided / ratedBase : null,
    meanMerit: eligible.length >= MIN_GROUP ? sum(eligible.map((p) => p.merit!)) / eligible.length : null,
    members: eligible,
  }
}

export interface SpendRow {
  group: string
  n: number
  spendPct: number | null
  budgetPct: number
  delta: number | null
  eligibleBaseUsd: number | null
  spendUsd: number | null
  overUsd: number | null
  /** The proposals in the group; empty when its spend is hidden (fewer than 5 priced). */
  members: CompPerson[]
}

/** Merit spend per group (groups under 5 eligible people folded into Other). */
export function spendBy(
  people: readonly CompPerson[],
  key: (p: CompPerson) => string | null,
  s: CycleSettings,
): SpendRow[] {
  const eligible = people.filter((p) => p.merit != null)
  return groupRows(eligible, key).map((g) => {
    const m = meritSpend(g.rows, s)
    const ok = m.priced >= MIN_GROUP
    return {
      group: g.label,
      n: g.rows.length,
      spendPct: ok ? m.spendPct : null,
      budgetPct: s.meritBudget,
      delta: ok ? m.delta : null,
      eligibleBaseUsd: ok ? m.eligibleBaseUsd : null,
      spendUsd: ok ? m.spendUsd : null,
      overUsd: ok ? m.overUsd : null,
      members: ok ? g.rows : [],
    }
  })
}

export interface Bin<T = number> {
  from: number
  to: number
  n: number
  share: number
  /** The items in the bin (the people, for the drill-down). */
  members: T[]
}

/**
 * Equal-width bins over [lo, hi] of `value(item)`; values outside are clamped into the end bins.
 * Last edge inclusive. A value within 1e-9 of an edge counts in the bin that starts there.
 */
export function binBy<T>(
  items: readonly T[],
  value: (t: T) => number,
  lo: number,
  hi: number,
  step: number,
): Bin<T>[] {
  const count = Math.max(1, Math.round((hi - lo) / step))
  const out: Bin<T>[] = Array.from({ length: count }, (_, i) => ({
    from: lo + i * step,
    to: lo + (i + 1) * step,
    n: 0,
    share: 0,
    members: [],
  }))
  for (const it of items) {
    const i = Math.min(count - 1, Math.max(0, Math.floor((value(it) - lo) / step + 1e-9)))
    out[i].n++
    out[i].members.push(it)
  }
  for (const b of out) b.share = items.length ? b.n / items.length : 0
  return out
}

/** Equal-width bins of plain values (see binBy). */
export function binValues(xs: readonly number[], lo: number, hi: number, step: number): Bin[] {
  return binBy(xs, (x) => x, lo, hi, step)
}

/** Bin edges that cover the data on a step grid. */
export function binDomain(xs: readonly number[], step: number, pad = 0): [number, number] | null {
  if (!xs.length) return null
  const lo = Math.floor((Math.min(...xs) - pad) / step + 1e-9) * step
  let hi = Math.ceil((Math.max(...xs) + pad) / step - 1e-9) * step
  if (hi <= lo) hi = lo + step
  return [round6(lo), round6(hi)]
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6

export interface PeerStat {
  n: number
  median: number
  mad: number
}

/** Median and median absolute deviation of merit per rating, for the robust outlier test. */
export function ratingPeerStats(people: readonly CompPerson[]): Map<RatingKey, PeerStat> {
  const by = new Map<RatingKey, number[]>()
  for (const p of people) {
    const k = ratingKey(p.rating)
    if (k == null || !isNum(p.merit)) continue
    const arr = by.get(k)
    if (arr) arr.push(p.merit)
    else by.set(k, [p.merit])
  }
  const out = new Map<RatingKey, PeerStat>()
  for (const [k, xs] of by) {
    const med = median(xs)!
    out.set(k, { n: xs.length, median: med, mad: median(xs.map((x) => Math.abs(x - med)))! })
  }
  return out
}

export interface ExceptionRow {
  id: string
  name: string
  department: string
  level: string
  location: string
  rating: number
  merit: number
  guideline: number
  /** merit − guideline, fraction points. */
  diff: number
  /** Robust z within the rating; null when the peer group is too small. */
  z: number | null
  promotion: number | null
  rule: string
  kind: 'top-low' | 'low-high' | 'outlier'
  /** The person, for the drill-down and the person card. */
  person: CompPerson
}

/**
 * Proposals that break the guideline rules (rating 5 under 2%, rating 1-2 over 3%) plus robust
 * outliers within their rating. Promotion increases are reported but never counted as merit.
 * `peers` should come from the whole company so a filtered scope is judged against everyone.
 */
export function guidelineExceptions(
  people: readonly CompPerson[],
  s: CycleSettings,
  peers: Map<RatingKey, PeerStat>,
): ExceptionRow[] {
  const out: ExceptionRow[] = []
  for (const p of people) {
    const k = ratingKey(p.rating)
    if (k == null || !isNum(p.merit)) continue
    const peer = peers.get(k)
    const z =
      peer && peer.n >= OUTLIER_MIN_PEERS
        ? (0.6745 * (p.merit - peer.median)) / Math.max(peer.mad, MAD_FLOOR)
        : null
    let kind: ExceptionRow['kind'] | null = null
    let rule = ''
    if (k === 5 && p.merit < TOP_RATING_FLOOR) {
      kind = 'top-low'
      rule = 'Rating 5 below 2%'
    } else if (k <= 2 && p.merit > LOW_RATING_CAP) {
      kind = 'low-high'
      rule = 'Rating 1-2 above 3%'
    } else if (z != null && Math.abs(z) > OUTLIER_Z) {
      kind = 'outlier'
      rule = p.merit > peer!.median ? 'High for the rating' : 'Low for the rating'
    }
    if (!kind) continue
    const g = s.guideline[k]
    out.push({
      id: p.id,
      name: p.name,
      department: p.department,
      level: p.level ?? '',
      location: p.location,
      rating: k,
      merit: p.merit,
      guideline: g,
      diff: p.merit - g,
      z: z == null ? null : Math.round(z * 10) / 10,
      promotion: p.promotion,
      rule,
      kind,
      person: p,
    })
  }
  const rank = { 'top-low': 0, 'low-high': 1, outlier: 2 } as const
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || Math.abs(b.diff) - Math.abs(a.diff))
}

export interface PromotionRow {
  id: string
  name: string
  department: string
  level: string
  rating: number | null
  merit: number | null
  promotion: number
  /** Merit plus promotion. */
  total: number
  /** The person, for the drill-down and the person card. */
  person: CompPerson
}

export function promotions(people: readonly CompPerson[]): {
  rows: PromotionRow[]
  share: number | null
  median: number | null
} {
  const rows = people
    .filter((p) => p.promotion != null)
    .map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      level: p.level ?? '',
      rating: ratingKey(p.rating),
      merit: p.merit,
      promotion: p.promotion!,
      total: (p.merit ?? 0) + p.promotion!,
      person: p,
    }))
    .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name))
  const eligible = people.filter((p) => p.merit != null).length
  return {
    rows,
    share: safeShare(rows.length, Math.max(eligible, rows.length)),
    median: safeMedian(values(rows, (r) => r.promotion)),
  }
}

export interface RewardsMixRow {
  level: string
  n: number
  base: number | null
  bonus: number | null
  equity: number | null
  /** The people behind the shares; empty when the shares are hidden. */
  members: CompPerson[]
}

/**
 * Share of target total rewards (base + target bonus + annual equity, all USD) by level.
 * Shares only: the amounts behind them stay inside the engine.
 */
export function rewardsMix(people: readonly CompPerson[], hasEquity: boolean): RewardsMixRow[] {
  const priced = people.filter((p) => p.baseUsd != null && p.targetBonusPct != null)
  return groupRows(priced, (p) => p.level, { order: LEVELS }).map((g) => {
    const base = sum(g.rows.map((p) => p.baseUsd!))
    const bonus = sum(g.rows.map((p) => p.baseUsd! * p.targetBonusPct!))
    const equity = hasEquity ? sum(g.rows.map((p) => p.equityUsd ?? 0)) : 0
    const total = base + bonus + equity
    const ok = g.rows.length >= 5 && total > 0
    return {
      level: g.label,
      n: g.rows.length,
      base: ok ? base / total : null,
      bonus: ok ? bonus / total : null,
      equity: ok && hasEquity ? equity / total : null,
      members: ok ? g.rows : [],
    }
  })
}
