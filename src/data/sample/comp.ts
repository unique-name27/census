/**
 * Compensation for active employees: local-currency salary ranges by level and site zone, base
 * pay positioned by compa-ratio (with the planted pay stories), bonus and equity, market medians
 * and the FY2027 focal-cycle proposals (merit budget 3.5% of base).
 */
import type { CompRecord, Level } from '../schema'
import { siteByLocation } from '../schema'
import { AS_OF, day, iso, T12_START } from './calendar'
import { CORP, GTM, OPS, SE, SS } from './departments'
import type { Person, World } from './model'
import type { Rng } from './prng'
import { ratingIn } from './talent'

/** US dollars per unit of local currency. */
const FX_TO_USD: Record<string, number> = {
  USD: 1,
  CAD: 0.73,
  EUR: 1.09,
  ILS: 0.27,
  INR: 0.012,
  TWD: 0.031,
  CNY: 0.14,
  VND: 0.000039,
}

/** Range midpoints in San Jose, USD. */
const MID_USD: Record<Level, number> = {
  L1: 105_000,
  L2: 130_000,
  L3: 165_000,
  L4: 195_000,
  L5: 235_000,
  L6: 280_000,
  M1: 225_000,
  M2: 285_000,
  E1: 350_000,
  E2: 420_000,
  E3: 520_000,
}

/** Pay zone of each site relative to San Jose, in USD terms. */
const ZONE: Record<string, number> = {
  'San Jose': 1,
  Seattle: 0.97,
  Boulder: 0.9,
  Austin: 0.9,
  Raleigh: 0.88,
  Toronto: 0.72,
  Vancouver: 0.72,
  Munich: 0.68,
  Haifa: 0.7,
  Bengaluru: 0.26,
  Hsinchu: 0.42,
  Shanghai: 0.38,
  'Ho Chi Minh City': 0.2,
}

/** Rounding unit for range points in each currency (base salary rounds to a tenth of it). */
const UNIT: Record<string, number> = {
  USD: 1000,
  CAD: 1000,
  EUR: 1000,
  ILS: 1000,
  INR: 10_000,
  TWD: 10_000,
  CNY: 1000,
  VND: 1_000_000,
}

const TARGET_BONUS: Record<Level, number> = {
  L1: 0.1,
  L2: 0.1,
  L3: 0.12,
  L4: 0.15,
  L5: 0.18,
  L6: 0.2,
  M1: 0.15,
  M2: 0.2,
  E1: 0.3,
  E2: 0.4,
  E3: 0.6,
}

const EQUITY_USD: Record<Level, number> = {
  L1: 8000,
  L2: 15_000,
  L3: 28_000,
  L4: 48_000,
  L5: 80_000,
  L6: 130_000,
  M1: 65_000,
  M2: 130_000,
  E1: 320_000,
  E2: 650_000,
  E3: 1_400_000,
}
const EQUITY_BU: Record<string, number> = { [SE]: 1, [SS]: 1, [OPS]: 0.6, [GTM]: 0.7, [CORP]: 0.5 }
const EQUITY_SITE: Record<string, number> = {
  Toronto: 0.7,
  Vancouver: 0.7,
  Munich: 0.65,
  Haifa: 0.65,
  Bengaluru: 0.35,
  Hsinchu: 0.45,
  Shanghai: 0.4,
  'Ho Chi Minh City': 0.25,
}

/** Merit guideline by rating for the focal cycle. */
const MERIT: Record<number, number> = { 1: 0, 2: 0.01, 3: 0.031, 4: 0.045, 5: 0.061 }

const round = (x: number, unit: number): number => Math.round(x / unit) * unit
const round3 = (x: number): number => Math.round(x * 1000) / 1000

/**
 * Deterministic spread of market medians around the range midpoint per market key and level. The key
 * is `Person.marketKey` (the old job family strings), so the spread does not move with the job taxonomy.
 */
