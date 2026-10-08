/**
 * Decline rate by group (docs/ANALYSES.md, 3.6.3): six cuts of the offers resolved in the window
 * (level band, location, business unit, source, recruiter, hiring manager), each group with its
 * rate, the rate its location and level mix would predict, the gap and a 90% Wilson interval.
 *
 * Folds (1.6 and 3.2): a group under the anonymity minimum of resolved offers folds into "Other
 * (k)"; a recruiter or hiring manager under `minPersonOffers` folds into "Other recruiters (k)" or
 * "Other hiring managers (k)". A lone small group keeps its name and shows only its offer count
 * (folding it would hide nothing), and so does an "Other" row of one person, which would name them
 * by elimination. A blank value is its own "Not recorded" row, last, never folded. The hidden rows
 * of a cut together hold none or at least the minimum of offers (complementary suppression), so
 * the totals shown never give one away. Pure.
 */

import { type MixBenchmark, type MixDrop, wilson } from './mix'
import { BAND_LEVELS, BAND_WORDS, declineCount, LEVEL_BANDS, type LevelBand, type Offer } from './offers'
import type { DeclinesSettings } from './settings'

export const CUT_KEYS = ['level', 'location', 'businessUnit', 'source', 'recruiter', 'hiringManager'] as const
export type CutKey = (typeof CUT_KEYS)[number]

export interface CutDef {
  key: CutKey
  /** The control's word and the table's "Grouped by". */
  label: string
  /** The filter a group sets (Filter to this), when it is a dimension of the scope. */
  dim: 'level' | 'location' | 'businessUnit' | null
  /** Recruiters and hiring managers: shown on their own only above `minPersonOffers`. */
  person: boolean
  /** The cell dimension the expected rate leaves out. */
  drop: MixDrop
  /** "Other recruiters (3)" */
  other: (k: number) => string
  value: (o: Offer) => string | null
}

export const CUTS: readonly CutDef[] = [
  {
    key: 'level',
    label: 'Level band',
    dim: 'level',
    person: false,
    drop: 'band',
    other: (k) => `Other (${k})`,
    value: (o) => o.band,
  },
  {
    key: 'location',
    label: 'Location',
    dim: 'location',
    person: false,
    drop: 'location',
    other: (k) => `Other (${k})`,
    value: (o) => o.location,
  },
  {
    key: 'businessUnit',
    label: 'Business unit',
    dim: 'businessUnit',
    person: false,
    drop: null,
    other: (k) => `Other (${k})`,
    value: (o) => o.businessUnit,
  },
  {
    key: 'source',
    label: 'Source',
    dim: null,
    person: false,
    drop: null,
    other: (k) => `Other (${k})`,
    value: (o) => o.source,
  },
  {
    key: 'recruiter',
    label: 'Recruiter',
    dim: null,
    person: true,
    drop: null,
    other: (k) => `Other recruiters (${k})`,
    value: (o) => o.recruiter,
  },
  {
    key: 'hiringManager',
    label: 'Hiring manager',
    dim: null,
    person: true,
    drop: null,
    other: (k) => `Other hiring managers (${k})`,
    value: (o) => o.hiringManager,
  },
]

export const cutDef = (key: CutKey): CutDef => CUTS.find((c) => c.key === key) as CutDef

export const NOT_RECORDED = 'Not recorded'

export type GroupKind = 'group' | 'other' | 'notRecorded'

export interface GroupRow {
  cut: CutKey
  /** "Level", "Location", …: the table's "Grouped by" column. */
  groupedBy: string
  /** The group's key: a band of levels is 'L5-L6'. */
  group: string
  /** The group in the reader's words, as the chart and table show it: "L5 and L6". */
  label: string
  kind: GroupKind
  /** The scope values the group stands for (a band's levels); empty for Other and Not recorded. */
  values: readonly string[]
  resolved: number
  /** Null with the rate, so a hidden rate can't be worked out from the counts. */
  declined: number | null
  rate: number | null
  expected: number | null
  /** rate − expected */
  gap: number | null
  low: number | null
  high: number | null
  /** At least `gapPts` above expected with enough offers to say so (the warning glyph). */
  flagged: boolean
  /** The offers behind the row; empty when its rate is hidden, so it never drills. */
  offers: Offer[]
}

