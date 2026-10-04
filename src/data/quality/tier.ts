/**
 * Data tiers and the data standard.
 *
 * Every number carries a tier that says how far its data has come: no data, bronze (raw),
 * silver (mapped and validated) or gold (confirmed production). The data standard is the lowest
 * tier the dashboard shows. See docs/DATA-TIERS.md.
 */

export type Tier = 'none' | 'bronze' | 'silver' | 'gold'

/** Lowest first. */
export const TIERS: readonly Tier[] = ['none', 'bronze', 'silver', 'gold']

/** The lowest tier the dashboard shows. Bronze shows everything, including raw data. */
export type DataStandard = 'gold' | 'silver' | 'bronze'

/** Strictest first, the order the control lists them in. */
export const DATA_STANDARDS: readonly DataStandard[] = ['gold', 'silver', 'bronze']

export const DEFAULT_STANDARD: DataStandard = 'bronze'

/** 0 for none up to 3 for gold. */
export const tierRank = (t: Tier): number => TIERS.indexOf(t)

/** The lower of two tiers. */
export const minTier = (a: Tier, b: Tier): Tier => (tierRank(a) <= tierRank(b) ? a : b)

/** The lowest tier in the list; `empty` when the list is empty. */
export function lowestTier(tiers: Iterable<Tier>, empty: Tier = 'bronze'): Tier {
  let out: Tier | null = null
  for (const t of tiers) out = out == null ? t : minTier(out, t)
  return out ?? empty
}

/** -1, 0 or 1 when `a` is below, equal to or above `b`. */
export const compareTiers = (a: Tier, b: Tier): number => Math.sign(tierRank(a) - tierRank(b))

/** A number of this tier is shown under this standard. `none` never meets a standard. */
export const meetsStandard = (tier: Tier, standard: DataStandard): boolean =>
  tierRank(tier) >= tierRank(standard)

export const isTier = (v: unknown): v is Tier =>
  typeof v === 'string' && (TIERS as readonly string[]).includes(v)

export const isDataStandard = (v: unknown): v is DataStandard =>
  typeof v === 'string' && (DATA_STANDARDS as readonly string[]).includes(v)

/** One word, sentence case: "No data", "Bronze", "Silver", "Gold". */
export const TIER_LABEL: Record<Tier, string> = {
  none: 'No data',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
}

/** What the tier means, for legends and tooltips. */
export const TIER_MEANING: Record<Tier, string> = {
  none: 'The dataset, or a field the number needs, is missing.',
  bronze: 'Raw: loaded as it came in, mapping not reviewed.',
  silver: 'Mapped and validated: mapping confirmed and checks pass.',
  gold: 'Confirmed production: certified by its data owner for this version.',
}

/** Labels for the data standard control. */
export const STANDARD_LABEL: Record<DataStandard, string> = {
  gold: 'Production',
  silver: 'Validated',
  bronze: 'Everything',
}

/** Longer labels for menus and the Settings sheet. */
export const STANDARD_DESCRIPTION: Record<DataStandard, string> = {
  gold: 'Production (gold): only numbers confirmed for production',
  silver: 'Validated (silver and up)',
  bronze: 'Everything, including raw (bronze and up)',
}

/** Shown in place of a number that is below the standard. */
export const BELOW_STANDARD_TEXT: Record<DataStandard, string> = {
  gold: 'Not yet confirmed for production',
  silver: 'Not yet validated',
  bronze: 'No data',
}
