/**
 * Source of hire (docs/ANALYSES.md, 2.2): the hired application each employee came from, by
 * Recruiting's own link (`rosterLink`: the same name, a start date within 200 days of accepting)
 * run from the employee side. Company-wide and kept per loaded data, so a filter never rebuilds
 * it. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Candidate } from '@/data/schema'
import { rosterLink } from '@/views/recruiting/engine/drills'
import { prepareApps, reqIndex } from '@/views/recruiting/engine/prepare'
import type { App } from '@/views/recruiting/engine/types'

const memo = new WeakMap<readonly Candidate[], Map<string, ReadonlyMap<string, App>>>()

/** Hired applications by the employee they became: the one accepted closest before the start date. */
export function hiredApplications(ctx: Pick<AnalyticsContext, 'all' | 'asOf'>): ReadonlyMap<string, App> {
  const { candidates, requisitions, employees } = ctx.all
  let byAsOf = memo.get(candidates)
  if (!byAsOf) {
    byAsOf = new Map()
    memo.set(candidates, byAsOf)
  }
  const hit = byAsOf.get(ctx.asOf)
  if (hit) return hit
  const out = new Map<string, App>()
  const apps = prepareApps(candidates, reqIndex(requisitions), ctx.asOf)
  for (const a of apps) {
    if (a.outcome !== 'Hired') continue
    const e = rosterLink(a, employees)
    // An internal move links to someone already employed: it is not how they were hired.
    if (!e || !a.exitDate || e.hireDate < a.exitDate) continue
    const prev = out.get(e.employeeId)
    // Two offers for one start (a rehire): the one accepted closest before it.
    if (!prev || (a.exitDate ?? '') > (prev.exitDate ?? '')) out.set(e.employeeId, a)
  }
  byAsOf.set(ctx.asOf, out)
  return out
}
