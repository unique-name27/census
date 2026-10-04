/**
 * The certified datasets (Employees, Reviews, Compensation) come from the systems of record, so
 * they load as rows rather than raw extracts. Two of them still have gaps that keep some fields
 * below gold: exit reasons from before the October 2025 picklist change were not migrated, and
 * the market survey matched only part of the jobs.
 */
import type { CompRecord, Employee } from '../../schema'
import { rngFor } from '../prng'
import { pickRows } from './extract'

/** Leavers with a termination reason after the migration gap. */
export const REASON_FILLED_SHARE = 0.72
/** Exits before this date may have lost their reason in the migration. */
export const PICKLIST_CHANGE = '2025-10-01'
/** Employees with a market median after the survey match. */
export const MARKET_FILLED_SHARE = 0.6

/** Row indexes of leavers whose termination reason was lost (exits before the picklist change). */
export function lostReasonRows(rows: readonly Employee[]): Set<number> {
  const leavers = rows.filter((e) => e.terminationDate).length
  const keep = Math.round(leavers * REASON_FILLED_SHARE)
  return pickRows(
    rows,
    leavers - keep,
    rngFor('raw-employees'),
    (e) => !!e.terminationDate && e.terminationDate < PICKLIST_CHANGE && !!e.terminationReason,
  )
}

/** Employees with the migration gap applied. */
export function employeesWithGaps(rows: readonly Employee[]): Employee[] {
  const lost = lostReasonRows(rows)
  return rows.map((e, i) => (lost.has(i) ? { ...e, terminationReason: null } : e))
}

/** Row indexes of comp records the market survey did not match. */
export function unmatchedMarketRows(rows: readonly CompRecord[]): Set<number> {
  return pickRows(rows, rows.length - Math.round(rows.length * MARKET_FILLED_SHARE), rngFor('raw-comp'))
}

/** Compensation with the survey gap applied. */
export function compWithGaps(rows: readonly CompRecord[]): CompRecord[] {
  const unmatched = unmatchedMarketRows(rows)
  return rows.map((c, i) => (unmatched.has(i) ? { ...c, marketP50: null } : c))
}
