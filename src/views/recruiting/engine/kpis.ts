/**
 * Headline numbers for the Overview strip and the folder-tab headline.
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Requisition } from '@/data/schema'
import { MIN_GROUP } from '@/data/schema'
import { formatDate, monthKey } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { monthPoints } from '@/lib/people'
import { isMaterialChange, median, suppress } from '@/lib/stats'
import type { Headline } from '../../types'
import type { RecruitingBase } from './base'
import {
  acceptedOffersKpiDrill,
  activeKpiDrill,
  filledReqsDrill,
  hiresKpiDrill,
  lackingKpiDrill,
  offerAcceptanceKpiDrill,
  onHoldKpiDrill,
  openReqsKpiDrill,
  priorFilledKpiDrill,
  priorHiresKpiDrill,
  priorOffersKpiDrill,
  priorOpenReqsKpiDrill,
  priorTimeToHireKpiDrill,
  timeToHireKpiDrill,
  unmatchedDrill,
} from './drills'
import { tagKpis } from './drillUses'
import { KPI_USES } from './lineage'
import { inWin, isOpenAt } from './prepare'
import { medianTtf } from './reqs'
import { acceptance, acceptanceByQuarter, daysToHire, quarterWindows } from './sources'
import type { App } from './types'

/** Offer acceptance moves of 5 pts or more (with ≥ 10 offers each side) are worth color. */
export const ACCEPTANCE_MATERIAL_PTS = 0.05

export function openReqSpark(reqs: readonly Requisition[], asOf: string, n = 8): number[] {
  return monthPoints(asOf, n).map((d) => reqs.filter((r) => isOpenAt(r, d)).length)
}

export function headline(ctx: AnalyticsContext): Headline {
  const reqs = ctx.data.requisitions
  const uses = KPI_USES['open-reqs']
  if (!reqs.length) return { value: '—', label: 'open reqs', uses }
  const open = reqs.filter((r) => isOpenAt(r, ctx.asOf)).length
  return { value: fmt(open, 'int'), label: 'open reqs', spark: openReqSpark(reqs, ctx.asOf), uses }
}

/** A measure over 1 to 4 people is hidden (none at all just reads "—"). */
const small = (n: number): boolean => n > 0 && n < MIN_GROUP

