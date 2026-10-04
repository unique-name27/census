/**
 * Pre-hire records. The HRIS creates the employee record two weeks before the first day, when
 * the new hire paperwork goes out, so the accepted offers that start by 16 Oct 2026 are in the
 * roster already, with a future hire date and the hiring manager as their manager; later
 * starts exist only as accepted candidates in the ATS (docs/VIEWS.md, Onboarding: upcoming
 * starts). Two people moved their first day a week later in the HRIS and the ATS was not updated,
 * so the de-duplication by req, name and a 14-day window has something to do. Pre-hires have no
 * pay, review, learning or transaction rows yet.
 */
import { type Candidate, type Employee, type Requisition, siteByLocation } from '../schema'
import { AS_OF, day, iso } from './calendar'
import { costCenter } from './departments'
import { jobFunctionOf } from './raw/jobFunction'

/** Accepted offers starting on or before this date have a pre-hire record. */
export const PRE_HIRE_HORIZON = '2026-10-16'
/** Pre-hires whose HRIS start is a week later than the ATS start date. */
export const MOVED_STARTS = 2

const mostCommon = (values: readonly (string | null | undefined)[]): string | null => {
  const n = new Map<string, number>()
  for (const v of values) if (v) n.set(v, (n.get(v) ?? 0) + 1)
  let best: string | null = null
  for (const [v, k] of n) if (best == null || k > n.get(best)! || (k === n.get(best) && v < best)) best = v
  return best
}

export function preHireRows(
  employees: readonly Employee[],
  candidates: readonly Candidate[],
  requisitions: readonly Requisition[],
): Employee[] {
  const asOf = iso(AS_OF)
  const reqs = new Map(requisitions.map((r) => [r.reqId, r]))
  const active = employees.filter((e) => !e.terminationDate)
  const accepted = candidates
    .filter(
      (c) => c.status === 'Hired' && c.startDate && c.startDate > asOf && c.startDate <= PRE_HIRE_HORIZON,
    )
    .sort(
      (a, b) => a.startDate!.localeCompare(b.startDate!) || a.applicationId.localeCompare(b.applicationId),
    )
  // The two moved starts: the last two US starts (the HRIS has the later date).
  const us = (c: Candidate) => siteByLocation.get(reqs.get(c.reqId)!.location)?.country === 'United States'
  const moved = new Set(
    accepted
      .filter((c) => us(c))
      .slice(-MOVED_STARTS)
      .map((c) => c.applicationId),
  )
  const next = Math.max(...employees.map((e) => Number(e.employeeId.slice(1)))) + 1
  const rows = accepted.map((c) => {
    const req = reqs.get(c.reqId)!
    const start = moved.has(c.applicationId) ? iso(day(c.startDate!) + 7) : c.startDate!
    const unit = active.filter((e) => e.businessUnit === req.businessUnit)
    return {
      employeeId: '',
      name: c.candidateName,
      jobTitle: req.jobTitle,
      jobFamily: mostCommon(active.filter((e) => e.department === req.department).map((e) => e.jobFamily)),
      jobFunction: jobFunctionOf(req.businessUnit),
      businessUnit: req.businessUnit,
      department: req.department,
      location: req.location,
      country: siteByLocation.get(req.location)!.country,
      level: req.level,
      managerId: req.hiringManagerId ?? null,
      hireDate: start,
      terminationDate: null,
      terminationType: null,
      terminationReason: null,
      regrettable: null,
      employmentType: 'Employee' as const,
      hrbp: mostCommon(unit.map((e) => e.hrbp)),
      costCenter: costCenter(req.department, req.location),
    } satisfies Employee
  })
  // Employee IDs follow hire order, as the HRIS issues them.
  rows.sort((a, b) => a.hireDate.localeCompare(b.hireDate) || a.name.localeCompare(b.name))
  return rows.map((e, i) => ({ ...e, employeeId: `E${next + i}` }))
}
