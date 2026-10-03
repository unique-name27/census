/**
 * Merit cycle settings: the budget, the healthy compa-ratio band and the merit guideline by
 * rating. Engines take them as a parameter; the UI persists them per browser. Pure.
 */

export const RATINGS = [5, 4, 3, 2, 1] as const
export type RatingKey = (typeof RATINGS)[number]

export interface CycleSettings {
  /** Merit budget as a share of eligible base (0.035 = 3.5%). */
  meritBudget: number
  /** Healthy compa-ratio band, inclusive. */
  bandLow: number
  bandHigh: number
  /** Merit guideline by rating, as fractions. */
  guideline: Record<RatingKey, number>
}

export const DEFAULT_SETTINGS: CycleSettings = {
  meritBudget: 0.035,
  bandLow: 0.9,
  bandHigh: 1.1,
  guideline: { 5: 0.06, 4: 0.045, 3: 0.03, 2: 0.01, 1: 0 },
}

/** Accepted ranges, also used by the settings form for input limits. */
export const LIMITS = {
  meritBudget: { min: 0, max: 0.2 },
  band: { min: 0.5, max: 1.5 },
  guideline: { min: 0, max: 0.3 },
} as const

const finiteIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/**
 * Settings from untrusted input (localStorage, a form). Every field that is missing or out of
 * range falls back to its default; a band whose low end isn't below its high end falls back whole.
 */
export function sanitizeSettings(raw: unknown): CycleSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const g = (r.guideline && typeof r.guideline === 'object' ? r.guideline : {}) as Record<string, unknown>
  const lo = r.bandLow
  const hi = r.bandHigh
  const bandOk =
    finiteIn(lo, LIMITS.band.min, LIMITS.band.max) &&
    finiteIn(hi, LIMITS.band.min, LIMITS.band.max) &&
    lo < hi
  const guideline = { ...DEFAULT_SETTINGS.guideline }
  for (const k of RATINGS) {
    const v = g[k]
    if (finiteIn(v, LIMITS.guideline.min, LIMITS.guideline.max)) guideline[k] = v
  }
  return {
    meritBudget: finiteIn(r.meritBudget, LIMITS.meritBudget.min, LIMITS.meritBudget.max)
      ? r.meritBudget
      : DEFAULT_SETTINGS.meritBudget,
    bandLow: bandOk ? (lo as number) : DEFAULT_SETTINGS.bandLow,
    bandHigh: bandOk ? (hi as number) : DEFAULT_SETTINGS.bandHigh,
    guideline,
  }
}

export function sameSettings(a: CycleSettings, b: CycleSettings): boolean {
  return (
    a.meritBudget === b.meritBudget &&
    a.bandLow === b.bandLow &&
    a.bandHigh === b.bandHigh &&
    RATINGS.every((k) => a.guideline[k] === b.guideline[k])
  )
}

/** Ratings are whole numbers 1-5; anything else (missing, 3.5 from an odd import) has no rating key. */
export function ratingKey(rating: number | null | undefined): RatingKey | null {
  if (rating == null || !Number.isFinite(rating)) return null
  const r = Math.round(rating)
  return r >= 1 && r <= 5 && Math.abs(r - rating) < 1e-9 ? (r as RatingKey) : null
}

export function guidelineFor(s: CycleSettings, rating: number | null | undefined): number | null {
  const k = ratingKey(rating)
  return k == null ? null : s.guideline[k]
}
