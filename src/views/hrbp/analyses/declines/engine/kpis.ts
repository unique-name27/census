/**
 * Offer declines' key figures (docs/ANALYSES.md, 3.5): decline rate, declined offers, the top
 * reason, declines with a competing offer, median days to decide for declined offers, and the renege
 * rate. Rates compare with the company under an org filter and with the prior window otherwise,
 * colored only past People stats' materiality floor. Each tile names its metric and opens its
 * records. Pure.
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Candidate } from '@/data/schema'
import { windowLine } from '@/drill/subtitle'
import { drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { isMaterialChange } from '@/lib/stats'
import { isMaterialGap, priorLabel } from '@/views/hrbp/engine/base'
import { settingsOf } from '@/views/hrbp/engine/settings'
import { definitionText } from '@/views/hrbp/engine/wording'
import { offersDrill } from './drills'
import { COMPETING_USES, DM, TIMING_USES } from './metrics'
import type { DeclinesModel } from './model'
import { type Offer, shownRate } from './offers'

const NO_FIELD = (label: string) => `Add ${label} to Candidates to see this.`

/**
 * "36 of 66 declines; recorded since 1 Oct 2025": the count, and which declines it is out of. When
 * the field starts part way through the period, the date it starts; otherwise "where recorded".
 */
export function recordedNote(n: number, known: readonly Offer[], declined: readonly Offer[]): string {
  const count = `${fmt(n, 'int')} of ${plural(known.length, 'decline')}`
  if (known.length === declined.length || !known.length) return count
  const since = known.reduce((a, o) => (o.decisionDate < a ? o.decisionDate : a), known[0].decisionDate)
  const before = declined.every((o) => o.competing != null || o.decisionDate < since)
  return before ? `${count}; recorded since ${formatDate(since)}` : `${count} where it was recorded`
}

