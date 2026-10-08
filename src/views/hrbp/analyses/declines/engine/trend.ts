/**
 * Decline rate by quarter (docs/ANALYSES.md, 3.6.2): the 8 quarters ending with the as-of date's
 * quarter (Recruiting's `quarterWindows`; the quarter in progress ends at the as-of date). A quarter
 * under the anonymity minimum of resolved offers breaks the line. Under an org filter the company
 * line is drawn beside the scope's. Pure.
 */
import type { ISODate } from '@/data/schema'
import { quarterWindows } from '@/views/recruiting/engine/sources'
import { declineCount, type Offer, type OfferBook } from './offers'

export const TREND_QUARTERS = 8

export const COMPANY_SERIES = 'Company'

export interface QuarterRow {
  /** "2026 Q3" */
  quarter: string
  /** "Q3 2026" */
  label: string
  start: ISODate
  /** The quarter's last day, or the as-of date for the quarter in progress (the x position). */
  end: ISODate
  /** The scope's words, or "Company". */
  series: string
  resolved: number
  declined: number | null
  rate: number | null
  offers: Offer[]
}

export const quarterLabel = (key: string): string => key.replace(/^(\d{4}) (Q\d)$/, '$2 $1')

export function quarterRows(book: OfferBook, asOf: ISODate, series: string, min: number): QuarterRow[] {
  return quarterWindows(asOf, TREND_QUARTERS).map((q) => {
    const offers = book.resolved(q)
    const c = declineCount(offers)
    const show = c.resolved >= min
    return {
      quarter: q.key,
      label: quarterLabel(q.key),
      start: q.start,
      end: q.end,
      series,
      resolved: c.resolved,
      declined: show ? c.declined : null,
      rate: show ? c.rate : null,
      offers: show ? offers : [],
    }
  })
}
