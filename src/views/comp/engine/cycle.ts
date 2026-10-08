/**
 * The merit cycle: spend against budget (USD, eligible base), the spend the guideline itself
 * implies, guideline exceptions, robust merit outliers within each rating, promotions (kept apart
 * from merit) and the total rewards mix. Pure.
 */
import type { Severity } from '@/components/types'
import { type ISODate, LEVELS, MIN_GROUP } from '@/data/schema'
import { daysBetween } from '@/lib/dates'
import { isNum } from '@/lib/format'
import { median, sum } from '@/lib/stats'
import type { CycleDates } from '@/metrics/compCycle'
import type { GroupDim } from './groupFilter'
import { groupRows, safeMedian, safeShare, values } from './groups'
import type { CompPerson, Population } from './population'
import { type CompRules, defaultRules, type ExceptionRules } from './rules'
import { type CycleSettings, guidelineFor, type RatingKey, ratingKey } from './settings'
import { settingPct, shownGap } from './text'

/*
 * The guideline rules (rating 5 floor, rating 1-2 cap), the unusual-proposal test and the
 * over-budget flags are settings of 'comp.merit.exceptions' and 'comp.merit.overBudget', read in
 * `rules.ts`. Statistics take the anonymity minimum as `min`.
 */

/** MAD floor so a tightly clustered rating doesn't flag tiny differences (0.25 pts). */
export const MAD_FLOOR = 0.0025

/** One severity rule for overspend, so a business unit and a whole scope are judged alike. */
export const overBudgetSeverity = (delta: number, critical = defaultRules().overBudget.critical): Severity =>
  delta >= critical - 1e-9 ? 'critical' : 'warning'

/** "Rating 5 below 2%", "Rating 1-2 above 3%": the guideline rules as the tables and readout name them. */
export const topRatingRule = (x: Pick<ExceptionRules, 'topRatingFloor'>): string =>
  `Rating 5 below ${settingPct(x.topRatingFloor)}`
export const lowRatingRule = (x: Pick<ExceptionRules, 'lowRatingCap'>): string =>
  `Rating 1-2 above ${settingPct(x.lowRatingCap)}`

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

export function meritSpend(people: readonly CompPerson[], s: CycleSettings, min = MIN_GROUP): SpendSummary {
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
    guidelinePct: ratedBase > 0 && rated.length >= min ? guided / ratedBase : null,
    meanMerit: eligible.length >= min ? sum(eligible.map((p) => p.merit!)) / eligible.length : null,
    members: eligible,
  }
}

export interface SpendRow extends GroupDim {
  group: string
  n: number
  spendPct: number | null
  budgetPct: number
  delta: number | null
  eligibleBaseUsd: number | null
  spendUsd: number | null
  /** The merit budget in USD (eligible base × budget %); Workforce cost's rows carry it, rounded in Finance. */
  budgetUsd?: number | null
  overUsd: number | null
  /** The proposals in the group; empty when its spend is hidden (fewer than 5 priced). */
  members: CompPerson[]
}