export function declinesKpis(ctx: AnalyticsContext, m: DeclinesModel): Kpi[] {
  const s = m.settings
  const min = s.minGroup
  const material = settingsOf(ctx.metrics).material
  const w = m.window
  const c = m.count
  const def = (id: string) => definitionText(ctx.metrics, id)
  const scopeVsCompany = !ctx.isCompany
  const compareLabel = scopeVsCompany ? 'vs company' : priorLabel(ctx.filters.period, w.months)

  /* decline rate */
  const rate = shownRate(c, min)
  const ref = scopeVsCompany ? shownRate(m.companyCount, min) : shownRate(m.priorCount, min)
  const delta = rate != null && ref != null ? rate - ref : null
  const rateTile: Kpi = {
    id: 'decline-rate',
    metricId: DM.rate,
    label: 'Decline rate',
    value: rate,
    format: 'pct',
    delta,
    deltaLabel: compareLabel,
    goodDirection: 'down',
    deltaMaterial: isMaterialGap(delta, ref, material),
    spark: m.quarters.map((q) => q.rate),
    note: `${fmt(c.declined, 'int')} of ${plural(c.resolved, 'offer')}`,
    formula:
      rate == null
        ? undefined
        : `${fmt(c.declined, 'int')} declined ÷ ${plural(c.resolved, 'offer')} resolved (accepted or declined).`,
    suppressed: c.resolved > 0 && c.resolved < min,
    definition: def(DM.rate),
    drill: () =>
      offersDrill(ctx, m.offers, 'Offers resolved, declined first', { window: w, uses: m.uses.offers }),
    noteDrill: () =>
      offersDrill(ctx, m.offers, 'Offers resolved, declined first', { window: w, uses: m.uses.offers }),
    deltaDrill:
      delta == null
        ? undefined
        : scopeVsCompany
          ? () =>
              offersDrill(ctx, m.companyOffers, 'Company offers resolved, declined first', {
                window: w,
                uses: m.uses.offers,
                scope: 'Whole company',
              })
          : () =>
              offersDrill(ctx, m.priorOffers, 'Offers resolved in the prior period, declined first', {
                window: m.prior,
                uses: m.uses.offers,
              }),
    uses: m.uses.offers,
  }

  /* declined offers */
  const pc = m.priorCount
  const countDelta = c.resolved || pc.resolved ? c.declined - pc.declined : null
  const countTile: Kpi = {
    id: 'declined-offers',
    metricId: DM.count,
    label: 'Declined offers',
    value: c.resolved ? c.declined : null,
    format: 'int',
    delta: countDelta,
    deltaLabel: priorLabel(ctx.filters.period, w.months),
    goodDirection: 'down',
    deltaMaterial: isMaterialChange(c.declined, pc.declined, c.declined, pc.declined),
    note: `${plural(c.resolved, 'offer')} resolved`,
    definition: def(DM.count),
    drill: () =>
      offersDrill(ctx, m.offers, 'Declined offers', { window: w, uses: m.uses.offers, only: 'Declined' }),
    deltaDrill:
      countDelta == null
        ? undefined
        : () =>
            offersDrill(ctx, m.priorOffers, 'Declined offers, prior period', {
              window: m.prior,
              uses: m.uses.offers,
              only: 'Declined',
            }),
    uses: m.uses.offers,
  }

  /* top reason */
  const top = m.reasons.find((r) => r.kind === 'reason')
  const topShown = !!top && c.declined >= min
  const topTile: Kpi = {
    id: 'top-reason',
    metricId: DM.reasons,
    label: 'Top reason',
    value: topShown ? top.share : null,
    format: 'pct',
    note: !m.has.reasons ? NO_FIELD('Rejection reason') : top ? top.reason : 'No declined offers',
    suppressed: !!top && !topShown,
    definition: def(DM.reasons),
    formula: topShown
      ? `${fmt(top.declined, 'int')} of ${plural(c.declined, 'declined offer')} gave this reason.`
      : undefined,
    drill: topShown
      ? () =>
          offersDrill(ctx, top.offers, `Offers declined: ${top.reason.toLowerCase()}`, {
            window: w,
            uses: m.uses.reasons,
            note: `${plural(top.declined, 'declined offer')} of ${fmt(c.declined, 'int')} in the period.`,
          })
      : undefined,
    uses: m.uses.reasons,
  }

  /* with a competing offer */
  const known = m.declined.filter((o) => o.competing != null)
  const withComp = known.filter((o) => o.competing === true)
  const compShown = m.has.competing && known.length >= min
  const compUses = [...m.uses.offers, ...COMPETING_USES.slice(0, 1)]
  const compTile: Kpi = {
    id: 'with-competing-offer',
    metricId: DM.competing,
    label: 'With a competing offer',
    value: compShown ? withComp.length / known.length : null,
    format: 'pct',
    note: !m.has.competing ? NO_FIELD('Competing offer') : recordedNote(withComp.length, known, m.declined),
    suppressed: m.has.competing && known.length > 0 && known.length < min,
    definition: def(DM.competing),
    formula: compShown
      ? `${fmt(withComp.length, 'int')} of the ${plural(known.length, 'declined offer')} with Competing offer recorded had one.`
      : undefined,
    drill: compShown
      ? () =>
          offersDrill(ctx, withComp, 'Declined offers with a competing offer', {
            window: w,
            uses: compUses,
            note: `${plural(withComp.length, 'declined offer')} with a competing offer, of ${fmt(known.length, 'int')} with Competing offer recorded.`,
          })
      : undefined,
    uses: compUses,
  }

  /* median days to decide, declined */
  const dd = m.decide.declined
  const da = m.decide.accepted
  const timingUses = [...m.uses.offers, ...TIMING_USES]
  const decideTile: Kpi = {
    id: 'days-to-decide',
    metricId: DM.timing,
    label: 'Median days to decide, declined',
    value: dd.days,
    format: 'days',
    note: !m.has.offerDate
      ? NO_FIELD('Offer date')
      : `Accepted: ${da.days == null ? '—' : fmt(da.days, 'days')}`,
    suppressed: dd.n > 0 && dd.days == null,
    definition: def(DM.timing),
    formula:
      dd.days == null ? undefined : `Median over ${plural(dd.n, 'declined offer')} with an offer date.`,
    drill:
      dd.days == null
        ? undefined
        : () =>
            offersDrill(
              ctx,
              m.declined.filter((o) => o.daysToDecide != null),
              'Declined offers, days to decide',
              { window: w, uses: timingUses, note: `Median ${fmt(dd.days, 'days')} from offer to decline.` },
            ),
    noteDrill:
      da.days == null
        ? undefined
        : () =>
            offersDrill(
              ctx,
              m.offers.filter((o) => !o.declined && o.daysToDecide != null),
              'Accepted offers, days to decide',
              {
                window: w,
                uses: timingUses,
                note: `Median ${fmt(da.days, 'days')} from offer to acceptance.`,
              },
            ),
    uses: timingUses,
  }

  /* renege rate */
  const r = m.renege
  const renegeShown = r.accepted.length >= min
  const reqs = new Map(ctx.all.requisitions.map((q) => [q.reqId, q]))
  const renegeTile: Kpi = {
    id: 'renege-rate',
    metricId: DM.renege,
    label: 'Renege rate',
    value: renegeShown ? r.rate : null,
    format: 'pct',
    goodDirection: 'down',
    note: `${fmt(r.reneged.length, 'int')} of ${plural(r.accepted.length, 'accepted offer')}`,
    suppressed: r.accepted.length > 0 && !renegeShown,
    definition: def(DM.renege),
    formula: renegeShown
      ? `${fmt(r.reneged.length, 'int')} withdrawn after accepting ÷ ${plural(r.accepted.length, 'offer')} accepted.`
      : undefined,
    drill: renegeShown
      ? () =>
          drillSpec({
            kind: 'candidates',
            title: 'Offers accepted, reneges first',
            subtitle: windowLine(w, ctx.scopeLabel),
            note: 'Reneges show status Withdrawn: the offer was accepted, then withdrawn before the start.',
            rows: r.accepted
              .slice()
              .sort(
                (x: Candidate, y: Candidate) =>
                  Number(y.status === 'Withdrawn') - Number(x.status === 'Withdrawn') ||
                  (y.hiredDate ?? '').localeCompare(x.hiredDate ?? ''),
              ),
            hide: ['nextEventDate', 'stageEnteredDate'],
            extra: {
              columns: [
                { key: 'hiredDate', label: 'Offer accepted', format: 'date' },
                { key: 'location', label: 'Location' },
              ],
              values: (x: Candidate) => ({
                hiredDate: x.hiredDate ?? null,
                location: reqs.get(x.reqId)?.location ?? null,
              }),
            },
            uses: m.uses.renege,
          })
      : undefined,
    uses: m.uses.renege,
  }

  return [rateTile, countTile, topTile, compTile, decideTile, renegeTile]
}
