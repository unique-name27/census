/**
 * The records behind every Compensation number, for the drill-down: which people a tile, a chart
 * mark, a table cell or a finding counts or measures, listed as their raw comp rows (kind 'comp')
 * with the metric that matters as an extra column. Pure (no React): the UI and the tile and
 * finding builders wrap these in thunks so rows are only gathered on click.
 *
 * Privacy: the comp kind already marks salary and range amounts `pay: true`, and every extra
 * column here is a ratio, a rating or a label, never an amount. A statistic hidden for anonymity
 * has no people behind it (the engines leave its `members` empty), so it never drills.
 */
import type { Column } from '@/charts/types'
import type { Employee } from '@/data/schema'
import type { DrillSource } from '@/drill/Drill'
import { groupFilter } from '@/drill/filter'
import { type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { Bin, ExceptionRow, PromotionRow, RewardsMixRow, SpendRow } from './cycle'
import { filtered, type GroupDim, rowFilter } from './groupFilter'
import type { MarketRow } from './market'
import type {
  BonusByRatingRow,
  Differentiation,
  EquityByRatingRow,
  MatrixCell,
  MeritByRatingRow,
} from './performance'
import type { CompPerson, Population, Position } from './population'
import type { CompaGroupRow, CompressionRow, OutsideRangeRow, PenetrationRow, PositionMixRow } from './ranges'
import { type CycleSettings, guidelineFor, ratingKey } from './settings'
import { people as peopleText } from './text'

/** What every drill needs from the model: the scope line, the date and the cycle settings. */
export interface DrillScope {
  scopeLabel: string
  asOf: string
  settings: CycleSettings
  pop: Pick<Population, 'latestCycle' | 'annualCycle'>
}

/** An extra column computed from the person behind a comp row. */
export interface PersonExtra {
  column: Column
  value: (p: CompPerson) => unknown
}

export type DrillCompSpec = DrillSpec<'comp'>

/* ───────── building blocks ───────── */

/** "As of 30 Sep 2026 · Whole company", in the order every other view's drills use. */
export function scopeLine(m: Pick<DrillScope, 'scopeLabel' | 'asOf'>): string {
  return `As of ${formatDate(m.asOf)} · ${m.scopeLabel}`
}

/** "As of 30 Sep 2026 · Whole company · merit proposals this cycle" */
export function cycleLine(m: Pick<DrillScope, 'scopeLabel' | 'asOf'>): string {
  return `${scopeLine(m)} · merit proposals this cycle`
}

/**
 * The comp rows of `people` as a drill spec, with extra columns read from each person. Null when
 * nobody is behind the number, so the caller shows plain text instead of a dead link.
 */
export function peopleDrill(args: {
  title: string
  subtitle: string
  people: readonly CompPerson[]
  extras?: readonly PersonExtra[]
  hide?: readonly string[]
  note?: string
  sort?: (a: CompPerson, b: CompPerson) => number
}): DrillCompSpec | null {
  if (!args.people.length) return null
  const list = args.sort ? args.people.slice().sort(args.sort) : args.people
  const extras = args.extras ?? []
  const byRecord = new Map(list.map((p) => [p.record, p]))
  return drillSpec({
    kind: 'comp',
    title: args.title,
    subtitle: args.subtitle,
    note: args.note,
    rows: list.map((p) => p.record),
    hide: args.hide?.slice(),
    extra: extras.length
      ? {
          columns: extras.map((e) => e.column),
          values: (r) => {
            const p = byRecord.get(r)
            return Object.fromEntries(extras.map((e) => [e.column.key, p ? e.value(p) : null]))
          },
        }
      : undefined,
  })
}

/**
 * A drill source for a mark or cell whose number is `n`: null when nothing is behind it (zero,
 * missing or hidden), otherwise a thunk so the rows are only gathered when someone clicks.
 */
export function lazyDrill(n: number | null | undefined, make: () => DrillSpec | null): DrillSource {
  return n ? make : null
}

/* ───────── extra columns ───────── */

const col = (key: string, label: string, format: Column['format']): Column => ({ key, label, format })

export const X_RATING: PersonExtra = {
  column: col('xRating', 'Latest rating', 'int'),
  value: (p) => ratingKey(p.rating),
}
export const X_ANNUAL_RATING: PersonExtra = {
  column: col('xAnnualRating', 'Annual rating', 'int'),
  value: (p) => ratingKey(p.annualRating),
}
export const X_POSITION: PersonExtra = {
  column: col('xPosition', 'Position in range', 'text'),
  value: (p) => p.position,
}
export const X_MARKET: PersonExtra = {
  column: col('xMarketRatio', 'Market ratio', 'ratio'),
  value: (p) => p.marketRatio,
}
export const X_MARKET_MID: PersonExtra = {
  column: col('xMarketVsMid', 'Market median ÷ midpoint', 'ratio'),
  value: (p) => p.marketVsMid,
}
export const X_TO_MIN: PersonExtra = {
  column: col('xToMinimum', 'Increase to minimum', 'pct'),
  value: (p) => (p.min != null && p.base > 0 && p.base < p.min ? (p.min - p.base) / p.base : null),
}
export const X_OVER_MAX: PersonExtra = {
  column: col('xOverMaximum', 'Over maximum', 'pct'),
  value: (p) => (p.max != null && p.base > p.max ? (p.base - p.max) / p.max : null),
}
export const X_TENURE: PersonExtra = {
  column: col('xTenure', 'Tenure', 'years'),
  value: (p) => p.tenure,
}
export const X_PROMOTED: PersonExtra = {
  column: col('xPromoted', 'Promoted in last 12 months', 'text'),
  value: (p) => (p.promotedRecently ? 'Yes' : 'No'),
}
export const X_HIRED: PersonExtra = {
  column: col('xHired', 'Group', 'text'),
  value: (p) => (p.hiredRecently ? 'Hired in the last 12 months' : 'Incumbent'),
}
export const X_PROMOTION: PersonExtra = {
  column: col('xPromotion', 'Promotion', 'pct'),
  value: (p) => p.promotion,
}
export const X_BONUS_TARGET: PersonExtra = {
  column: col('xTargetBonus', 'Target bonus', 'pct'),
  value: (p) => p.targetBonusPct,
}
export const X_BONUS_PAYOUT: PersonExtra = {
  column: col('xBonusPayout', 'Bonus payout of target', 'pct'),
  value: (p) => p.bonusPayout,
}
export const X_EQUITY_SHARE: PersonExtra = {
  column: col('xEquityShare', 'Equity ÷ base', 'pct'),
  value: (p) => (p.equityUsd != null && p.baseUsd != null && p.baseUsd > 0 ? p.equityUsd / p.baseUsd : null),
}
export const X_RATING_GROUP: PersonExtra = {
  column: col('xRatingGroup', 'Rating group', 'text'),
  value: (p) => {
    const k = ratingKey(p.rating)
    return k === 4 || k === 5 ? 'Rated 4-5' : k === 3 ? 'Rated 3' : null
  },
}

/** Guideline and the gap to it, from the cycle settings. */
export function guidelineExtras(s: CycleSettings): PersonExtra[] {
  return [
    { column: col('xGuideline', 'Guideline', 'pct2'), value: (p) => guidelineFor(s, p.rating) },
    {
      column: col('xVsGuideline', 'Merit vs guideline', 'pts'),
      value: (p) => {
        const g = guidelineFor(s, p.rating)
        return g == null || p.merit == null ? null : p.merit - g
      },
    },
  ]
}

/** Standard comp columns that say nothing for a kind of number. */
export const HIDE_POSITION = ['meritPct']
export const HIDE_MERIT = ['penetration']
export const HIDE_MARKET = ['meritPct', 'penetration']
export const HIDE_REWARDS = ['meritPct', 'penetration']

const byCompa = (a: CompPerson, b: CompPerson) =>
  (a.compa ?? 9) - (b.compa ?? 9) || a.name.localeCompare(b.name)
const byMeritDesc = (a: CompPerson, b: CompPerson) =>
  (b.merit ?? -1) - (a.merit ?? -1) || a.name.localeCompare(b.name)
const byMarket = (a: CompPerson, b: CompPerson) =>
  (a.marketRatio ?? 9) - (b.marketRatio ?? 9) || a.name.localeCompare(b.name)

/* ───────── selectors: the people behind each number (tested for consistency) ───────── */

export const withCompa = (people: readonly CompPerson[]) => people.filter((p) => p.compa != null)
export const inBandOf = (people: readonly CompPerson[], s: CycleSettings) =>
  people.filter((p) => p.compa != null && p.compa >= s.bandLow && p.compa <= s.bandHigh)
export const atPosition = (people: readonly CompPerson[], pos: Position) =>
  people.filter((p) => p.position === pos)
export const placedOf = (people: readonly CompPerson[]) => people.filter((p) => p.position != null)
/** Proposals with an FX rate: the ones merit spend is computed over. */
export const pricedOf = (people: readonly CompPerson[]) =>
  people.filter((p) => p.merit != null && p.baseUsd != null)
/** Priced proposals with a rating: the ones the guideline spend covers. */
export const ratedOf = (people: readonly CompPerson[], s: CycleSettings) =>
  pricedOf(people).filter((p) => guidelineFor(s, p.rating) != null)

export type CompaMeasure = 'measured' | 'inBand' | 'belowMin' | 'aboveMax'

export function compaGroupPeople(row: CompaGroupRow, what: CompaMeasure, s: CycleSettings): CompPerson[] {
  switch (what) {
    case 'measured':
      return withCompa(row.members)
    case 'inBand':
      return inBandOf(row.members, s)
    case 'belowMin':
      return atPosition(row.members, 'Below minimum')
    case 'aboveMax':
      return atPosition(row.members, 'Above maximum')
  }
}

/* ───────── pay position ───────── */

const band = (s: CycleSettings) => `${fmt(s.bandLow, 'ratio')} to ${fmt(s.bandHigh, 'ratio')}`

/** One group of a compa-ratio breakdown (by location, level, department, or the whole scope). */
export function compaGroupDrill(
  m: DrillScope,
  row: CompaGroupRow,
  what: CompaMeasure,
  /** Title without the group, for the whole scope (a headline tile). */
  scopeTitle = false,
): DrillCompSpec | null {
  return filtered(compaGroupSpec(m, row, what, scopeTitle), scopeTitle ? undefined : rowFilter(row))
}

function compaGroupSpec(
  m: DrillScope,
  row: CompaGroupRow,
  what: CompaMeasure,
  /** Title without the group, for the whole scope (a headline tile). */
  scopeTitle = false,
): DrillCompSpec | null {
  const s = m.settings
  const people = compaGroupPeople(row, what, s)
  const subtitle = scopeLine(m)
  const named = (t: string) => (scopeTitle ? t : `${t}, ${row.group}`)
  switch (what) {
    case 'measured':
      return peopleDrill({
        title: named('Compa-ratios'),
        subtitle,
        people,
        hide: HIDE_POSITION,
        sort: byCompa,
        note:
          row.median == null
            ? undefined
            : `Median ${fmt(row.median, 'ratio')} across these ${peopleText(people.length)}; middle half from ${fmt(row.p25, 'ratio')} to ${fmt(row.p75, 'ratio')}.`,
      })
    case 'inBand':
      return peopleDrill({
        title: named('In the healthy band'),
        subtitle,
        people,
        hide: HIDE_POSITION,
        sort: byCompa,
        note: `Share = ${fmt(people.length, 'int')} with a compa-ratio from ${band(s)} ÷ ${fmt(row.n, 'int')} with a compa-ratio (${fmt(row.inBand, 'pct')}).`,
      })
    case 'belowMin':
    case 'aboveMax': {
      const below = what === 'belowMin'
      const of = scopeTitle ? 'this scope' : row.group
      return outsideDrill(
        m,
        below ? 'below' : 'above',
        people,
        named(below ? 'Below range minimum' : 'Above range maximum'),
        `${fmt(people.length, 'int')} of the ${fmt(row.n, 'int')} people with a compa-ratio in ${of}.`,
      )
    }
  }
}

/** People below the minimum or above the maximum of their range, with the gap to it. */
export function outsideDrill(
  m: DrillScope,
  side: 'below' | 'above',
  people: readonly CompPerson[],
  title: string,
  note?: string,
): DrillCompSpec | null {
  const below = side === 'below'
  const gap = below ? X_TO_MIN : X_OVER_MAX
  return peopleDrill({
    title,
    subtitle: scopeLine(m),
    people,
    extras: below ? [gap, X_PROMOTED] : [gap, X_TENURE],
    hide: HIDE_POSITION,
    sort: (a, b) => Number(gap.value(b) ?? 0) - Number(gap.value(a) ?? 0) || a.name.localeCompare(b.name),
    note,
  })
}

/** The people of an outside-range table (below minimum or above maximum). */
export const outsidePeople = (rows: readonly OutsideRangeRow[]) => rows.map((r) => r.person)

const POSITION_WORDS: Record<Position, string> = {
  'Below minimum': 'Below range minimum',
  Q1: 'First quarter of the range',
  Q2: 'Second quarter of the range',
  Q3: 'Third quarter of the range',
  Q4: 'Fourth quarter of the range',
  'Above maximum': 'Above range maximum',
}

/** One bar (pos null) or segment of the range-position bars. */
export function positionPeople(row: PositionMixRow, pos: Position | null): CompPerson[] {
  return pos ? atPosition(row.members, pos) : row.members.slice()
}

export function positionDrill(
  m: DrillScope,
  row: PositionMixRow,
  pos: Position | null,
): DrillCompSpec | null {
  return filtered(positionSpec(m, row, pos), rowFilter(row))
}

function positionSpec(m: DrillScope, row: PositionMixRow, pos: Position | null): DrillCompSpec | null {
  const people = positionPeople(row, pos)
  const share = people.length / Math.max(1, row.n)
  return peopleDrill({
    title: pos ? `${POSITION_WORDS[pos]}, ${row.group}` : `People with a salary range, ${row.group}`,
    subtitle: scopeLine(m),
    people,
    extras: [X_POSITION],
    hide: HIDE_POSITION,
    sort: (a, b) => (a.penetration ?? 0) - (b.penetration ?? 0) || a.name.localeCompare(b.name),
    note: pos
      ? `Share = ${fmt(people.length, 'int')} ÷ ${fmt(row.n, 'int')} people with a salary range (${fmt(share, 'pct')}).`
      : undefined,
  })
}

/** A compa-ratio histogram bin. */
export function compaBinDrill(m: DrillScope, bin: Bin<CompPerson>, last: boolean): DrillCompSpec | null {
  return peopleDrill({
    title: `Compa-ratio ${fmt(bin.from, 'ratio')} to ${fmt(bin.to, 'ratio')}`,
    subtitle: scopeLine(m),
    people: bin.members,
    hide: HIDE_POSITION,
    sort: byCompa,
    note: `From ${fmt(bin.from, 'ratio')} up to ${last ? 'and including' : 'but not including'} ${fmt(bin.to, 'ratio')}; ${fmt(bin.share, 'pct')} of everyone with a compa-ratio.`,
  })
}

/* ───────── range position tab ───────── */

export function penetrationDrill(m: DrillScope, row: PenetrationRow): DrillCompSpec | null {
  return filtered(penetrationSpec(m, row), groupFilter('level', row.level))
}

function penetrationSpec(m: DrillScope, row: PenetrationRow): DrillCompSpec | null {
  return peopleDrill({
    title: `Range penetration, ${row.level}`,
    subtitle: scopeLine(m),
    people: row.members,
    extras: [X_POSITION],
    hide: HIDE_POSITION,
    sort: (a, b) => (a.penetration ?? 0) - (b.penetration ?? 0) || a.name.localeCompare(b.name),
    note:
      row.median == null
        ? undefined
        : `Median ${fmt(row.median, 'pct0')}; middle half from ${fmt(row.q1, 'pct0')} to ${fmt(row.q3, 'pct0')}.`,
  })
}

export type CompressionSide = 'hires' | 'incumbents'

export function compressionPeople(row: CompressionRow, side: CompressionSide | null): CompPerson[] {
  if (side === 'hires') return row.hires.slice()
  if (side === 'incumbents') return row.incumbents.slice()
  return [...row.hires, ...row.incumbents]
}

/** A department and level cell: both as the filter (one group of two filters, so no "Leave out"). */
export function compressionDrill(
  m: DrillScope,
  row: CompressionRow,
  side: CompressionSide | null,
): DrillCompSpec | null {
  const dept = groupFilter('department', row.department)
  const level = groupFilter('level', row.level)
  return filtered(compressionSpec(m, row, side), dept && level ? { ...dept, ...level } : undefined)
}

function compressionSpec(
  m: DrillScope,
  row: CompressionRow,
  side: CompressionSide | null,
): DrillCompSpec | null {
  const what =
    side === 'hires' ? 'New hires' : side === 'incumbents' ? 'Incumbents' : 'New hires and incumbents'
  return peopleDrill({
    title: `${what}, ${row.group}`,
    subtitle: scopeLine(m),
    people: compressionPeople(row, side),
    extras: [X_HIRED, X_TENURE],
    hide: HIDE_POSITION,
    sort: (a, b) => Number(b.hiredRecently) - Number(a.hiredRecently) || byCompa(a, b),
    note: `Median compa-ratio ${fmt(row.newMedian, 'ratio')} for ${peopleText(row.newN)} hired in the last 12 months vs ${fmt(row.incMedian, 'ratio')} for ${fmt(row.incN, 'int')} incumbents.`,
  })
}

/* ───────── pay for performance ───────── */

export function meritRatingDrill(m: DrillScope, row: MeritByRatingRow): DrillCompSpec | null {
  return peopleDrill({
    title: `Merit proposals, rated ${row.rating}`,
    subtitle: cycleLine(m),
    people: row.members,
    extras: [X_RATING, ...guidelineExtras(m.settings)],
    hide: HIDE_MERIT,
    sort: byMeritDesc,
    note:
      row.mean == null
        ? undefined
        : `Mean merit ${fmt(row.mean, 'pct2')} against a ${fmt(row.guideline, 'pct2')} guideline across these ${fmt(row.n, 'int')} proposals.`,
  })
}

export function matrixDrill(m: DrillScope, cell: MatrixCell): DrillCompSpec | null {
  const pos = cell.position as Position
  return peopleDrill({
    title: `Merit proposals, rated ${cell.rating}, ${(POSITION_WORDS[pos] ?? cell.position).toLowerCase()}`,
    subtitle: cycleLine(m),
    people: cell.members,
    extras: [X_RATING, X_POSITION, ...guidelineExtras(m.settings)],
    sort: byMeritDesc,
    note:
      cell.mean == null
        ? undefined
        : `Mean merit ${fmt(cell.mean, 'pct2')} against a ${fmt(cell.guideline, 'pct2')} guideline (${fmt(cell.diff, 'pts')}).`,
  })
}

export type RatingSide = '45' | '3'

export function differentiationPeople(d: Differentiation, side: RatingSide | null): CompPerson[] {
  if (side === '45') return d.rated45.slice()
  if (side === '3') return d.rated3.slice()
  // The ratio needs both sides; with either hidden there is nothing behind it.
  return d.ratio == null ? [] : [...d.rated45, ...d.rated3]
}

export function differentiationDrill(
  m: DrillScope,
  d: Differentiation & GroupDim,
  /** The department, or null for the whole scope. */
  group: string | null,
  side: RatingSide | null,
): DrillCompSpec | null {
  return filtered(differentiationSpec(m, d, group, side), rowFilter({ group, dim: d.dim }))
}

function differentiationSpec(
  m: DrillScope,
  d: Differentiation,
  /** The department, or null for the whole scope. */
  group: string | null,
  side: RatingSide | null,
): DrillCompSpec | null {
  const what = side === '45' ? 'Rated 4-5' : side === '3' ? 'Rated 3' : 'Rated 4-5 and rated 3'
  const note =
    side === '45'
      ? `Mean merit ${fmt(d.merit45, 'pct2')} across these ${fmt(d.n45, 'int')} proposals.`
      : side === '3'
        ? `Mean merit ${fmt(d.merit3, 'pct2')} across these ${fmt(d.n3, 'int')} proposals.`
        : `Ratio = mean merit ${fmt(d.merit45, 'pct2')} for ${fmt(d.n45, 'int')} rated 4-5 ÷ mean merit ${fmt(d.merit3, 'pct2')} for ${fmt(d.n3, 'int')} rated 3 (${fmt(d.ratio, 'times')}).`
  return peopleDrill({
    title: group ? `${what}, ${group}` : what,
    subtitle: cycleLine(m),
    people: differentiationPeople(d, side),
    extras: [X_RATING_GROUP, X_RATING, ...guidelineExtras(m.settings)],
    hide: HIDE_MERIT,
    sort: (a, b) => (ratingKey(b.rating) ?? 0) - (ratingKey(a.rating) ?? 0) || byMeritDesc(a, b),
    note,
  })
}

export function bonusDrill(m: DrillScope, row: BonusByRatingRow): DrillCompSpec | null {
  const cycle = m.pop.annualCycle ? ` (${m.pop.annualCycle})` : ''
  return peopleDrill({
    title: `Bonus payouts, rated ${row.rating}${cycle}`,
    subtitle: scopeLine(m),
    people: row.members,
    extras: [X_ANNUAL_RATING, X_BONUS_TARGET, X_BONUS_PAYOUT],
    hide: HIDE_REWARDS,
    sort: (a, b) => (b.bonusPayout ?? 0) - (a.bonusPayout ?? 0) || a.name.localeCompare(b.name),
    note:
      row.mean == null
        ? undefined
        : `Mean payout ${fmt(row.mean, 'pct')} of target, median ${fmt(row.median, 'pct')}, across these ${fmt(row.n, 'int')} people.`,
  })
}

export function equityDrill(m: DrillScope, row: EquityByRatingRow): DrillCompSpec | null {
  return peopleDrill({
    title: `Equity, rated ${row.rating}`,
    subtitle: scopeLine(m),
    people: row.members,
    extras: [X_RATING, X_EQUITY_SHARE],
    hide: HIDE_REWARDS,
    sort: (a, b) =>
      Number(X_EQUITY_SHARE.value(b) ?? 0) - Number(X_EQUITY_SHARE.value(a) ?? 0) ||
      a.name.localeCompare(b.name),
    note:
      row.median == null
        ? undefined
        : `Median annual equity ${fmt(row.median, 'pct')} of base across these ${fmt(row.n, 'int')} people.`,
  })
}

/* ───────── market ───────── */

/** "8.3% below market", "2.1% above market", "at market" */
export function marketGap(gap: number | null): string {
  if (gap == null) return 'no market gap'
  const text = fmt(Math.abs(gap), 'pct')
  if (text === fmt(0, 'pct')) return 'at market'
  return `${text} ${gap < 0 ? 'below' : 'above'} market`
}

export function marketDrill(m: DrillScope, row: MarketRow, scopeTitle = false): DrillCompSpec | null {
  return filtered(marketSpec(m, row, scopeTitle), scopeTitle ? undefined : rowFilter(row))
}

function marketSpec(m: DrillScope, row: MarketRow, scopeTitle: boolean): DrillCompSpec | null {
  return peopleDrill({
    title: scopeTitle ? 'Market ratios' : `Market ratios, ${row.group}`,
    subtitle: scopeLine(m),
    people: row.members,
    extras: [X_MARKET, X_MARKET_MID],
    hide: HIDE_MARKET,
    sort: byMarket,
    note:
      row.median == null
        ? undefined
        : `Median market ratio ${fmt(row.median, 'ratio')}, ${marketGap(row.gap)}, across these ${peopleText(row.n)}.`,
  })
}

/* ───────── merit cycle ───────── */

/**
 * Merit proposals of a group: every proposal ('eligible', the count), or the ones with an FX rate
 * the spend is computed over ('priced').
 */
export function spendPeople(members: readonly CompPerson[], what: 'eligible' | 'priced'): CompPerson[] {
  return what === 'eligible' ? members.slice() : pricedOf(members)
}

export function spendDrill(
  m: DrillScope,
  /** A business unit's row, or the scope's spend with `group` null. */
  row: Pick<SpendRow, 'members' | 'spendPct' | 'budgetPct' | 'dim'> & { group: string | null },
  what: 'eligible' | 'priced',
): DrillCompSpec | null {
  return filtered(spendSpec(m, row, what), rowFilter(row))
}

function spendSpec(
  m: DrillScope,
  /** A business unit's row, or the scope's spend with `group` null. */
  row: Pick<SpendRow, 'members' | 'spendPct' | 'budgetPct'> & { group: string | null },
  what: 'eligible' | 'priced',
): DrillCompSpec | null {
  const people = spendPeople(row.members, what)
  const skipped = row.members.length - pricedOf(row.members).length
  const fx =
    skipped > 0
      ? ` ${peopleText(skipped)} without an FX rate ${skipped === 1 ? 'is' : 'are'} not counted.`
      : ''
  return peopleDrill({
    title: row.group ? `Merit proposals, ${row.group}` : 'Merit proposals',
    subtitle: cycleLine(m),
    people,
    extras: [X_RATING, ...guidelineExtras(m.settings)],
    hide: HIDE_MERIT,
    sort: byMeritDesc,
    note:
      what === 'priced' && row.spendPct != null
        ? `Spend = Σ(base × merit) ÷ Σ base in USD over these ${fmt(people.length, 'int')} proposals: ${fmt(row.spendPct, 'pct2')} against a ${fmt(row.budgetPct, 'pct2')} budget.${fx}`
        : undefined,
  })
}

/** The rated, priced proposals the guideline spend is computed over. */
export function guidelineSpendDrill(
  m: DrillScope,
  members: readonly CompPerson[],
  guidelinePct: number | null,
): DrillCompSpec | null {
  const people = ratedOf(members, m.settings)
  return peopleDrill({
    title: 'Proposals priced at the guideline',
    subtitle: cycleLine(m),
    people,
    extras: [X_RATING, ...guidelineExtras(m.settings)],
    hide: HIDE_MERIT,
    sort: byMeritDesc,
    note:
      guidelinePct == null
        ? undefined
        : `Guideline spend = Σ(base × guideline for the rating) ÷ Σ base in USD over these ${fmt(people.length, 'int')} rated proposals: ${fmt(guidelinePct, 'pct2')}.`,
  })
}

/** A merit histogram bin. */
export function meritBinDrill(m: DrillScope, bin: Bin<CompPerson>, last: boolean): DrillCompSpec | null {
  return peopleDrill({
    title: `Merit ${fmt(bin.from, 'pct2')} to ${fmt(bin.to, 'pct2')}`,
    subtitle: cycleLine(m),
    people: bin.members,
    extras: [X_RATING, ...guidelineExtras(m.settings)],
    hide: HIDE_MERIT,
    sort: byMeritDesc,
    note: `From ${fmt(bin.from, 'pct2')} up to ${last ? 'and including' : 'but not including'} ${fmt(bin.to, 'pct2')}; ${fmt(bin.share, 'pct')} of all proposals.`,
  })
}

/** Guideline exceptions (or a subset), with why each is listed. */
export function exceptionsDrill(
  m: DrillScope,
  rows: readonly ExceptionRow[],
  title = 'Guideline exceptions',
  note?: string,
): DrillCompSpec | null {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return peopleDrill({
    title,
    subtitle: cycleLine(m),
    people: rows.map((r) => r.person),
    extras: [
      { column: col('xRule', 'Why it is listed', 'text'), value: (p) => byId.get(p.id)?.rule ?? null },
      X_RATING,
      ...guidelineExtras(m.settings),
      {
        column: col('xDistance', 'Distance from typical for the rating', 'num1'),
        value: (p) => byId.get(p.id)?.z ?? null,
      },
      X_PROMOTION,
    ],
    hide: HIDE_MERIT,
    note,
  })
}

/** Rule-breaking exceptions only (the tile's count); unusual proposals are counted apart. */
export const ruleExceptions = (rows: readonly ExceptionRow[]) => rows.filter((r) => r.kind !== 'outlier')

export function promotionsDrill(
  m: DrillScope,
  rows: readonly PromotionRow[],
  title = 'Promotions proposed',
): DrillCompSpec | null {
  return peopleDrill({
    title,
    subtitle: cycleLine(m),
    people: rows.map((r) => r.person),
    extras: [
      X_PROMOTION,
      X_RATING,
      {
        column: col('xTotalIncrease', 'Total increase', 'pct'),
        value: (p) => (p.promotion == null ? null : (p.merit ?? 0) + p.promotion),
      },
    ],
    hide: HIDE_MERIT,
    sort: (a, b) => (b.promotion ?? 0) - (a.promotion ?? 0) || a.name.localeCompare(b.name),
  })
}

const MIX_PART: Record<string, string> = { Base: 'base', 'Target bonus': 'target bonus', Equity: 'equity' }

/** One level of the total rewards mix, or one part of it. */
export function mixDrill(m: DrillScope, row: RewardsMixRow, part: string | null): DrillCompSpec | null {
  return filtered(mixSpec(m, row, part), groupFilter('level', row.level))
}

function mixSpec(m: DrillScope, row: RewardsMixRow, part: string | null): DrillCompSpec | null {
  const parts = [
    `base ${fmt(row.base, 'pct')}`,
    `target bonus ${fmt(row.bonus, 'pct')}`,
    ...(row.equity != null ? [`equity ${fmt(row.equity, 'pct')}`] : []),
  ]
  const what = part && MIX_PART[part] ? `Target pay, ${MIX_PART[part]} share` : 'Target pay mix'
  return peopleDrill({
    title: `${what}, ${row.level}`,
    subtitle: scopeLine(m),
    people: row.members,
    extras: [X_BONUS_TARGET, X_EQUITY_SHARE],
    hide: HIDE_REWARDS,
    note: `Shares of target pay across these ${peopleText(row.n)}: ${parts.join(', ')}.`,
  })
}

/* ───────── coverage ───────── */

/** Active employees in scope with no comp row: the people every "have no comp record" note counts. */
export function missingDrill(
  m: Pick<DrillScope, 'scopeLabel' | 'asOf'>,
  missing: readonly Employee[],
): DrillSpec<'employees'> | null {
  if (!missing.length) return null
  return drillSpec({
    kind: 'employees',
    title: 'Active employees with no comp record',
    subtitle: scopeLine(m),
    rows: missing
      .slice()
      .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name)),
    note: 'They are left out of every Compensation figure until the Compensation data includes them.',
  })
}
