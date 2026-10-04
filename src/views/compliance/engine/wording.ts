/** Plain-English pieces shared by the KPIs, findings, actions and UI. Pure. */
import type { AnalyticsContext } from '@/data/context'
import { PERIOD_LABELS } from '@/data/scope'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'

/** "last 12 months", or the exact range for a custom window. */
export function periodWords(ctx: Pick<AnalyticsContext, 'filters' | 'window'>): string {
  const p = ctx.filters.period
  return p === 'custom' ? ctx.window.label : PERIOD_LABELS[p].toLowerCase()
}

/** "3 people" / "1 person" */
export const people = (n: number): string => plural(n, 'person', 'people')

/** "12 of 120" */
export const ofText = (k: number, n: number): string => `${fmt(k, 'int')} of ${fmt(n, 'int')}`

/** "90 days" */
export const daysText = (n: number): string => plural(n, 'day')

/** "3 business days" */
export const businessDaysText = (n: number): string => plural(n, 'business day')

/** "95.8%" */
export const pct = (v: number | null | undefined): string => fmt(v, 'pct')

/** "100%" for a target share, without a needless decimal. */
export const targetPct = (v: number): string => fmt(v, Math.round(v * 1000) % 10 === 0 ? 'pct0' : 'pct')

/** "12 Oct 2026" */
export const day = (d: string | null | undefined): string => formatDate(d)

/** Footnote: "26 people · as of 30 Sep 2026". */
export const asOfNote = (asOf: string, ...parts: (string | null | false | undefined)[]): string =>
  [...parts.filter(Boolean), `as of ${formatDate(asOf)}`].join(' · ')

/** "is" or "are" for a count. */
export const isAre = (n: number): string => (n === 1 ? 'is' : 'are')
