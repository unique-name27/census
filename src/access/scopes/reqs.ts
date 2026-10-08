/**
 * The `reqs` scope: Recruiter mode's own requisitions (docs/ROLES-V2.md, 2.1 to 2.4). It has no
 * filter form: every filter works inside the reqs, and `applyScope` keeps requisitions, candidates,
 * onboarding tasks and the starts they produce after the filters. A start is on the reqs by the
 * rule Onboarding shows (`matchPreHires`). Pure and memoized.
 */
import type { Datasets, ISODate } from '@/data/schema'
import { matchPreHires } from '@/lib/starts'
import type { ReqsScope } from './types'

/** A recruiter's name as matched: trimmed, single spaces, any case. */
export const recruiterKey = (name: string | null | undefined): string =>
  (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** "Maya Chen's reqs". */
export const reqsOf = (name: string): string => `${name}'s reqs`

/** The onboarding matching window when the dictionary gives none (`onboarding.upcoming.starts`). */
export const DEFAULT_DEDUP_DAYS = 14

export type ReqsData = Pick<Datasets, 'requisitions' | 'candidates' | 'employees'>

const memo = new WeakMap<object, Map<string, ReqsScope>>()

/** The scope for one recruiter, memoized per datasets, as-of date, recruiter and matching window. */
export function reqsScope(
  data: ReqsData,
  asOf: ISODate,
  recruiter: { name: string; id: string | null },
  dedupDays: number = DEFAULT_DEDUP_DAYS,
): ReqsScope {
  let byKey = memo.get(data)
  if (!byKey) {
    byKey = new Map()
    memo.set(data, byKey)
  }
  const want = recruiterKey(recruiter.name)
  const key = `${asOf}|${want}|${recruiter.id ?? ''}|${dedupDays}`
  const hit = byKey.get(key)
  if (hit) return hit
  const reqs = data.requisitions.filter((r) => !!want && recruiterKey(r.recruiter) === want)
  const reqIds = new Set(reqs.map((r) => r.reqId))
  const appIds = new Set<string>()
  let activeCandidates = 0
  for (const c of data.candidates) {
    if (!reqIds.has(c.reqId)) continue
    appIds.add(c.applicationId)
    if (c.status === 'Active') activeCandidates++
  }
  const { matched } = matchPreHires(data.employees, data.candidates, data.requisitions, asOf, dedupDays)
  const startIds = new Set<string>()
  for (const [employeeId, c] of matched) if (reqIds.has(c.reqId)) startIds.add(employeeId)
  const name = recruiter.name.trim()
  const scope: ReqsScope = {
    kind: 'reqs',
    label: reqsOf(name),
    recruiter: name,
    recruiterId: recruiter.id,
    size: appIds.size,
    reqIds,
    appIds,
    startIds,
    openReqs: reqs.filter((r) => r.status === 'Open').length,
    activeCandidates,
    asOf,
  }
  byKey.set(key, scope)
  return scope
}

/** A reqs scope that holds nothing: no recruiter picked, or the remembered one is on no req. */
export function emptyReqsScope(
  recruiter: { name: string; id: string | null } | null,
  asOf: ISODate,
): ReqsScope {
  const name = recruiter?.name.trim() ?? ''
  const key = `${asOf}|${name}|${recruiter?.id ?? ''}`
  const hit = emptyReqs.get(key)
  if (hit) return hit
  const s: ReqsScope = {
    kind: 'reqs',
    label: name ? reqsOf(name) : '',
    recruiter: name,
    recruiterId: recruiter?.id ?? null,
    size: 0,
    reqIds: new Set(),
    appIds: new Set(),
    startIds: new Set(),
    openReqs: 0,
    activeCandidates: 0,
    asOf,
  }
  emptyReqs.set(key, s)
  return s
}
const emptyReqs = new Map<string, ReqsScope>()
