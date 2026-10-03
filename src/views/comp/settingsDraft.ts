/**
 * The cycle settings form works on text drafts (percent for budget and guideline, plain numbers
 * for the band). Pure helpers to fill a draft and parse it back with plain-English errors.
 */
import { type CycleSettings, DEFAULT_SETTINGS, LIMITS, RATINGS, type RatingKey } from './engine/settings'

export interface Draft {
  budget: string
  low: string
  high: string
  guideline: Record<RatingKey, string>
}

const pctText = (v: number) => String(Math.round(v * 10_000) / 100)

export function toDraft(s: CycleSettings): Draft {
  const guideline = {} as Record<RatingKey, string>
  for (const r of RATINGS) guideline[r] = pctText(s.guideline[r])
  return { budget: pctText(s.meritBudget), low: s.bandLow.toFixed(2), high: s.bandHigh.toFixed(2), guideline }
}

const num = (s: string): number => (s.trim() === '' ? Number.NaN : Number(s))

export type DraftResult = { settings: CycleSettings } | { error: string; field: string }

/** Parse a draft into settings, or name the first problem and the field it is in. */
export function parseDraft(d: Draft): DraftResult {
  const budget = num(d.budget) / 100
  if (!(budget >= LIMITS.meritBudget.min && budget <= LIMITS.meritBudget.max))
    return { error: 'Merit budget must be between 0% and 20%.', field: 'budget' }
  const low = num(d.low)
  const high = num(d.high)
  if (!(low >= LIMITS.band.min && low <= LIMITS.band.max))
    return { error: 'Band values must be between 0.50 and 1.50.', field: 'low' }
  if (!(high >= LIMITS.band.min && high <= LIMITS.band.max))
    return { error: 'Band values must be between 0.50 and 1.50.', field: 'high' }
  if (!(low < high)) return { error: 'The low end of the band must be below the high end.', field: 'low' }
  const guideline = { ...DEFAULT_SETTINGS.guideline }
  for (const r of RATINGS) {
    const v = num(d.guideline[r]) / 100
    if (!(v >= LIMITS.guideline.min && v <= LIMITS.guideline.max))
      return { error: `The guideline for rating ${r} must be between 0% and 30%.`, field: `g${r}` }
    guideline[r] = v
  }
  return { settings: { meritBudget: budget, bandLow: low, bandHigh: high, guideline } }
}
