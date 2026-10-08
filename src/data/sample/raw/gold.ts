/**
 * The certified datasets (Employees, Reviews, Compensation) come from the systems of record, so
 * they load as rows rather than raw extracts. Two of them still have gaps that keep some fields
 * below gold: exit reasons from before the October 2025 picklist change were not migrated, and
 * the market survey matched only part of the jobs. A few university names are typed another way
 * ("Coyote Valley Univ."), so the Universities list shows them as in the data, not on the list,
 * to map to the school's name.
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

/** Share of people with a university whose school is typed another way (under the 2% that would cost the field its tier). */
export const UNIVERSITY_VARIANT_SHARE = 0.018

/** "Coyote Valley University" → "Coyote Valley Univ.", "… Institute of Technology" → "… Inst. of Technology". */
export function universityVariant(name: string): string {
  if (name.includes('College of Engineering')) return name.replace('College of Engineering', 'Coll. of Engg.')
  if (name.includes('Institute of Technology'))
    return name.replace('Institute of Technology', 'Inst. of Technology')
  if (name.endsWith('University')) return name.replace(/University$/, 'Univ.')
  if (name.startsWith('University')) return name.replace(/^University/, 'Univ.')
  return `${name} (main campus)`
}

/** Row indexes of people whose university is typed another way. */
export function variantUniversityRows(rows: readonly Employee[]): Set<number> {
  const withSchool = rows.filter((e) => !!e.university).length
  return pickRows(
    rows,
    Math.round(withSchool * UNIVERSITY_VARIANT_SHARE),
    rngFor('raw-university'),
    (e) => !!e.university,
  )
}

/** Employees with the migration gap and the school spellings applied. */
export function employeesWithGaps(rows: readonly Employee[]): Employee[] {
  const lost = lostReasonRows(rows)
  const variant = variantUniversityRows(rows)
  return rows.map((e, i) => {
    if (!lost.has(i) && !variant.has(i)) return e
    const out = { ...e }
    if (lost.has(i)) out.terminationReason = null
    if (variant.has(i) && e.university) out.university = universityVariant(e.university)
    return out
  })
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
