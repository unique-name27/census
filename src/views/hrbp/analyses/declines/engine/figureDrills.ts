/**
 * What each mark of Offer declines opens (docs/ANALYSES.md, 3.6): the same drill sources the
 * charts and their table cells use, so the tests can click what a reader clicks. A group of the
 * requisition's business unit, location or level carries its filter ("Filter to L5-L6"); a quarter
 * carries its period; reasons, sources, recruiters, hiring managers, buckets and themes carry none.
 * A mark whose number is hidden has no offers behind it and opens nothing. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { DrillSource } from '@/drill/Drill'
import { groupFilter, periodFilter } from '@/drill/filter'
import { fmt, plural } from '@/lib/format'
import type { AcceptanceRow, RangeRow } from './competing'
import { cutDef, type GroupRow } from './cuts'
import { offersDrill } from './drills'
import { COMPETING_USES, RANGE_USES } from './metrics'
import type { DeclinesModel } from './model'
import { BAND_LEVELS, BAND_WORDS, LEVEL_BANDS, type LevelBand } from './offers'
import type { ReasonRow, ThemeRow } from './reasons'
import type { BucketRow } from './timing'
import type { QuarterRow } from './trend'

type Ctx = Pick<AnalyticsContext, 'all' | 'scopeLabel'>

/** A reason's declined offers (a Pareto column). */
export const reasonDrill =
  (ctx: Ctx, m: DeclinesModel) =>
  (r: ReasonRow): DrillSource =>
    r.offers.length
      ? () =>
          offersDrill(
            ctx,
            r.offers,
            `Offers declined: ${r.reason.charAt(0).toLowerCase()}${r.reason.slice(1)}`,
            {
              window: m.window,
              uses: m.uses.reasons,
              note: `${plural(r.declined, 'declined offer')} of ${fmt(m.declined.length, 'int')} in the period.`,
            },
          )
      : null

/**
 * A quarter's resolved offers (a trend point), with the quarter as the period. The company line's
 * points under an org filter set none: "Filter to" would show the scope's quarter, not the company's.
 */
export const quarterDrill =
  (ctx: Ctx, m: DeclinesModel) =>
  (q: QuarterRow): DrillSource => {
    if (!q.offers.length) return null
    const company = m.companyQuarters.includes(q)
    return () =>
      offersDrill(ctx, q.offers, `Offers resolved, ${q.label}`, {
        window: { start: q.start, end: q.end },
        uses: m.uses.offers,
        filter: company ? undefined : periodFilter(q.start, q.end),
        scope: company ? 'Whole company' : undefined,
      })
  }

/** The filter of a group of the scope, and its name for a band of levels. */
export function groupScope(row: Pick<GroupRow, 'cut' | 'values' | 'group'>) {
  const dim = cutDef(row.cut).dim
  if (!dim || !row.values.length) return { filter: undefined, filterLabel: undefined }
  const filter = groupFilter(dim, row.values.length === 1 ? row.values[0] : row.values)
  const band = row.cut === 'level' && LEVEL_BANDS.includes(row.group as LevelBand) ? row.group : undefined
  // A band reads as words in "Focus on L5 and L6".
  return {
    filter,
    filterLabel:
      band && BAND_LEVELS[band as LevelBand].length > 1 ? BAND_WORDS[band as LevelBand] : undefined,
  }
}

/** A group's resolved offers (a bar of decline rate by group). */
export const groupDrill =
  (ctx: Ctx, m: DeclinesModel) =>
  (row: GroupRow): DrillSource => {
    if (!row.offers.length) return null
    const { filter, filterLabel } = groupScope(row)
    return () =>
      offersDrill(ctx, row.offers, `Offers resolved, ${row.label}`, {
        window: m.window,
        uses: m.uses.groups,
        filter,
        filterLabel,
        note: `${row.groupedBy}: ${row.group}. Decline rate ${fmt(row.rate, 'pct')} (${fmt(row.declined, 'int')} of ${plural(row.resolved, 'offer')}), expected ${fmt(row.expected, 'pct')} from ${row.cut === 'location' ? 'its level mix' : row.cut === 'level' ? 'its locations' : 'its location and level mix'}.`,
      })
  }

/** A days bucket's offers. */
export const bucketDrill =
  (ctx: Ctx, m: DeclinesModel) =>
  (row: BucketRow): DrillSource =>
    row.offers.length
      ? () =>
          offersDrill(
            ctx,
            row.offers,
            `Offers with ${row.bucket} ${row.kind === 'toOffer' ? 'from final interview to offer' : 'from offer to decision'}`,
            { window: m.window, uses: m.uses.timing },
          )
      : null

/** One competing-offer group's offers. */
export const competingDrill =
  (ctx: Ctx, m: DeclinesModel) =>
  (row: AcceptanceRow): DrillSource =>
    row.offers.length
      ? () =>
          offersDrill(ctx, row.offers, row.group, {
            window: m.window,
            uses: [...m.uses.offers, ...COMPETING_USES],
            note: `Acceptance = ${fmt(row.accepted, 'int')} accepted ÷ ${plural(row.resolved, 'offer')} resolved, ${fmt(row.acceptance, 'pct')}.`,
          })
      : null

/** One dot of where offers sat in the range: a location's (or the company's) offers of one outcome. */
export const rangeDrill =
  (ctx: Ctx, m: DeclinesModel) =>
  (row: RangeRow, side: 'declined' | 'accepted'): DrillSource => {
    const list = side === 'declined' ? row.declinedOffers : row.acceptedOffers
    if (!list.length) return null
    const median = side === 'declined' ? row.declined : row.accepted
    const company = row.kind === 'company'
    return () =>
      offersDrill(
        ctx,
        list,
        `${side === 'declined' ? 'Declined' : 'Accepted'} offers with a position in range, ${row.label}`,
        {
          window: m.window,
          uses: [...m.uses.offers, ...RANGE_USES],
          filter: company ? undefined : groupFilter('location', row.label),
          scope: company ? 'Whole company' : undefined,
          note: `Median position in range ${fmt(median, 'num2')} over ${plural(list.length, 'offer')}.`,
        },
      )
  }

/** A theme's declined offers (What to do next). */
export const themeDrill =
  (ctx: Ctx, m: DeclinesModel) =>
  (row: ThemeRow): DrillSource =>
    row.offers.length
      ? () =>
          offersDrill(ctx, row.offers, `Offers declined: ${row.theme.toLowerCase()} reasons`, {
            window: m.window,
            uses: m.uses.reasons,
            note: `${plural(row.declined, 'declined offer')} of ${fmt(m.declined.length, 'int')} in the period.`,
          })
      : null
