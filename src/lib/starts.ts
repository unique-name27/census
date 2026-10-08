/**
 * Who starts: matching accepted offers to pre-hire employee records (docs/VIEWS.md, Onboarding;
 * docs/ROLES-V2.md, 2.2). The HRIS creates a pre-hire as a copy of the accepted candidate, so a
 * candidate is the same person as a pre-hire with the same normalized name who starts in the req's
 * department within `dedupDays` of the candidate's start date. Onboarding's upcoming starts and
 * Recruiter mode's `reqs` scope both use this one rule, so a start is on a recruiter's reqs by
 * exactly the rule Onboarding shows. Pure.
 */
import type { Candidate, Employee, ISODate, Requisition } from '@/data/schema'
import { daysBetween } from './dates'

/** Lowercase, no accents, punctuation or single-letter initials: "Sanjay B. Krishnan" → "sanjay krishnan". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1)
    .join(' ')
}

/** An accepted offer: status Hired with an offer accepted date. */
export const isAccepted = (c: Candidate): boolean => c.status === 'Hired' && !!c.hiredDate

const isList = (
  reqs: ReadonlyMap<string, Requisition> | readonly Requisition[],
): reqs is readonly Requisition[] => Array.isArray(reqs)

export interface PreHireMatch {
  /** Employees hired after the as-of date, in roster order. */
  preHires: Employee[]
  /** Pre-hire employee ID → the accepted candidate it is a copy of. */
  matched: Map<string, Candidate>
  /** Accepted offers starting after the as-of date that are copies of a pre-hire. */
  duplicates: Candidate[]
  /** Accepted offers starting after the as-of date with no pre-hire. */
  solo: Candidate[]
  /** Accepted offers with no start date. */
  noStart: Candidate[]
}

/**
 * Match accepted offers that start after `asOf` to pre-hires: same normalized name, start dates at
 * most `dedupDays` apart, and the pre-hire in the req's department when the req names one. Each
 * pre-hire matches one candidate at most, the first in `candidates` order.
 */
export function matchPreHires(
  employees: readonly Employee[],
  candidates: readonly Candidate[],
  reqs: ReadonlyMap<string, Requisition> | readonly Requisition[],
  asOf: ISODate,
  dedupDays: number,
): PreHireMatch {
  const reqById: ReadonlyMap<string, Requisition> = isList(reqs)
    ? new Map(reqs.map((r) => [r.reqId, r]))
    : reqs
  const preHires = employees.filter((e) => e.hireDate > asOf)
  const byName = new Map<string, Employee[]>()
  for (const e of preHires) {
    const k = normalizeName(e.name)
    const list = byName.get(k)
    if (list) list.push(e)
    else byName.set(k, [e])
  }
  const matched = new Map<string, Candidate>()
  const duplicates: Candidate[] = []
  const solo: Candidate[] = []
  const noStart: Candidate[] = []
  for (const c of candidates) {
    if (!isAccepted(c)) continue
    if (!c.startDate) {
      noStart.push(c)
      continue
    }
    if (c.startDate <= asOf) continue
    const req = reqById.get(c.reqId)
    const start = c.startDate
    const twin = (byName.get(normalizeName(c.candidateName)) ?? []).find(
      (e) =>
        !matched.has(e.employeeId) &&
        Math.abs(daysBetween(e.hireDate, start)) <= dedupDays &&
        (!req?.department || e.department === req.department),
    )
    if (twin) {
      matched.set(twin.employeeId, c)
      duplicates.push(c)
    } else solo.push(c)
  }
  return { preHires, matched, duplicates, solo, noStart }
}