function hiresByMonth(hires: readonly App[], end: string): number[] {
  const pts = monthPoints(end, 12).map((d) => monthKey(d))
  const m = new Map(pts.map((k) => [k, 0]))
  for (const a of hires) {
    const k = monthKey(a.exitDate ?? '')
    if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return pts.map((k) => m.get(k) ?? 0)
}

export function recruitingKpis(b: RecruitingBase): Kpi[] {
  const out: Kpi[] = []
  const noReqs = b.reqs.length === 0
  const noCands = b.apps.length === 0

  // Open reqs (snapshot).
  const openNow = b.req.open.length
  const openPrior = b.reqs.filter((r) => isOpenAt(r, b.prior.end)).length
  out.push({
    id: 'open-reqs',
    label: 'Open reqs',
    value: noReqs ? null : openNow,
    format: 'int',
    delta: noReqs ? null : openNow - openPrior,
    deltaLabel: `vs ${formatDate(b.prior.end)}`,
    goodDirection: null,
    spark: noReqs ? undefined : openReqSpark(b.reqs, b.asOf),
    note: noReqs
      ? 'Upload Requisitions to see this'
      : (b.joinNote ?? `${fmt(b.req.onHold.length, 'int')} on hold, not counted`),
    tab: 'requisitions',
    definition: `Requisitions open on ${formatDate(b.asOf)}: opened by then and not yet filled, closed or cancelled. Reqs on hold are counted separately.`,
    drill: noReqs ? undefined : () => openReqsKpiDrill(b),
    deltaDrill: noReqs || !openPrior ? undefined : () => priorOpenReqsKpiDrill(b),
    // The note counts reqs on hold, or (when candidates don't join to reqs) the applications that match.
    noteDrill: noReqs
      ? undefined
      : b.joinNote
        ? b.unmatched.length
          ? () => unmatchedDrill(b)
          : undefined
        : b.req.onHold.length
          ? () => onHoldKpiDrill(b)
          : undefined,
    uses: KPI_USES['open-reqs'],
  })

  // Offers accepted (window): the hire count as Recruiting sees it, on the accept date. People
  // stats counts hires by start date, so this tile is not called "Hires".
  out.push({
    id: 'hires',
    label: 'Offers accepted',
    value: noCands ? null : b.hires.length,
    format: 'int',
    delta: noCands ? null : b.hires.length - b.hiresPrior.length,
    deltaLabel: b.compareLabel,
    goodDirection: null,
    spark: noCands ? undefined : hiresByMonth(b.hires, b.window.end),
    note: noCands ? 'Upload Candidates to see this' : 'Counted on the accept date, not the start date',
    tab: 'sources',
    definition:
      'Candidates with status Hired whose offer was accepted (hired date) in the period. People stats counts hires by start date in the Employees data, so the two numbers can differ.',
    drill: noCands ? undefined : () => hiresKpiDrill(b),
    deltaDrill: noCands || !b.hiresPrior.length ? undefined : () => priorHiresKpiDrill(b),
    uses: KPI_USES.hires,
  })

  // Median time to fill.
  // Medians over fewer than 5 reqs, hires or offers are hidden (each is a person's outcome).
  const ttf = b.cov.hasFilledDate ? suppress(medianTtf(b.filled), b.filled.length) : null
  const ttfPrior = b.cov.hasFilledDate ? suppress(medianTtf(b.filledPrior), b.filledPrior.length) : null
  const ttfSpark = quarterWindows(b.window.end, 8).map((q) => {
    const list = b.reqs.filter((r) => r.status !== 'Cancelled' && inWin(r.filledDate, q))
    return suppress(medianTtf(list), list.length)
  })
  out.push({
    id: 'time-to-fill',
    label: 'Median time to fill',
    value: ttf,
    suppressed: small(b.cov.hasFilledDate ? b.filled.length : 0),
    format: 'days',
    delta: ttf != null && ttfPrior != null ? ttf - ttfPrior : null,
    deltaLabel: b.compareLabel,
    goodDirection: 'down',
    deltaMaterial:
      ttf != null &&
      ttfPrior != null &&
      isMaterialChange(ttf, ttfPrior, b.filled.length, b.filledPrior.length),
    spark: ttf == null ? undefined : ttfSpark,
    note: noReqs
      ? 'Upload Requisitions to see this'
      : !b.cov.hasFilledDate
        ? 'Filled date is missing from Requisitions'
        : `${fmt(b.filled.length, 'int')} reqs filled`,
    tab: 'requisitions',
    definition:
      'Median days from the date a req opened to the date its offer was accepted, for reqs filled in the period.',
    drill: ttf == null ? undefined : () => filledReqsDrill(b, b.filled, `Reqs filled, ${b.windowWords}`),
    deltaDrill: ttf == null || ttfPrior == null ? undefined : () => priorFilledKpiDrill(b),
    noteDrill:
      b.cov.hasFilledDate && b.filled.length
        ? () => filledReqsDrill(b, b.filled, `Reqs filled, ${b.windowWords}`)
        : undefined,
    uses: KPI_USES['time-to-fill'],
  })

  // Median time to hire.
  const tth = suppress(median(b.hires.map(daysToHire)), b.hires.length)
  const tthPrior = suppress(median(b.hiresPrior.map(daysToHire)), b.hiresPrior.length)
  out.push({
    id: 'time-to-hire',
    label: 'Median time to hire',
    value: tth,
    suppressed: small(b.hires.length),
    format: 'days',
    delta: tth != null && tthPrior != null ? tth - tthPrior : null,
    deltaLabel: b.compareLabel,
    goodDirection: 'down',
    deltaMaterial:
      tth != null && tthPrior != null && isMaterialChange(tth, tthPrior, b.hires.length, b.hiresPrior.length),
    note: noCands ? 'Upload Candidates to see this' : `${fmt(b.hires.length, 'int')} offers accepted`,
    tab: 'sources',
    definition: 'Median days from application to offer accepted, for offers accepted in the period.',
    drill: tth == null ? undefined : () => timeToHireKpiDrill(b),
    deltaDrill: tth == null || tthPrior == null ? undefined : () => priorTimeToHireKpiDrill(b),
    noteDrill: noCands || !b.hires.length ? undefined : () => hiresKpiDrill(b),
    uses: KPI_USES['time-to-hire'],
  })

  // Offer acceptance.
  const acc = acceptance(b.offers)
  const accPrior = acceptance(b.offersPrior)
  const nAcc = acc.hired + acc.declined
  const nPrior = accPrior.hired + accPrior.declined
  const accValue = b.cov.hasDeclined ? suppress(acc.rate, nAcc) : null
  const accPriorValue = suppress(accPrior.rate, nPrior)
  const accDelta = accValue != null && accPriorValue != null ? accValue - accPriorValue : null
  out.push({
    id: 'offer-acceptance',
    label: 'Offer acceptance',
    value: accValue,
    suppressed: b.cov.hasDeclined && small(nAcc),
    format: 'pct',
    delta: accDelta,
    deltaLabel: b.compareLabel,
    goodDirection: 'up',
    deltaMaterial:
      accDelta != null && nAcc >= 10 && nPrior >= 10 && Math.abs(accDelta) >= ACCEPTANCE_MATERIAL_PTS,
    spark: accValue == null ? undefined : acceptanceByQuarter(b.apps, b.window.end).map((q) => q.rate),
    note: noCands
      ? 'Upload Candidates to see this'
      : !b.cov.hasDeclined
        ? 'No declined offers in the data, so acceptance can’t be measured'
        : `${fmt(acc.hired, 'int')} of ${fmt(nAcc, 'int')} offers accepted`,
    tab: 'sources',
    definition:
      'Offers accepted ÷ offers accepted or declined, for offers resolved in the period (hired date or decline date).',
    drill: accValue == null ? undefined : () => offerAcceptanceKpiDrill(b),
    deltaDrill: accDelta == null ? undefined : () => priorOffersKpiDrill(b),
    // "264 of 329 offers accepted": the accepted ones (the panel note gives the 329).
    noteDrill:
      b.cov.hasDeclined && acc.hired > 0 && !small(nAcc) ? () => acceptedOffersKpiDrill(b) : undefined,
    uses: KPI_USES['offer-acceptance'],
  })

  // Candidates lacking a next step (snapshot).
  const lacking = b.actives.filter((x) => x.tier).length
  const active = b.actives.length
  const share = suppress(active ? lacking / active : null, active)
  out.push({
    id: 'lacking-next-step',
    label: 'Candidates lacking a next step',
    value: noCands ? null : lacking,
    format: 'int',
    goodDirection: 'down',
    note: noCands
      ? 'Upload Candidates to see this'
      : `${share != null ? `${fmt(share, 'pct0')} of ` : ''}${plural(active, 'active candidate')}${b.cov.hasNextEvent ? '' : ' (no next-event dates in the data)'}`,
    tab: 'pipeline',
    definition:
      'Active candidates who lack a next step on the as-of date: no step booked for more than 1.5× the usual days for the stage, interview feedback pending more than 2 days, or an offer out more than 5 days. "No step booked" on its own is a state, not this alarm.',
    drill: noCands ? undefined : () => lackingKpiDrill(b),
    // "38% of 457 active candidates": every active candidate, the share's denominator.
    noteDrill: noCands || !active ? undefined : () => activeKpiDrill(b),
    uses: KPI_USES['lacking-next-step'],
  })
  return tagKpis(out)
}
