/**
 * Finance's rounding of cost amounts (docs/ROLES-V2.md 3.2, rule 8, and "Decisions made"). Where
 * cost totals show without the pay switch (pay view 'totals': Finance mode), the engines round
 * every cost amount to a whole $100,000 before any screen, export, report or tool reads it:
 * Workforce cost, the Finance home, the budget comparison, merit spend, open reqs at range
 * midpoint, the folder headline and the Action center's amounts. The switch modes (Developer, HR,
 * CHRO and Compensation with "Show pay amounts" on) keep exact amounts. Pure.
 *
 * An amount is rounded down to the $100,000 at or below it, so every rounded amount stands for a
 * $100,000 step of one grid (`costRange`):
 *
 *   0, shown "under $0.1M"   0 to under $100,000
 *   $0.1M                    $100,000 to under $200,000
 *   $12.3M                   $12,300,000 to under $12,400,000
 *
 * Why down and not to the nearest: a sum or difference of steps on one grid is again bounded by
 * points of that grid, so however many amounts are added and subtracted (two breakdowns of the
 * same scope, two business unit filters, two dates, merit spend against cost), and however many
 * such differences are laid over each other, what they say about one person's pay is never
 * narrower than $100,000. Rounding to the nearest $100,000 puts each step half a step off the
 * grid; a difference of three amounts then lands half a step off a difference of two, and laid
 * over each other they pin some people's pay to $50,000 (`costRounding.test.ts` shows both on the
 * sample).
 *
 * Why in each business unit: the grid argument holds for whole sums and differences only. A linear
 * program over many amounts can also take halves and thirds of them, and Finance's filter takes
 * any of the 63 sets of the sample's 6 business units. With each set's total rounded in one step,
 * the 63 totals at one date pinned each unit's total to $17,000 to $67,000, and two month ends
 * pinned every hire between them to under $100,000, some to under $50,000 (`costLp.test.ts`). So
 * a row over several units adds each unit's part, rounded on its own (`roundedAmounts` in the
 * cost engine, with `sumRounded`): a set of units then says nothing its units, each on its own,
 * do not.
 *
 * Percentages and ratios built from cost (share of target cash, spend against budget, cost against
 * budget, target cash per employee) are computed from the rounded amounts, so they say nothing the
 * rounded amounts do not. Shown with the 'moneyM' format: "$12.3M", "$0.4M", "under $0.1M".
 *
 *   const cash = rounded ? roundCost(exact) : exact
 *   fmt(cash, rounded ? 'moneyM' : 'money')
 */

/** The rounding step: $100,000. */
export const COST_STEP = 100_000

/** How a rounded amount under the step reads. */
export const UNDER_COST_STEP = 'under $0.1M'

/** Target cash per employee, from a rounded total, is kept to the nearest $1,000. */
export const PER_HEAD_STEP = 1_000

/**
 * An amount rounded down to a whole $100,000 (toward zero for a negative one); anything under
 * $100,000 is 0, which reads "under $0.1M".
 */
export function roundCost(v: number): number {
  if (!Number.isFinite(v)) return v
  const r = Math.floor(Math.abs(v) / COST_STEP) * COST_STEP
  return v < 0 && r ? -r : r
}

/**
 * The total of amounts each rounded down on its own (`roundCost`, one a business unit): their sum
 * plus one step for every two of them at $100,000 or more, since rounding down takes half a step
 * off each on average (six units' plain sum would read $0.3M low, enough to turn a budget status).
 * It reads the rounded amounts alone, so it says nothing they do not, and it stays on the grid.
 * The exact total is at or above it less the steps added, and under that plus a step an amount.
 *
 *   sumRounded([7_300_000, 4_500_000, 200_000])   // 12,100,000: 12.0M and a step for two of three
 */
export function sumRounded(rounded: readonly number[]): number {
  let total = 0
  let whole = 0
  for (const v of rounded) {
    total += v
    if (v >= COST_STEP) whole++
  }
  return total + addedSteps(whole)
}

/** What `sumRounded` adds over `whole` rounded amounts of $100,000 or more: a step for every two. */
export const addedSteps = (whole: number): number => Math.floor(whole / 2) * COST_STEP

/** `roundCost` that passes null through. */
export const roundCostOrNull = (v: number | null | undefined): number | null =>
  v == null ? null : roundCost(v)

/** `roundCost` when `round`, else the amount as it is. */
export const costIn = (v: number | null | undefined, round: boolean): number | null =>
  v == null ? null : round ? roundCost(v) : v

/**
 * A ratio of two amounts, from the rounded amounts when `round` (so it cannot undo the rounding);
 * null when the denominator is 0 or missing.
 */
export function ratioOf(num: number | null, den: number | null, round: boolean): number | null {
  if (num == null || den == null) return null
  const n = round ? roundCost(num) : num
  const d = round ? roundCost(den) : den
  return d === 0 ? null : n / d
}

/**
 * Target cash per employee from a rounded total: the total over the people, to the nearest $1,000.
 * Null under $100,000 (the total reads "under $0.1M") or with nobody behind it.
 */
export function perHeadOfRounded(rounded: number | null, people: number): number | null {
  if (rounded == null || !people || rounded === 0) return null
  return Math.round(rounded / people / PER_HEAD_STEP) * PER_HEAD_STEP
}

/** The exact amounts, from `lo` up to but not including `hi`, that a rounded total stands for. */
export function costRange(rounded: number): readonly [lo: number, hi: number] {
  return [rounded, rounded + COST_STEP]
}

/** True when an amount is on the rounding grid (a whole $100,000). */
export const isRoundedCost = (v: number): boolean => Number.isFinite(v) && v % COST_STEP === 0
