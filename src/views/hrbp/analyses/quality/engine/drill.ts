/**
 * The records behind every quality of hire number (docs/ANALYSES.md, 2.6): the hires, as
 * employee rows with what the score is built from (education, level at hire, site, the first full
 * review and whether they stayed a year). Never a score per person and never a sort by one: rows
 * sort by hire date. A hidden mean (fewer scored hires than the anonymity minimum) has no records
 * behind it, so its builders return null. Pure.
 */
import type { Column } from '@/charts/types'
import { type Candidate, LEVEL_LABELS, RATING_LABELS } from '@/data/schema'
import { subtitleOf } from '@/drill/subtitle'
import { type DrillFilter, type DrillSpec, drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { byHireDate, type Hire } from './cohort'

/** What a drill needs from the model. */
export interface DrillScope {
  scopeLabel: string
  isCompany: boolean
  window: { start: string; end: string }
  asOf: string
  isRegretted: (h: Hire) => boolean
}

/** Standard employee columns that say nothing here (worker type is always Employee). */
const HIDE = [
  'status',
  'terminationType',
  'terminationReason',
  'employmentType',
  'tenure',
  'directReports',
  'orgSize',
]

/** The drill's extra columns: the inputs of the score, never the score. */
export const HIRE_COLUMNS: Column[] = [
  { key: 'university', label: 'University', format: 'text' },
  { key: 'degreeLevel', label: 'Degree level', format: 'text' },
  { key: 'fieldOfStudy', label: 'Field of study', format: 'text' },
  { key: 'levelAtHire', label: 'Level at hire', format: 'text' },
  { key: 'location', label: 'Site', format: 'text' },
  { key: 'firstReview', label: 'First full review', format: 'text' },
  { key: 'stayedYear', label: 'Stayed a year', format: 'text' },
  { key: 'regrettable', label: 'Regretted', format: 'text' },
]

/** "2025 Annual: 4 Exceeds", "Left before a first review", "No first full review". */
export function firstReviewText(h: Hire): string {
  if (h.review && h.rating != null) {
    const t = `${h.review.cycle}: ${h.rating} ${RATING_LABELS[h.rating] ?? ''}`.trim()
    return h.earliestOnRecord ? `${t} (earliest review on record)` : t
  }
  return h.leftBeforeReview ? 'Left before a first review' : 'No first full review'
}

/** "Yes", "No", "No, regretted exit in the second year", "Left in a reduction in force"; null when unknown. */
export function stayedText(h: Hire): string | null {
  switch (h.outcome) {
    case 'stayed':
      return 'Yes'
    case 'left':
      return 'No'
    case 'secondYear':
      return 'No, regretted exit in the second year'
    case 'rif':
      return 'Left in a reduction in force'
    default:
      return null
  }
}

/** The extra column values of one hire. */
export function hireValues(h: Hire, d: DrillScope): Record<string, unknown> {
  const left = !!h.e.terminationDate && h.e.terminationDate <= d.asOf
  return {
    university: h.university,
    degreeLevel: h.degree,
    fieldOfStudy: h.field,
    levelAtHire: h.levelAtHire ? (LEVEL_LABELS[h.levelAtHire] ?? h.levelAtHire) : null,
    location: h.site,
    firstReview: firstReviewText(h),
    stayedYear: stayedText(h),
    regrettable: left ? (d.isRegretted(h) ? 'Yes' : 'No') : null,
  }
}

export type HireOrder = 'hireDate' | 'notScoredFirst' | 'notStayedFirst'

const rank: Record<Exclude<HireOrder, 'hireDate'>, (h: Hire) => number> = {
  notScoredFirst: (h) => (h.Q == null ? 0 : 1),
  notStayedFirst: (h) => (h.R === 0 ? 0 : 1),
}

/** Hires in hire-date order, or with one kind of row first and hire-date order within. */
export function ordered(hires: readonly Hire[], order: HireOrder = 'hireDate'): Hire[] {
  const list = [...hires].sort(byHireDate)
  if (order === 'hireDate') return list
  const r = rank[order]
  return list.sort((a, b) => r(a) - r(b) || byHireDate(a, b))
}

const hired = (d: DrillScope) => `Hired ${formatDate(d.window.start)} to ${formatDate(d.window.end)}`

export interface HiresSpecOptions {
  note?: string
  order?: HireOrder
  filter?: DrillFilter
  filterLabel?: string
}

/** The hires behind a number, with the score's inputs; null for an empty list. */
export function hiresSpec(
  d: DrillScope,
  title: string,
  hires: readonly Hire[],
  o: HiresSpecOptions = {},
): DrillSpec<'employees'> | null {
  if (!hires.length) return null
  const list = ordered(hires, o.order)
  const byRow = new Map(list.map((h) => [h.e, h]))
  return drillSpec({
    kind: 'employees',
    title: d.isCompany ? title : `${title}, ${d.scopeLabel}`,
    subtitle: subtitleOf(hired(d), d.scopeLabel),
    rows: list.map((h) => h.e),
    hide: HIDE,
    noun: ['hire', 'hires'],
    note:
      o.note ??
      'Each row shows what quality of hire is built from: the first full review and whether they stayed a year. Quality of hire describes groups, so no row has a score of its own.',
    extra: {
      columns: HIRE_COLUMNS,
      values: (e) => {
        const h = byRow.get(e)
        return h ? hireValues(h, d) : {}
      },
    },
    ...(o.filter ? { filter: o.filter } : {}),
    ...(o.filterLabel ? { filterLabel: o.filterLabel } : {}),
  })
}

/** The linked applications of hires, for the source figure's detail export. */
export const APPLICATION_COLUMNS: Column[] = [
  { key: 'applicationId', label: 'Application ID', format: 'text' },
  { key: 'employeeId', label: 'Employee ID', format: 'text' },
  { key: 'candidateName', label: 'Candidate', format: 'text' },
  { key: 'source', label: 'Source', format: 'text' },
  { key: 'reqId', label: 'Req ID', format: 'text' },
  { key: 'appliedDate', label: 'Applied', format: 'date' },
  { key: 'hiredDate', label: 'Offer accepted', format: 'date' },
  { key: 'hireDate', label: 'Hire date', format: 'date' },
]

export function applicationRows(hires: readonly Hire[]): Record<string, unknown>[] {
  return ordered(hires).flatMap((h) => {
    const c: Candidate | undefined = h.app?.raw
    return c
      ? [
          {
            applicationId: c.applicationId,
            employeeId: h.e.employeeId,
            candidateName: c.candidateName,
            source: h.app?.source ?? c.source,
            reqId: c.reqId,
            appliedDate: c.appliedDate,
            hiredDate: c.hiredDate ?? null,
            hireDate: h.e.hireDate,
          },
        ]
      : []
  })
}