/** Merit spend per group (groups under `min` eligible people folded into Other). */
export function spendBy(
  people: readonly CompPerson[],
  key: (p: CompPerson) => string | null,
  s: CycleSettings,
  min = MIN_GROUP,
): SpendRow[] {
  const eligible = people.filter((p) => p.merit != null)
  return groupRows(eligible, key, { min }).map((g) => {
    const m = meritSpend(g.rows, s, min)
    const ok = m.priced >= min
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
 * Proposals that break the guideline rules (rating 5 under the floor, rating 1-2 over the cap)
 * plus robust outliers within their rating. Promotion increases are reported but never counted
 * as merit. `peers` should come from the whole company so a filtered scope is judged against
 * everyone.
 */
export function guidelineExceptions(
  people: readonly CompPerson[],
  s: CycleSettings,
  peers: Map<RatingKey, PeerStat>,
  x: ExceptionRules = defaultRules().exceptions,
): ExceptionRow[] {
  const out: ExceptionRow[] = []
  for (const p of people) {
    const k = ratingKey(p.rating)
    if (k == null || !isNum(p.merit)) continue
    const peer = peers.get(k)
    const z =
      peer && peer.n >= x.outlierMinPeers
        ? (0.6745 * (p.merit - peer.median)) / Math.max(peer.mad, MAD_FLOOR)
        : null
    let kind: ExceptionRow['kind'] | null = null
    let rule = ''
    if (k === 5 && p.merit < x.topRatingFloor) {
      kind = 'top-low'
      rule = topRatingRule(x)
    } else if (k <= 2 && p.merit > x.lowRatingCap) {
      kind = 'low-high'
      rule = lowRatingRule(x)
    } else if (z != null && Math.abs(z) > x.outlierZ) {
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

export function promotions(
  people: readonly CompPerson[],
  min = MIN_GROUP,
): {
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
    share: safeShare(rows.length, Math.max(eligible, rows.length), min),
    median: safeMedian(
      values(rows, (r) => r.promotion),
      min,
    ),
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
export function rewardsMix(
  people: readonly CompPerson[],
  hasEquity: boolean,
  min = MIN_GROUP,
): RewardsMixRow[] {
  const priced = people.filter((p) => p.baseUsd != null && p.targetBonusPct != null)
  return groupRows(priced, (p) => p.level, { order: LEVELS, min }).map((g) => {
    const base = sum(g.rows.map((p) => p.baseUsd!))
    const bonus = sum(g.rows.map((p) => p.baseUsd! * p.targetBonusPct!))
    const equity = hasEquity ? sum(g.rows.map((p) => p.equityUsd ?? 0)) : 0
    const total = base + bonus + equity
    const ok = g.rows.length >= min && total > 0
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

/* ───────── the cycle's dates and merit cycle progress ───────── */

export type CycleState = 'not-started' | 'not-open' | 'open' | 'closed'

/** The cycle's dates in force, where the as-of date sits among them, and who is eligible. */
export interface CycleCalendar extends CycleDates {
  /**
   * 'not-open' before the open date, 'closed' after the close date, 'open' between them (or with
   * proposals and no dates), 'not-started' with no proposals and no dates.
   */
  state: CycleState
  /** Hired on or before this date is eligible; null when nobody can be judged (no proposals, no setting). */
  cutoff: ISODate | null
  /** The cutoff is the latest hire date among people with a proposal, not a setting. */
  cutoffInferred: boolean
  /** Days from the as-of date to the close date (negative once it has passed); null without one. */
  daysToClose: number | null
  /** Missing proposals are a watch item this many days or fewer before the close date. */
  warnDays: number
}

/**
 * The calendar for the as-of date. The eligibility cutoff is read company-wide (`company`), so a
 * filter never changes who is eligible.
 */
export function cycleCalendar(
  dates: CycleDates,
  company: readonly Pick<CompPerson, 'merit' | 'hireDate'>[],
  asOf: ISODate,
  warnDays: number,
): CycleCalendar {
  let latest: ISODate | null = null
  for (const p of company) if (p.merit != null && (!latest || p.hireDate > latest)) latest = p.hireDate
  const cutoff = dates.eligibleHiredBy ?? latest
  const proposals = latest != null
  const state: CycleState =
    dates.open && asOf < dates.open
      ? 'not-open'
      : dates.close && asOf > dates.close
        ? 'closed'
        : proposals || dates.open
          ? 'open'
          : 'not-started'
  return {
    ...dates,
    state,
    cutoff,
    cutoffInferred: dates.eligibleHiredBy == null && cutoff != null,
    daysToClose: dates.close ? daysBetween(asOf, dates.close) : null,
    warnDays,
  }
}

/** Eligible this cycle: a merit proposal, or hired on or before the cutoff. */
export const isEligible = (p: Pick<CompPerson, 'merit' | 'hireDate'>, cutoff: ISODate | null): boolean =>
  p.merit != null || (cutoff != null && p.hireDate <= cutoff)

/** Spend against budget as a progress row's status. */
export type ProgressStatus = 'over' | 'within'
export const PROGRESS_STATUS_LABEL: Record<ProgressStatus, string> = {
  over: 'Over budget',
  within: 'Within budget',
}

export interface ProgressRow extends GroupDim {
  group: string
  isOther: boolean
  eligible: number
  /** Eligible people with a merit proposal. */
  proposed: number
  /** Eligible people with no merit proposal. */
  missing: number
  /** proposed ÷ eligible; null under the anonymity minimum. */
  share: number | null
  /** Merit spend of the group's proposals and its gap to the budget; null when hidden. */
  spendPct: number | null
  delta: number | null
  /** Over budget from the flag gap ('comp.merit.overBudget'); null when the spend is hidden. */
  status: ProgressStatus | null
  /** The eligible people with no proposal: what the bullet opens. */
  missingPeople: CompPerson[]
  eligiblePeople: CompPerson[]
}

export interface ProposalProgress {
  calendar: CycleCalendar
  /** The scope. */
  total: ProgressRow
  /** By business unit, largest first, small units folded into Other. */
  rows: ProgressRow[]
}

/** What `proposalProgress` reads: the comp model fits as it is. */
export interface ProgressInput {
  pop: Pick<Population, 'people'>
  rules: Pick<CompRules, 'minGroup' | 'overBudget' | 'cycle'>
  cycle: { calendar: CycleCalendar }
}

function progressRow(
  group: string,
  eligible: readonly CompPerson[],
  rules: ProgressInput['rules'],
  patch: Partial<ProgressRow> = {},
): ProgressRow {
  const min = rules.minGroup
  const proposed = eligible.filter((p) => p.merit != null)
  const missing = eligible.filter((p) => p.merit == null)
  const spend = meritSpend(proposed, rules.cycle, min)
  const shown = spend.priced >= min
  const delta = shown ? spend.delta : null
  return {
    group,
    isOther: false,
    eligible: eligible.length,
    proposed: proposed.length,
    missing: missing.length,
    share: safeShare(proposed.length, eligible.length, min),
    spendPct: shown ? spend.spendPct : null,
    delta,
    status: delta == null ? null : delta >= rules.overBudget.flag - 1e-9 ? 'over' : 'within',
    missingPeople: missing,
    eligiblePeople: eligible.slice(),
    ...patch,
  }
}

/**
 * Merit cycle progress (Compensation's home, `home-comp-cycle`; the Merit cycle tab): merit
 * proposals entered as a share of eligible people, by business unit, with spend against budget as
 * each row's status. Counts are never hidden; shares and spend are, under the anonymity minimum.
 */
export function proposalProgress(m: ProgressInput): ProposalProgress {
  const cal = m.cycle.calendar
  const eligible = m.pop.people.filter((p) => isEligible(p, cal.cutoff))
  const groups = groupRows(eligible, (p) => p.businessUnit, { min: m.rules.minGroup })
  return {
    calendar: cal,
    total: progressRow('Total', eligible, m.rules),
    rows: groups.map((g) =>
      progressRow(g.label, g.rows, m.rules, g.folded ? { isOther: true } : { dim: 'businessUnit' }),
    ),
  }
}
