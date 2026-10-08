/**
 * Offer declines' readout (docs/ANALYSES.md, 3.7): six rules, ranked by severity and then by the
 * declines they explain. The readout shows four; Ask and the exports read every one.
 *
 *  1. Declines rising: the latest quarter at least the rise to flag above the mean of the four
 *     before it, with enough resolved offers; `decomposeRate` names where.
 *  2. A few reasons explain most declines: the named reasons that reach 80%.
 *  3. A group well above its expected rate: the largest (rate − expected) × resolved across the
 *     cuts, with the gap at least the gap to flag. A recruiter or hiring manager is named only past
 *     the person minimum.
 *  4. Revising works: offers with a competing offer, revised against not.
 *  5. Low in the range: a location whose declined median sits the range gap below its accepted one.
 *  6. Slow decisions: decided after the decision window against within it.
 *
 * Wording follows the house rules: one sentence with the number, up to two of detail, one neutral
 * action, no nagging verbs. Pure.
 */
import type { Finding, Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { groupFilter, periodFilter } from '@/drill/filter'
import type { DrillFilter } from '@/drill/types'
import { fmt, plural } from '@/lib/format'
import { median } from '@/lib/stats'
import { acceptanceOf } from './competing'
import { CUTS, type CutKey, type GroupRow } from './cuts'
import { offersDrill } from './drills'
import { COMPETING_USES, DM, RANGE_USES, TIMING_USES } from './metrics'
import type { DeclinesModel } from './model'
import { BAND_LEVELS, BAND_WORDS, declineCount, LEVEL_BANDS, type LevelBand, type Offer } from './offers'
import { concentration, reasonWords } from './reasons'
import { decideSplit } from './timing'

const pct0 = (v: number | null | undefined) => fmt(v, 'pct0')
const ratio = (v: number | null | undefined) => fmt(v, 'num2')

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']

/** "Q2" within the same year, "Q4 2025" across years. */
const shortQuarter = (label: string, other: string): string =>
  label.slice(-4) === other.slice(-4) ? label.slice(0, 2) : label

/** "a week", "two weeks", "10 days". */
export function daysWords(days: number): string {
  if (days === 7) return 'a week'
  if (days === 14) return 'two weeks'
  return plural(days, 'day')
}

/** "and" list: "a, b and c". */
const andList = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

interface Ranked extends Finding {
  impact: number
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 }

/** The filter that reproduces a group of the scope, with its name for a band of levels. */
function groupScope(dim: 'location' | 'level' | 'businessUnit', values: readonly string[]) {
  const filter = groupFilter(dim, values.length === 1 ? values[0] : values)
  const band = dim === 'level' ? LEVEL_BANDS.find((b) => BAND_LEVELS[b].join() === values.join()) : undefined
  // "Focus on L5 and L6": the band in words, as the finding names it.
  return { filter, filterLabel: band ? BAND_WORDS[band] : undefined }
}

/* ───────── 1. declines rising ───────── */

function rising(ctx: AnalyticsContext, m: DeclinesModel): Ranked | null {
  const s = m.settings
  const qs = m.quarters
  const latest = qs.at(-1)
  if (!latest || latest.rate == null || latest.resolved < s.minResolved) return null
  const before = qs.slice(-5, -1).filter((q) => q.rate != null)
  if (before.length < 2) return null
  const mean = before.reduce((a, q) => a + (q.rate as number), 0) / before.length
  const rise = latest.rate - mean
  if (rise < s.risePts - 1e-9) return null
  const prev = qs.at(-2)
  const where = concentration(latest.offers, (o) => o.declined, s.minGroup)
  const whereText = where ? `, mostly in ${where.words}` : ''
  const from =
    prev?.rate != null ? ` from ${pct0(prev.rate)} in ${shortQuarter(prev.label, latest.label)}` : ''
  const scope = where ? groupScope(where.dim, where.values) : null
  return {
    id: 'hrbp-declines-rising',
    metricId: DM.rate,
    severity: 'warning',
    title: `Offer declines rose to ${pct0(latest.rate)} in ${latest.label}${from}${whereText}.`,
    detail: [
      `${fmt(latest.declined, 'int')} of ${plural(latest.resolved, 'offer')} resolved in ${latest.label} were declined, against a mean of ${pct0(mean)} over the ${NUMBER_WORDS[before.length]?.toLowerCase() ?? before.length} quarters before.`,
      where
        ? `In ${where.words}, ${pct0(where.rate)} were declined against ${pct0(where.rest)} elsewhere.`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
    action: where
      ? `Review ${where.words} offers with Total rewards before the next offers go out.`
      : `Review this quarter's declined offers with Total rewards before the next offers go out.`,
    ...(scope?.filter ? { filter: scope.filter } : {}),
    ...(scope?.filter && scope.filterLabel ? { filterLabel: scope.filterLabel } : {}),
    drill: () =>
      offersDrill(ctx, latest.offers, `Offers resolved, ${latest.label}`, {
        window: { start: latest.start, end: latest.end },
        uses: m.uses.offers,
        filter: periodFilter(latest.start, latest.end),
      }),
    uses: m.uses.offers,
    impact: rise * latest.resolved,
  }
}

/* ───────── 2. a few reasons ───────── */

function fewReasons(ctx: AnalyticsContext, m: DeclinesModel): Ranked | null {
  const s = m.settings
  const line = m.toLine
  const named = m.reasons.filter((r) => r.kind === 'reason').length
  if (!line.length || line.length > 3 || m.declined.length < s.minGroup || named <= line.length) return null
  const cum = line[line.length - 1].cumulative
  if (cum == null) return null
  const n = line.length
  const parts = line.map((r) => `${reasonWords(r.reason)} (${pct0(r.share)})`)
  const offers = line.flatMap((r) => r.offers)
  const notRecorded = m.reasons.find((r) => r.kind === 'notRecorded')
  return {
    id: 'hrbp-declines-reasons',
    metricId: DM.reasons,
    severity: 'info',
    title: `${NUMBER_WORDS[n]} reason${n === 1 ? ' explains' : 's explain'} ${pct0(cum)} of declined offers: ${andList(parts)}.`,
    detail: [
      `${plural(m.declined.length, 'offer')} declined in ${m.periodWords}.`,
      notRecorded ? `${plural(notRecorded.declined, 'declined offer')} had no reason recorded.` : null,
    ]
      .filter(Boolean)
      .join(' '),
    action: 'Take the next step for each theme with its owner, as listed under What to do next.',
    drill: () =>
      offersDrill(ctx, offers, `Offers declined for the top ${n === 1 ? 'reason' : `${n} reasons`}`, {
        window: m.window,
        uses: m.uses.reasons,
        note: `${plural(offers.length, 'declined offer')} of ${fmt(m.declined.length, 'int')} in the period.`,
      }),
    uses: m.uses.reasons,
    impact: cum * m.declined.length,
  }
}

/* ───────── 3. a group above its expected rate ───────── */

const GROUP_PHRASE: Record<CutKey, (g: string) => string> = {
  level: (g) => `Offers at ${BAND_WORDS[g as LevelBand] ?? g}`,
  location: (g) => `Offers in ${g}`,
  businessUnit: (g) => `Offers in ${g}`,
  source: (g) => `Offers to ${g} candidates`,
  recruiter: (g) => `Offers recruited by ${g}`,
  hiringManager: (g) => `Offers on ${g}'s reqs`,
}

const REST_PHRASE: Record<CutKey, string> = {
  level: 'at other levels',
  location: 'at other locations',
  businessUnit: 'in other business units',
  source: 'from other sources',
  recruiter: 'for other recruiters',
  hiringManager: "on other hiring managers' reqs",
}

const MIX_PHRASE: Record<CutKey, string> = {
  level: 'their locations would predict',
  location: 'their level mix would predict',
  businessUnit: 'their location and level mix would predict',
  source: 'their location and level mix would predict',
  recruiter: 'their location and level mix would predict',
  hiringManager: 'their location and level mix would predict',
}

/** Whether the group's gap holds inside and outside the location most of its offers sit in. */
function holds(m: DeclinesModel, row: GroupRow, drop: 'band' | 'location' | null): string | null {
  if (row.cut === 'location') return null
  const s = m.settings
  const byLoc = new Map<string, Offer[]>()
  for (const o of row.offers) if (o.location) byLoc.set(o.location, [...(byLoc.get(o.location) ?? []), o])
  const main = [...byLoc].sort((a, b) => b[1].length - a[1].length)[0]
  if (!main) return null
  const inside = main[1]
  const outside = row.offers.filter((o) => o.location !== main[0])
  const gapOf = (list: readonly Offer[]) => {
    const c = declineCount(list)
    const e = m.mix.expected(list, drop)
    return c.resolved >= s.minGroup && c.rate != null && e != null ? c.rate - e : null
  }
  const a = gapOf(inside)
  const b = gapOf(outside)
  if (a == null || b == null) return null
  if (a >= s.gapPts && b >= s.gapPts) return `The gap holds in ${main[0]} and elsewhere.`
  if (a >= s.gapPts) return `The gap is in ${main[0]}; elsewhere it is ${pct0(b)}.`
  if (b >= s.gapPts) return `The gap is outside ${main[0]}.`
  return null
}

/**
 * True when every offer in scope with a value sits in one group: the scope is that group (filtered
 * to Bengaluru, the location cut has Bengaluru alone), so a finding about it would describe the
 * scope itself and offer to focus on what is already the focus.
 */
export function soleGroup(offers: readonly Offer[], value: (o: Offer) => string | null | undefined): boolean {
  const seen = new Set<string>()
  for (const o of offers) {
    const v = value(o)
    if (v) seen.add(v)
    if (seen.size > 1) return false
  }
  return seen.size === 1
}

/**
 * The group rule 3 cites: the largest (rate − expected) × resolved among the flagged groups, in
 * cuts with more than one group in scope.
 */
export function aboveExpectedRow(m: Pick<DeclinesModel, 'groups' | 'offers'>): GroupRow | null {
  const excess = (g: GroupRow) => ((g.rate as number) - (g.expected as number)) * g.resolved
  const sole = new Set(CUTS.filter((c) => soleGroup(m.offers, c.value)).map((c) => c.key))
  const flagged = m.groups.filter(
    (g) => g.flagged && g.rate != null && g.expected != null && !sole.has(g.cut),
  )
  return flagged.sort((a, b) => excess(b) - excess(a))[0] ?? null
}

function aboveExpected(ctx: AnalyticsContext, m: DeclinesModel): Ranked | null {
  const row = aboveExpectedRow(m)
  if (!row) return null
  const cut = CUTS.find((c) => c.key === row.cut)!
  // The rest of the scope's offers that have a value for this cut.
  const mine = new Set(row.offers)
  const rest = m.offers.filter((o) => !!cut.value(o) && !mine.has(o))
  const rc = declineCount(rest)
  const restText =
    rc.resolved >= m.settings.minGroup ? `, against ${pct0(rc.rate)} ${REST_PHRASE[row.cut]}` : ''
  const person = cut.person
  const name = row.group
  const where = cut.dim ? groupScope(cut.dim, row.values) : null
  const groupWords = row.cut === 'level' ? (BAND_WORDS[row.group as LevelBand] ?? row.group) : row.group
  return {
    id: 'hrbp-declines-above-expected',
    metricId: DM.expected,
    severity: 'warning',
    title: `${GROUP_PHRASE[row.cut](row.group)} were declined ${pct0(row.rate)} of the time${restText}.`,
    detail: [
      `${fmt(row.declined, 'int')} of ${plural(row.resolved, 'offer')}; ${MIX_PHRASE[row.cut]} ${pct0(row.expected)}.`,
      holds(m, row, cut.drop),
    ]
      .filter(Boolean)
      .join(' '),
    action: person
      ? `Review the closing step on ${name}'s reqs together.`
      : `Review offer ranges and the closing plan for ${groupWords} offers with Total rewards.`,
    ...(where?.filter ? { filter: where.filter as DrillFilter } : {}),
    ...(where?.filter && where.filterLabel ? { filterLabel: where.filterLabel } : {}),
    drill: () =>
      offersDrill(ctx, row.offers, `Offers resolved, ${row.groupedBy.toLowerCase()} ${row.label}`, {
        window: m.window,
        uses: m.uses.groups,
        ...(where?.filter ? { filter: where.filter, filterLabel: where.filterLabel } : {}),
      }),
    uses: m.uses.groups,
    impact: ((row.rate as number) - (row.expected as number)) * row.resolved,
  }
}

/* ───────── 4. revising works ───────── */

function revising(ctx: AnalyticsContext, m: DeclinesModel): Ranked | null {
  if (!m.has.competing || !m.has.revised) return null
  const s = m.settings
  const comp = m.offers.filter((o) => o.competing === true)
  const all = acceptanceOf(comp, s.minGroup)
  const rev = acceptanceOf(comp, s.minGroup, (o) => o.revised === true)
  const not = acceptanceOf(comp, s.minGroup, (o) => o.revised !== true)
  if (all.acceptance == null || rev.acceptance == null || not.acceptance == null) return null
  if (rev.acceptance - not.acceptance < s.gapPts - 1e-9) return null
  const uses = [...m.uses.offers, ...COMPETING_USES]
  return {
    id: 'hrbp-declines-revising',
    metricId: DM.competing,
    severity: 'info',
    title: `Candidates with a competing offer accepted ${pct0(all.acceptance)} of offers; when we revised the offer, ${pct0(rev.acceptance)} accepted.`,
    detail: `${fmt(rev.accepted, 'int')} of ${plural(rev.resolved, 'revised offer')} were accepted, against ${fmt(not.accepted, 'int')} of ${plural(not.resolved, 'offer')} not revised.`,
    action: 'Agree in advance when recruiters can revise an offer that meets a competing one.',
    drill: () =>
      offersDrill(ctx, comp, 'Offers with a competing offer', {
        window: m.window,
        uses,
        note: `${fmt(all.accepted, 'int')} of ${plural(all.resolved, 'offer')} with a competing offer were accepted.`,
      }),
    uses,
    impact: (rev.acceptance - not.acceptance) * not.resolved,
  }
}

/* ───────── 5. low in the range ───────── */

function lowInRange(ctx: AnalyticsContext, m: DeclinesModel): Ranked | null {
  if (!m.has.position) return null
  const s = m.settings
  // The location where the gap covers the most declined offers.
  const rows = m.range.filter((r) => r.kind === 'location' && r.gap != null && r.gap >= s.rangeGap - 1e-9)
  const row = rows.sort((a, b) => (b.gap as number) * b.declinedN - (a.gap as number) * a.declinedN)[0]
  if (!row) return null
  // Where in that location's levels declined offers sat lowest.
  const declinedHere = row.declinedOffers
  const bands = LEVEL_BANDS.map((b) => {
    const xs = declinedHere.filter((o) => o.band === b).map((o) => o.position as number)
    return { band: b, n: xs.length, med: xs.length >= s.minGroup ? median(xs) : null }
  }).filter((b) => b.med != null)
  const lowest = bands.length >= 2 ? bands.sort((a, b) => (a.med as number) - (b.med as number))[0] : null
  const uses = [...m.uses.offers, ...RANGE_USES]
  // Filtered to that location already: no "Focus on" it.
  const where = soleGroup(m.offers, (o) => o.location)
    ? { filter: undefined }
    : groupScope('location', [row.label])
  return {
    id: 'hrbp-declines-low-in-range',
    metricId: DM.rangePosition,
    severity: 'warning',
    title: `Declined offers in ${row.label} sat at ${ratio(row.declined)} of the range, against ${ratio(row.accepted)} for accepted ones.`,
    detail: `Medians over ${plural(row.declinedN, 'declined offer')} and ${plural(row.acceptedN, 'accepted offer')} with a position in range.`,
    action: `Move ${row.label} offers toward the range midpoint${lowest ? `, starting with ${BAND_WORDS[lowest.band]}` : ''}.`,
    ...(where.filter ? { filter: where.filter } : {}),
    drill: () =>
      offersDrill(
        ctx,
        [...row.declinedOffers, ...row.acceptedOffers],
        `Offers with a position in range, ${row.label}`,
        {
          window: m.window,
          uses,
          filter: where.filter,
          note: `Declined median ${ratio(row.declined)}, accepted median ${ratio(row.accepted)}.`,
        },
      ),
    uses,
    impact: (row.gap as number) * row.declinedN,
  }
}

/* ───────── 6. slow decisions ───────── */

function slowDecisions(ctx: AnalyticsContext, m: DeclinesModel): Ranked | null {
  const s = m.settings
  const { quick, slow } = decideSplit(m.offers, s.slowDecisionDays)
  const q = declineCount(quick)
  const w = declineCount(slow)
  if (q.resolved < s.minGroup || w.resolved < s.minGroup || q.rate == null || w.rate == null) return null
  if (q.resolved + w.resolved < s.minResolved || w.rate - q.rate < s.gapPts - 1e-9) return null
  const days = daysWords(s.slowDecisionDays)
  const slowDeclined = slow.filter((o) => o.declined)
  const withComp = slowDeclined.filter((o) => o.competing === true).length
  const uses = [...m.uses.offers, ...TIMING_USES]
  return {
    id: 'hrbp-declines-slow-decisions',
    metricId: DM.timing,
    severity: 'warning',
    title: `Offers decided after more than ${days} were declined ${pct0(w.rate)} of the time, against ${pct0(q.rate)} within ${days}.`,
    detail: [
      `${fmt(w.declined, 'int')} of ${plural(w.resolved, 'slow decision')} were declines, against ${fmt(q.declined, 'int')} of ${fmt(q.resolved, 'int')} within ${days}.`,
      m.has.competing && withComp > 0
        ? withComp === slowDeclined.length
          ? `All ${plural(withComp, 'slow decline')} had a competing offer.`
          : `${fmt(withComp, 'int')} of the ${plural(slowDeclined.length, 'slow decline')} had a competing offer.`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
    action: 'Set a decision date when the offer goes out and keep in touch until then.',
    drill: () =>
      offersDrill(ctx, slow, `Offers decided after more than ${days}`, {
        window: m.window,
        uses,
      }),
    uses,
    impact: (w.rate - q.rate) * w.resolved,
  }
}

export function declinesFindings(ctx: AnalyticsContext, m: DeclinesModel): Finding[] {
  const out = [rising, fewReasons, aboveExpected, revising, lowInRange, slowDecisions]
    .map((rule) => rule(ctx, m))
    .filter((f): f is Ranked => f != null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.impact - a.impact)
  return out.map(({ impact: _impact, ...f }) => f)
}
