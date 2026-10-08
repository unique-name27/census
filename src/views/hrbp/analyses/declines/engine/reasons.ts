/**
 * Why offers were declined (docs/ANALYSES.md, 3.6.1 and 3.6.9): declined offers by reason on the
 * Offer decline reasons list, as a Pareto (largest first, "Other reasons (k)" after them whatever
 * its size, "Not recorded" last) with the running share, and by theme with the owner and the next
 * step for where each theme concentrates. A reason Census does not recognize keeps its own text and
 * sits under the Other theme; it folds into "Other reasons" with the list's own Other. Pure.
 */
import { OFFER_DECLINE_REASONS, type OfferDeclineTheme } from '@/data/schema'
import { type Dimension, decomposeRate } from '@/lib/decompose'
import { BAND_LEVELS, BAND_WORDS, type LevelBand, type Offer } from './offers'

/** Reasons a Pareto shows by name before folding the rest into "Other reasons (k)". */
export const PARETO_TOP = 7

/** The running share the Pareto marks, and the readout counts reasons up to. */
export const PARETO_LINE = 0.8

export type ReasonKind = 'reason' | 'other' | 'notRecorded'

export interface ReasonRow {
  reason: string
  kind: ReasonKind
  /** The theme, or "Several" for the folded row; null for Not recorded. */
  theme: string | null
  declined: number
  /** Of all declined offers in the window; null when they are fewer than the anonymity minimum. */
  share: number | null
  /** Running share, in the order shown; null like `share`. */
  cumulative: number | null
  offers: Offer[]
}

const OWN_OTHER = 'Other'

/**
 * Declined offers by reason, Pareto order. Under `minGroup` declined offers (the anonymity
 * minimum) the rows keep their counts but every share and the running share are null: one
 * declined offer would otherwise read as "100% of declines".
 */
export function reasonRows(declined: readonly Offer[], top = PARETO_TOP, minGroup = 0): ReasonRow[] {
  const total = declined.length
  if (!total) return []
  const shareOf = (n: number) => (total >= minGroup ? n / total : null)
  const by = new Map<string, Offer[]>()
  const blank: Offer[] = []
  const fold: Offer[] = []
  for (const o of declined) {
    const r = o.reason
    if (!r) blank.push(o)
    else if (!r.recognized || r.reason === OWN_OTHER) fold.push(o)
    else {
      const arr = by.get(r.reason)
      if (arr) arr.push(o)
      else by.set(r.reason, [o])
    }
  }
  const sorted = [...by].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const named = sorted.slice(0, top)
  for (const [, list] of sorted.slice(top)) fold.push(...list)
  const rows: Omit<ReasonRow, 'cumulative'>[] = named.map(([reason, offers]) => ({
    reason,
    kind: 'reason',
    theme: offers[0].reason?.theme ?? null,
    declined: offers.length,
    share: shareOf(offers.length),
    offers,
  }))
  if (fold.length) {
    const kinds = new Set(fold.map((o) => o.reason?.reason ?? ''))
    const themes = new Set(fold.map((o) => o.reason?.theme ?? 'Other'))
    rows.push({
      reason: `Other reasons (${kinds.size})`,
      kind: 'other',
      theme: themes.size === 1 ? [...themes][0] : 'Several',
      declined: fold.length,
      share: shareOf(fold.length),
      offers: fold,
    })
  }
  if (blank.length)
    rows.push({
      reason: 'Not recorded',
      kind: 'notRecorded',
      theme: null,
      declined: blank.length,
      share: shareOf(blank.length),
      offers: blank,
    })
  let run = 0
  return rows.map((r) => {
    run += r.declined
    return { ...r, cumulative: shareOf(run) }
  })
}

/** The named reasons that together reach the line (80%): the few that explain most declines. */
export function reasonsToLine(rows: readonly ReasonRow[], line = PARETO_LINE): ReasonRow[] {
  const out: ReasonRow[] = []
  for (const r of rows) {
    if (r.kind !== 'reason' || r.cumulative == null) break
    out.push(r)
    if (r.cumulative >= line - 1e-9) return out
  }
  return []
}

/** A reason in a sentence: "a competing offer", "pay below expectations". */
const REASON_WORDS: Readonly<Record<string, string>> = {
  'Accepted competing offer': 'a competing offer',
  'Counteroffer from current employer': 'a counteroffer',
  'Compensation below expectations': 'pay below expectations',
  'Equity, bonus or total rewards': 'equity, bonus or total rewards',
  'Role or level': 'the role or level',
  'Team or manager': 'the team or manager',
  'Location or relocation': 'location or relocation',
  'Start date or notice period': 'the start date or notice period',
  'Process took too long': 'a process that took too long',
  'Personal reasons': 'personal reasons',
}

/** A reason under a Pareto column, where room is short; the tooltip and table keep the full name. */
const SHORT_REASON: Readonly<Record<string, string>> = {
  'Accepted competing offer': 'Competing offer',
  'Counteroffer from current employer': 'Counteroffer',
  'Compensation below expectations': 'Pay below expectations',
  'Equity, bonus or total rewards': 'Equity or bonus',
  'Location or relocation': 'Location',
  'Start date or notice period': 'Start date',
  'Process took too long': 'Slow process',
  'Personal reasons': 'Personal',
}

export const shortReason = (reason: string): string => SHORT_REASON[reason] ?? reason

export const reasonWords = (reason: string): string =>
  REASON_WORDS[reason] ?? reason.charAt(0).toLowerCase() + reason.slice(1)