function marketFactor(marketKey: string, level: string, dept: string): number {
  if (dept === 'Analog & Mixed-Signal') return 1.1
  let h = 0
  for (const ch of `${marketKey}|${level}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 0.97 + 0.06 * ((h % 1000) / 1000)
}

const latestRating = (p: Person): number | null =>
  ratingIn(p, '2026 Mid-year') ??
  ratingIn(p, '2025 Annual') ??
  ratingIn(p, '2025 Mid-year') ??
  ratingIn(p, '2024 Annual')

const promotedSince = (p: Person, d: number): number | null => {
  for (let i = p.events.length - 1; i >= 0; i--) {
    const e = p.events[i]
    if (e.type === 'Promotion' && e.day >= d) return e.day
  }
  return null
}

function compaFor(p: Person, rng: Rng): number {
  const rating = latestRating(p)
  const recentHire = p.hire >= T12_START
  if (p.tags.has('long-l4')) return rng.float(1.21, 1.31)
  if (p.dept === 'Design Verification' && (p.level === 'L3' || p.level === 'L4')) {
    // Pay compression: this year's hires came in above the people already doing the job.
    if (recentHire) return rng.normal(1.05, 0.03)
    return p.site === 'Bengaluru' ? rng.normal(0.93, 0.04) : rng.normal(0.975, 0.04)
  }
  if (promotedSince(p, AS_OF - 365) != null) return rng.normal(0.82, 0.04)
  if (p.site === 'Bengaluru') return rng.normal(0.88, 0.06)
  if (recentHire) return rng.normal(1.01, 0.05)
  const nudge = rating === 5 ? 0.04 : rating === 4 ? 0.02 : rating != null && rating <= 2 ? -0.03 : 0
  return rng.normal(1 + nudge, 0.07)
}

export function compRows(w: World, rng: Rng): CompRecord[] {
  const actives = w.people.filter((p) => p.term == null && p.type === 'Employee')
  const merit = new Map<number, number | null>()

  // Merit proposals: guideline by latest rating, kept inside guard rails so only the planted
  // outliers break the "rating 5 gets at least 2%" and "rating 1-2 gets at most 3%" rules.
  for (const p of actives) {
    const rA = ratingIn(p, '2025 Annual')
    const rM = ratingIn(p, '2026 Mid-year')
    const r = rM ?? rA
    if (r == null || p.hire > day('2026-04-01')) {
      merit.set(p.idx, null)
      continue
    }
    let m: number
    if (p.dept === 'Firmware') m = rng.float(0.027, 0.03)
    else {
      const g = MERIT[r]
      m = Math.min(g + 0.008, Math.max(g - 0.008, g + rng.normal(0, 0.004)))
      if (p.bu === GTM) m += 0.006
    }
    const lo = Math.min(rA ?? 9, rM ?? 9)
    const hi = Math.max(rA ?? 0, rM ?? 0)
    if (lo <= 2) m = Math.min(m, 0.03)
    if (hi === 5) m = Math.max(m, 0.02)
    merit.set(p.idx, round3(Math.max(0, m)))
  }
  const plantable = (p: Person) =>
    merit.get(p.idx) != null && p.dept !== 'Firmware' && p.bu !== GTM && p.tags.size === 0
  const both = (p: Person, ok: (r: number) => boolean) => {
    const a = ratingIn(p, '2025 Annual')
    const b = ratingIn(p, '2026 Mid-year')
    return a != null && b != null && ok(a) && ok(b)
  }
  for (const p of rng.sample(
    actives.filter((p) => plantable(p) && both(p, (r) => r === 5)),
    5,
  ))
    merit.set(p.idx, round3(rng.float(0.008, 0.018)))
  for (const p of rng.sample(
    actives.filter((p) => plantable(p) && both(p, (r) => r <= 2)),
    6,
  ))
    merit.set(p.idx, round3(rng.float(0.032, 0.045)))

  // About 8% of eligible employees are proposed for promotion, mostly strong performers.
  const promoPool = actives.filter(
    (p) =>
      merit.get(p.idx) != null &&
      ['L1', 'L2', 'L3', 'L4', 'L5', 'M1'].includes(p.level) &&
      promotedSince(p, AS_OF - 365) == null &&
      !p.tags.has('stagnant') &&
      !p.tags.has('long-l4') &&
      (latestRating(p) ?? 0) >= 3,
  )
  const eligibleCount = actives.filter((p) => merit.get(p.idx) != null).length
  const promoWeight = (p: Person) => ({ 5: 6, 4: 3, 3: 0.5 })[latestRating(p) as 3 | 4 | 5] ?? 0
  const promoted = new Set<number>()
  const left = promoPool.slice()
  for (let i = 0; i < Math.round(0.08 * eligibleCount) && left.length; i++) {
    const p = rng.weighted(left, left.map(promoWeight))
    promoted.add(p.idx)
    left.splice(left.indexOf(p), 1)
  }

  const rows: CompRecord[] = []
  for (const p of actives) {
    const currency = siteByLocation.get(p.site)!.currency
    const fx = FX_TO_USD[currency]
    const unit = UNIT[currency]
    const mid = round((MID_USD[p.level] * ZONE[p.site]) / fx, unit)
    const compa = Math.min(1.34, Math.max(0.72, compaFor(p, rng)))
    const rating = latestRating(p)
    const rA = ratingIn(p, '2025 Annual')

    const promo = promotedSince(p, day('2025-11-01'))
    let lastDate: number | null = null
    let lastPct: number | null = null
    if (promo != null) {
      lastDate = promo
      lastPct = rng.float(0.08, 0.14)
    } else if (p.hire <= day('2025-08-01')) {
      const r25 = ratingIn(p, '2025 Mid-year') ?? ratingIn(p, '2024 Annual') ?? 3
      const pct = Math.max(0, MERIT[r25] + rng.normal(0, 0.004))
      if (pct >= 0.005) {
        lastDate = day('2025-11-01')
        lastPct = pct
      } else if (p.hire <= day('2024-08-01')) {
        lastDate = day('2024-11-01')
        lastPct = rng.float(0.025, 0.04)
      }
    }

    const bonusTarget =
      p.dept === 'Sales' && p.level.startsWith('L')
        ? p.level === 'L2'
          ? 0.3
          : 0.4
        : p.dept === 'Sales' && p.level === 'M1'
          ? 0.35
          : p.title === 'Chief Executive Officer'
            ? 1
            : TARGET_BONUS[p.level]
    const payout =
      p.hire >= day('2025-10-01')
        ? null
        : rA === 5
          ? rng.float(1.1, 1.2)
          : rA === 4
            ? rng.float(1, 1.1)
            : rA === 3
              ? rng.float(0.92, 1.02)
              : rA != null
                ? rng.float(0.8, 0.86)
                : rng.float(0.9, 1)
    const perfEquity = rating === 5 ? 1.3 : rating === 4 ? 1.15 : rating != null && rating <= 2 ? 0.6 : 1
    const ceoEquity = p.title === 'Chief Executive Officer' ? 2.5 : 1
    const equity = round(
      EQUITY_USD[p.level] *
        (EQUITY_BU[p.bu] ?? 0.6) *
        (EQUITY_SITE[p.site] ?? 1) *
        perfEquity *
        ceoEquity *
        rng.lognormal(1, 0.25),
      500,
    )

    rows.push({
      employeeId: p.id,
      currency,
      baseSalary: round(compa * mid, unit / 10),
      rangeMin: round(mid * 0.8, unit),
      rangeMid: mid,
      rangeMax: round(mid * 1.2, unit),
      fxToUsd: fx,
      targetBonusPct: bonusTarget,
      bonusPayoutPct: payout == null ? null : round3(payout),
      annualEquityUsd: equity,
      marketP50: round(mid * marketFactor(p.marketKey, p.level, p.dept), unit),
      lastIncreaseDate: lastDate == null ? null : iso(lastDate),
      lastIncreasePct: lastPct == null ? null : round3(lastPct),
      meritPct: merit.get(p.idx) ?? null,
      promotionPct: promoted.has(p.idx) ? Math.round(rng.float(0.08, 0.15) * 200) / 200 : null,
    })
  }
  return rows.sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1))
}