/** Fewest offers for a group to be flagged: the person minimum, else the readout's. */
export const flagMin = (cut: CutDef, s: DeclinesSettings): number =>
  cut.person ? s.minPersonOffers : s.minResolved

function rowOf(
  cut: CutDef,
  group: string,
  kind: GroupKind,
  values: readonly string[],
  offers: Offer[],
  mix: MixBenchmark,
  s: DeclinesSettings,
  forceHide = false,
): GroupRow {
  const c = declineCount(offers)
  const show = !forceHide && c.resolved >= s.minGroup
  const rate = show ? c.rate : null
  const expected = show ? mix.expected(offers, cut.drop) : null
  const gap = rate != null && expected != null ? rate - expected : null
  const w = show ? wilson(c.declined, c.resolved) : null
  return {
    cut: cut.key,
    groupedBy: cut.label,
    group,
    label: cut.key === 'level' && kind === 'group' ? (BAND_WORDS[group as LevelBand] ?? group) : group,
    kind,
    values,
    resolved: c.resolved,
    declined: show ? c.declined : null,
    rate,
    expected,
    gap,
    low: w?.low ?? null,
    high: w?.high ?? null,
    flagged: kind === 'group' && gap != null && gap >= s.gapPts && c.resolved >= flagMin(cut, s),
    offers: show ? offers : [],
  }
}

/** One cut's rows in reading order: groups, then Other, then Not recorded. */
export function cutRows(
  cut: CutDef,
  offers: readonly Offer[],
  mix: MixBenchmark,
  s: DeclinesSettings,
): GroupRow[] {
  const groups = new Map<string, Offer[]>()
  const blank: Offer[] = []
  for (const o of offers) {
    const v = cut.value(o)
    if (!v) {
      blank.push(o)
      continue
    }
    const arr = groups.get(v)
    if (arr) arr.push(o)
    else groups.set(v, [o])
  }
  const min = cut.person ? s.minPersonOffers : s.minGroup
  const all = [...groups]
  const small = all.filter(([, list]) => list.length < min)
  const fold = small.length > 1
  const kept = fold ? all.filter(([, list]) => list.length >= min) : all
  const ordered =
    cut.key === 'level'
      ? LEVEL_BANDS.flatMap((b) => kept.filter(([g]) => g === b))
      : kept.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const specs: { group: string; kind: GroupKind; values: readonly string[]; list: Offer[]; hide: boolean }[] =
    ordered.map(([g, list]) => ({
      group: g,
      kind: 'group',
      values: cut.key === 'level' ? BAND_LEVELS[g as LevelBand] : [g],
      list,
      // A lone small group keeps its name and shows only its count.
      hide: list.length < min,
    }))
  if (fold)
    specs.push({
      group: cut.other(small.length),
      kind: 'other',
      values: [],
      list: small.flatMap(([, l]) => l),
      hide: false,
    })
  if (blank.length)
    specs.push({ group: NOT_RECORDED, kind: 'notRecorded', values: [], list: blank, hide: false })
  const rowFor = (x: (typeof specs)[number]) => rowOf(cut, x.group, x.kind, x.values, x.list, mix, s, x.hide)
  const rows = specs.map(rowFor)
  // Complementary suppression: the rows add up to the offers in the KPI strip, so the hidden rows'
  // declines could be worked out together. While they hold some offers but fewer than the minimum,
  // the smallest row still shown that no finding flags is hidden too (its name and offer count
  // stay), else the smallest row shown.
  const before = (a: GroupRow, b: GroupRow) =>
    a.flagged !== b.flagged ? !a.flagged : a.resolved < b.resolved
  for (;;) {
    const held = rows.reduce((n, r) => n + (r.declined == null ? r.resolved : 0), 0)
    if (held === 0 || held >= min) break
    let pick = -1
    for (let i = 0; i < rows.length; i++)
      if (rows[i].declined != null && (pick < 0 || before(rows[i], rows[pick]))) pick = i
    if (pick < 0) break
    specs[pick].hide = true
    rows[pick] = rowFor(specs[pick])
  }
  return rows
}

/** Every cut, long form (the table and the exports hold every grouping). */
export function allCuts(offers: readonly Offer[], mix: MixBenchmark, s: DeclinesSettings): GroupRow[] {
  return CUTS.flatMap((c) => cutRows(c, offers, mix, s))
}
