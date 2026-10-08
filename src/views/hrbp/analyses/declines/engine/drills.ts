/**
 * The records behind every Offer declines number (docs/ANALYSES.md, 3.6): resolved offers as
 * Recruiting's candidate drill (`appDrill`, so a hire who has started opens their employee card),
 * declined first, with the offer's own columns. A number that counts a group of a filterable
 * dimension carries the filter that reproduces it (the req's business unit, location or level, or
 * a quarter's period); reasons, sources, recruiters, hiring managers and buckets carry none. Pure;
 * the model hands these out as thunks, so rows are gathered only on click.
 */
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { windowLine } from '@/drill/subtitle'
import type { DrillFilter, DrillSpec } from '@/drill/types'
import { fmt, plural } from '@/lib/format'
import { appDrill } from '@/views/recruiting/engine/drills'
import type { App } from '@/views/recruiting/engine/types'
import { byDeclinedFirst, declineCount, type Offer, type Span } from './offers'

const yesNo = (v: boolean | null): string | null => (v == null ? null : v ? 'Yes' : 'No')

const byApp = (offers: readonly Offer[]) => new Map<App, Offer>(offers.map((o) => [o.app, o]))

/** The offer's own columns. "Reason" replaces the standard column with the reason as read onto the list. */
function offerExtra(offers: readonly Offer[]) {
  const of = byApp(offers)
  return {
    columns: [
      { key: 'location', label: 'Location' },
      { key: 'level', label: 'Level' },
      { key: 'offerDate', label: 'Offer date', format: 'date' as const },
      { key: 'decisionDate', label: 'Decision date', format: 'date' as const },
      { key: 'daysToOffer', label: 'Days to offer', format: 'days' as const },
      { key: 'daysToDecide', label: 'Days to decide', format: 'days' as const },
      { key: 'offerOutcome', label: 'Outcome' },
      { key: 'rejectionReason', label: 'Reason' },
      { key: 'theme', label: 'Theme' },
      { key: 'competingOffer', label: 'Competing offer' },
      { key: 'offerRevised', label: 'Offer revised' },
      { key: 'positionInRange', label: 'Position in range', format: 'ratio' as const },
    ],
    values: (a: App) => {
      const o = of.get(a)
      if (!o) return {}
      return {
        location: o.location,
        level: o.level,
        offerDate: o.offerDate,
        decisionDate: o.decisionDate,
        daysToOffer: o.daysToOffer,
        daysToDecide: o.daysToDecide,
        offerOutcome: o.outcome,
        rejectionReason: o.reason?.reason ?? null,
        theme: o.reason?.theme ?? null,
        competingOffer: yesNo(o.competing),
        offerRevised: yesNo(o.revised),
        positionInRange: o.position,
      }
    },
  }
}

/** Standard candidate columns that say nothing about a resolved offer (Outcome says what Status would). */
const HIDE = ['nextEventDate', 'stageEnteredDate', 'currentStage', 'status']

export interface OfferDrillOptions {
  /** The window the offers were resolved in (the subtitle). */
  window: Span
  /** The note; default: the decline rate's numerator and denominator. */
  note?: string
  /** The scope that reproduces the group (Filter to this). */
  filter?: DrillFilter
  /** "L5-L6" for a band's levels. */
  filterLabel?: string
  uses: readonly FieldRef[]
  /** List only the declined (or accepted) offers; the note still counts all of them. */
  only?: 'Declined' | 'Accepted'
  /** The scope words in the subtitle (default the context's). */
  scope?: string
}

/** "Decline rate = 46 declined ÷ 70 offers resolved (accepted or declined), 65.7%." */
export function rateNote(offers: readonly Offer[]): string {
  const c = declineCount(offers)
  return `Decline rate = ${fmt(c.declined, 'int')} declined ÷ ${plural(c.resolved, 'offer')} resolved (accepted or declined)${c.rate != null ? `, ${fmt(c.rate, 'pct')}` : ''}.`
}

/** Resolved offers as a drill, declined first; null for none. */
export function offersDrill(
  ctx: Pick<AnalyticsContext, 'all' | 'scopeLabel'>,
  offers: readonly Offer[],
  title: string,
  o: OfferDrillOptions,
): DrillSpec<'candidates'> | null {
  const list = (o.only ? offers.filter((x) => x.outcome === o.only) : offers).slice().sort(byDeclinedFirst)
  const spec = appDrill(
    { roster: ctx.all.employees },
    list.map((x) => x.app),
    {
      title,
      subtitle: windowLine(o.window, o.scope ?? ctx.scopeLabel),
      note: o.note ?? rateNote(offers),
      extras: [offerExtra(list)],
      hide: HIDE,
    },
  )
  if (!spec) return null
  return {
    ...spec,
    noun: ['offer', 'offers'],
    uses: o.uses,
    ...(o.filter ? { filter: o.filter } : {}),
    ...(o.filter && o.filterLabel ? { filterLabel: o.filterLabel } : {}),
  }
}
