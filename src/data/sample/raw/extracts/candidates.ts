/**
 * Candidates as a raw ATS export: names split into first and last, the ATS's own stage and
 * status names, US dates, the start date of accepted offers, and source names that are mostly
 * mappable. Reneged offers read "Withdrew" with the renege as the reason. 4% of applications carry a
 * source spelling Census does not recognize ("LinkedIn Recruiter", "Indeed").
 */
import type { Candidate, CandidateStatus, Datasets, Stage } from '../../../schema'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, mmddyyyy, splitName, toAoa } from '../format'
import { FILES } from '../plan'

const STAGE: Record<Stage, string> = {
  Applied: 'Application Review',
  Screen: 'Recruiter Phone Screen',
  'Hiring manager': 'Hiring Manager Screen',
  Onsite: 'Onsite Interview',
  Offer: 'Offer',
  Hired: 'Hired',
}

const STATUS: Record<CandidateStatus, string> = {
  Active: 'Active',
  Rejected: 'Rejected',
  Withdrawn: 'Withdrew',
  Declined: 'Rejected - Offer declined',
  Hired: 'Hired',
}

/** How the ATS spells each source; the importer recognizes these. */
const SOURCE: Record<string, string> = {
  Referral: 'Employee Referral',
  Sourced: 'Prospecting',
  'Careers site': 'Company Website',
  'Job board': 'Job Boards',
  Agency: 'Recruiting Agency',
  University: 'Campus',
  Internal: 'Internal Applicant',
}

/** Spellings the importer does not recognize, by the source they stand for. */
export const UNRECOGNIZED_SOURCE: Record<string, readonly string[]> = {
  Referral: ['Referred by employee'],
  Sourced: ['LinkedIn Recruiter'],
  'Careers site': ['Northgate careers page'],
  'Job board': ['Indeed', 'Glassdoor'],
  Agency: ['Third-party agency'],
  University: ['Career fair'],
}

/** Share of applications whose source is spelled in a way Census does not recognize. */
export const UNRECOGNIZED_SOURCE_SHARE = 0.04

/** Applications with an unrecognized source spelling (internal moves keep theirs). */
export function unrecognizedSourceRows(rows: readonly Candidate[]): Set<number> {
  return pickRows(
    rows,
    Math.round(rows.length * UNRECOGNIZED_SOURCE_SHARE),
    rngFor('raw-candidates'),
    (r) => r.source in UNRECOGNIZED_SOURCE,
  )
}

/** The spelling an application's source is written in when it is one of the unrecognized ones. */
const oddSource = (r: Candidate, i: number): string | null => {
  const odds = UNRECOGNIZED_SOURCE[r.source]
  return odds ? odds[i % odds.length] : null
}

/** The rows the import yields: unrecognized sources are kept as written. */
export function candidatesPlanted(base: Datasets): Candidate[] {
  const odd = unrecognizedSourceRows(base.candidates)
  return base.candidates.map((r, i) => (odd.has(i) ? { ...r, source: oddSource(r, i) ?? r.source } : r))
}

export function candidatesExtract(base: Datasets): RawExtract<'candidates'> {
  const odd = unrecognizedSourceRows(base.candidates)
  const columns: Column<Candidate>[] = [
    { header: 'Application ID', cell: (r) => r.applicationId },
    { header: 'Candidate ID', cell: (r) => r.candidateId ?? null },
    { header: 'First Name', cell: (r) => splitName(r.candidateName)[0] },
    { header: 'Last Name', cell: (r) => splitName(r.candidateName)[1] },
    { header: 'Requisition ID', cell: (r) => r.reqId },
    {
      header: 'Source',
      cell: (r, i) => (odd.has(i) ? oddSource(r, i) : null) ?? SOURCE[r.source] ?? r.source,
    },
    { header: 'Recruiter', cell: (r) => r.recruiter ?? null },
    { header: 'Coordinator', cell: (r) => r.coordinator ?? null },
    { header: 'Current Stage', cell: (r) => STAGE[r.currentStage] },
    { header: 'Status', cell: (r) => STATUS[r.status] },
    { header: 'Date Applied', cell: (r) => mmddyyyy(r.appliedDate) },
    { header: 'Recruiter Screen Date', cell: (r) => mmddyyyy(r.screenDate) },
    { header: 'HM Screen Date', cell: (r) => mmddyyyy(r.hmDate) },
    { header: 'Onsite Date', cell: (r) => mmddyyyy(r.onsiteDate) },
    { header: 'Offer Extended Date', cell: (r) => mmddyyyy(r.offerDate) },
    { header: 'Offer Accepted Date', cell: (r) => mmddyyyy(r.hiredDate) },
    { header: 'Last Stage Change', cell: (r) => mmddyyyy(r.stageEnteredDate) },
    { header: 'Rejection Date', cell: (r) => mmddyyyy(r.rejectedDate) },
    { header: 'Rejection Reason', cell: (r) => r.rejectionReason ?? null },
    { header: 'Next Interview', cell: (r) => mmddyyyy(r.nextEventDate) },
    { header: 'Last Activity', cell: (r) => mmddyyyy(r.lastActivityDate) },
    { header: 'Start Date', cell: (r) => mmddyyyy(r.startDate) },
  ]
  return {
    dataset: 'candidates',
    ...FILES.candidates,
    aoa: toAoa(base.candidates, columns),
  }
}