/* ───────── themes and next steps ───────── */

export const THEMES: readonly OfferDeclineTheme[] = [
  'Competition',
  'Pay',
  'Role',
  'Logistics',
  'Process',
  'Personal',
  'Other',
]

/** Where a theme's declines concentrate, in the reader's words, with its filter. */
export interface Concentration {
  dim: 'location' | 'level' | 'businessUnit'
  /** The group as it reads in a next step: "Bengaluru", "L5 and L6". */
  words: string
  /** The scope values it stands for. */
  values: readonly string[]
  /** Its decline rate for the theme against everything else. */
  rate: number
  rest: number
}

const DIMS: Dimension<Offer>[] = [
  { key: 'location', label: 'Location', get: (o) => o.location },
  { key: 'level', label: 'Level', get: (o) => o.band },
  { key: 'businessUnit', label: 'Business unit', get: (o) => o.businessUnit },
]

/**
 * The location, level band or business unit where offers were most often declined for a reason
 * that `affected` picks, against every other offer in scope (`decomposeRate`); null when nothing
 * stands out by at least `minDev`.
 */
export function concentration(
  offers: readonly Offer[],
  affected: (o: Offer) => boolean,
  minGroup: number,
  minDev = 0.02,
): Concentration | null {
  const top = decomposeRate(offers, DIMS, affected, { minDev, minPopulation: minGroup, top: 1 })[0]
  if (!top || top.small) return null
  const dim = top.dim as Concentration['dim']
  const band = dim === 'level'
  return {
    dim,
    words: band ? BAND_WORDS[top.value as LevelBand] : top.value,
    values: band ? BAND_LEVELS[top.value as LevelBand] : [top.value],
    rate: top.segValue,
    rest: top.compValue,
  }
}

/** The next step per theme; `g` is where the theme concentrates ("Bengaluru"), or null. */
const NEXT: Readonly<Partial<Record<OfferDeclineTheme, (g: string | null) => string>>> = {
  Pay: (g) =>
    `Review offer ranges${g ? ` for ${g} offers` : ''} with Total rewards before the next offers go out.`,
  Competition: (g) =>
    `Agree when recruiters can revise an offer to meet a competing one, and shorten the time from final interview to offer${g ? ` for ${g} offers` : ''}.`,
  Role: (g) => `Check the level and scope in ${g ? `${g} offers` : 'offers'} with the hiring managers.`,
  Logistics: (g) => `Review relocation support and start date flexibility${g ? ` for ${g} offers` : ''}.`,
  Process: (g) => `Resolve the slowest step before the offer${g ? ` for ${g} offers` : ''}.`,
}

/** The fixed next step of a theme, filled with where it concentrates; null for Personal and Other. */
export function nextStep(theme: OfferDeclineTheme, where: Concentration | null): string | null {
  const f = NEXT[theme]
  return f ? f(where?.words ?? null) : null
}

const OWNER_OF = new Map(OFFER_DECLINE_REASONS.map((r) => [r.reason, r.owner]))
const THEME_OWNER = new Map<OfferDeclineTheme, string | null>()
for (const r of OFFER_DECLINE_REASONS) if (!THEME_OWNER.has(r.theme)) THEME_OWNER.set(r.theme, r.owner)

export interface ThemeRow {
  theme: OfferDeclineTheme
  declined: number
  /** Of all declined offers in scope; null when they are fewer than the anonymity minimum. */
  share: number | null
  /** "Bengaluru", "L5 and L6", or null when it is spread out. */
  concentratesIn: string | null
  where: Concentration | null
  owner: string | null
  nextStep: string | null
  offers: Offer[]
}

/**
 * Declined offers by theme, largest first (Personal and Other last). Each theme's owner is the
 * owner of its most common reason, and its next step names where it concentrates among all the
 * offers resolved in scope.
 */
export function themeRows(resolved: readonly Offer[], minGroup: number): ThemeRow[] {
  // Shares are of every declined offer, as on the Pareto; declines with no reason have no theme.
  const total = resolved.filter((o) => o.declined).length
  const declined = resolved.filter((o) => o.declined && o.reason)
  if (!declined.length) return []
  const by = new Map<OfferDeclineTheme, Offer[]>()
  for (const o of declined) {
    const t = o.reason?.theme ?? 'Other'
    const arr = by.get(t)
    if (arr) arr.push(o)
    else by.set(t, [o])
  }
  const rank = (t: OfferDeclineTheme) => (t === 'Personal' || t === 'Other' ? 1 : 0)
  return [...by]
    .sort(
      (a, b) =>
        rank(a[0]) - rank(b[0]) || b[1].length - a[1].length || THEMES.indexOf(a[0]) - THEMES.indexOf(b[0]),
    )
    .map(([theme, offers]) => {
      const counts = new Map<string, number>()
      for (const o of offers)
        counts.set(o.reason?.reason ?? '', (counts.get(o.reason?.reason ?? '') ?? 0) + 1)
      const topReason = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      const where =
        rank(theme) === 0
          ? concentration(resolved, (o) => o.declined && o.reason?.theme === theme, minGroup)
          : null
      return {
        theme,
        declined: offers.length,
        share: total >= minGroup ? offers.length / total : null,
        concentratesIn: where?.words ?? null,
        where,
        owner: OWNER_OF.get(topReason) ?? THEME_OWNER.get(theme) ?? null,
        nextStep: nextStep(theme, where),
        offers,
      }
    })
}
