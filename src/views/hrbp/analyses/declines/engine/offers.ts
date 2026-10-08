/**
 * Offers resolved in a window, read the way Recruiting reads them (docs/ANALYSES.md, 3.2): the same
 * application preparation (`prepareApps`), the same resolved offers (`resolvedOffers`: accepted by
 * offer accepted date, declined by decline date) and the same acceptance (`acceptance`), so the
 * decline rate is one minus Recruiting's offer acceptance on the same offers. Each offer adds what
 * the analysis reads: the decline reason and its theme, the days from the final interview to the
 * offer and from the offer to the decision, the level band, and the optional competing offer,
 * revised offer and position in range. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { type DeclineReasonRead, readDeclineReason } from '@/data/lists'
import type { ListValue } from '@/data/lists/types'
import type { ISODate, Level } from '@/data/schema'
import { daysBetween } from '@/lib/dates'
import { prepareApps, reqIndex } from '@/views/recruiting/engine/prepare'
import { acceptance, resolvedOffers } from '@/views/recruiting/engine/sources'
import type { App } from '@/views/recruiting/engine/types'

/** The level bands of the expected rate's cells (3.2). */
export const LEVEL_BANDS = ['L1-L4', 'L5-L6', 'M1-E3'] as const
export type LevelBand = (typeof LEVEL_BANDS)[number]

const BAND_OF: Readonly<Record<Level, LevelBand>> = {
  L1: 'L1-L4',
  L2: 'L1-L4',
  L3: 'L1-L4',
  L4: 'L1-L4',
  L5: 'L5-L6',
  L6: 'L5-L6',
  M1: 'M1-E3',
  M2: 'M1-E3',
  E1: 'M1-E3',
  E2: 'M1-E3',
  E3: 'M1-E3',
}

/** The levels of each band, for "Filter to L5-L6". */
export const BAND_LEVELS: Readonly<Record<LevelBand, readonly Level[]>> = {
  'L1-L4': ['L1', 'L2', 'L3', 'L4'],
  'L5-L6': ['L5', 'L6'],
  'M1-E3': ['M1', 'M2', 'E1', 'E2', 'E3'],
}

/** "L5 and L6", "L1 to L4": a band in a sentence. */
export const BAND_WORDS: Readonly<Record<LevelBand, string>> = {
  'L1-L4': 'L1 to L4',
  'L5-L6': 'L5 and L6',
  'M1-E3': 'M1 to E3',
}

export const bandOf = (level: string | null | undefined): LevelBand | null =>
  level && level in BAND_OF ? BAND_OF[level as Level] : null

export type OfferOutcome = 'Accepted' | 'Declined'

/** One resolved offer and what the analysis reads from it. */
export interface Offer {
  app: App
  outcome: OfferOutcome
  declined: boolean
  /** The offer accepted date or the decline date: when it was resolved. */
  decisionDate: ISODate
  offerDate: ISODate | null
  /** Onsite date, else hiring manager date. */
  finalInterview: ISODate | null
  /** Offer date − final interview; null without both dates or when negative. */
  daysToOffer: number | null
  /** Decision date − offer date; null without an offer date or when negative. */
  daysToDecide: number | null
  /** A declined offer's reason on the Offer decline reasons list, and its theme; null when blank or accepted. */
  reason: DeclineReasonRead | null
  competing: boolean | null
  revised: boolean | null
  /** 0 at the range minimum, 1 at the maximum. */
  position: number | null
  location: string | null
  level: string | null
  band: LevelBand | null
  businessUnit: string | null
  /** Blank stays null (Recruiting's own "Unknown" is a reading, not a value). */
  source: string | null
  recruiter: string | null
  hiringManager: string | null
}

const day = (v: string | null | undefined): ISODate | null =>
  typeof v === 'string' && v ? v.slice(0, 10) : null

const span = (from: ISODate | null, to: ISODate | null): number | null => {
  if (!from || !to) return null
  const d = daysBetween(from, to)
  return d >= 0 ? d : null
}

const flag = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null)

const ratio = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function offerOf(a: App, reasons: readonly ListValue[]): Offer {
  const c = a.raw
  const declined = a.outcome === 'Declined'
  const offerDate = day(c.offerDate)
  const finalInterview = day(c.onsiteDate) ?? day(c.hmDate)
  const decisionDate = a.exitDate as ISODate
  return {
    app: a,
    outcome: declined ? 'Declined' : 'Accepted',
    declined,
    decisionDate,
    offerDate,
    finalInterview,
    daysToOffer: span(finalInterview, offerDate),
    daysToDecide: span(offerDate, decisionDate),
    reason: declined ? readDeclineReason(c.rejectionReason, reasons) : null,
    competing: flag(c.competingOffer),
    revised: flag(c.offerRevised),
    position: ratio(c.offerPositionInRange),
    location: a.location,
    level: a.level,
    band: bandOf(a.level),
    businessUnit: a.businessUnit,
    source: c.source?.trim() ? c.source.trim() : null,
    recruiter: a.recruiter,
    hiringManager: a.hiringManager,
  }
}

export interface Span {
  start: ISODate
  end: ISODate
}

/** The applications of one population, with their offers read once (kept per application). */
export interface OfferBook {
  apps: App[]
  /** Offers resolved in a window: Recruiting's `resolvedOffers`, each read as an `Offer`. */
  resolved: (w: Span) => Offer[]
}

function book(apps: App[], reasons: readonly ListValue[]): OfferBook {
  const read = new Map<App, Offer>()
  const of = (a: App) => {
    let o = read.get(a)
    if (!o) {
      o = offerOf(a, reasons)
      read.set(a, o)
    }
    return o
  }
  return { apps, resolved: (w) => resolvedOffers(apps, w).map(of) }
}

/** The scope's offers and the company's (benchmarks never change with a filter). */
export interface Offers {
  scope: OfferBook
  company: OfferBook
}

export function offerBooks(ctx: AnalyticsContext): Offers {
  const index = reqIndex(ctx.all.requisitions)
  const reasons = ctx.offerDeclineReasons
  const companyApps = prepareApps(ctx.all.candidates, index, ctx.asOf)
  const company = book(companyApps, reasons)
  const scope =
    ctx.data.candidates === ctx.all.candidates
      ? company
      : book(prepareApps(ctx.data.candidates, index, ctx.asOf), reasons)
  return { scope, company }
}

/** Accepted and declined among offers, with the decline rate (null with no offers). */
export interface DeclineCount {
  resolved: number
  declined: number
  accepted: number
  /** declined ÷ resolved = 1 − Recruiting's offer acceptance; null with no offers. */
  rate: number | null
}

export function declineCount(offers: readonly Offer[]): DeclineCount {
  const acc = acceptance(offers.map((o) => o.app))
  const resolved = acc.hired + acc.declined
  return {
    resolved,
    declined: acc.declined,
    accepted: acc.hired,
    rate: acc.rate == null ? null : 1 - acc.rate,
  }
}

/** The rate shown: null under the minimum of resolved offers. */
export const shownRate = (c: DeclineCount, min: number): number | null => (c.resolved >= min ? c.rate : null)

/** Declined first, then the latest decision first, then by name. */
export const byDeclinedFirst = (x: Offer, y: Offer): number =>
  Number(y.declined) - Number(x.declined) ||
  y.decisionDate.localeCompare(x.decisionDate) ||
  x.app.name.localeCompare(y.app.name)
