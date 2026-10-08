/**
 * `applyScope(data, scope)` (docs/ROLES-V2.md, 2.3 and 2.4): what a scope does to the datasets after
 * the filters. Only `reqs` has work to do; `org`, `unit` and `region` already went through
 * `scopeDatasets` as the filter they pin. For `reqs`:
 *
 * - requisitions: the recruiter's (`reqIds`); candidates: on those reqs;
 * - employees: the filtered roster, kept for names (hiring managers, owners), with pre-hires kept
 *   only when matched to an accepted candidate on the reqs (`startIds`);
 * - onboarding tasks: the reqs' applications (`appIds`) and the matched pre-hires;
 * - hiring plan: lines whose `reqId` is one of the reqs (the Hiring plan tab is hidden);
 * - every other dataset is emptied (Recruiter mode reads none of them). Pure and memoized.
 */
import type { Datasets } from '@/data/schema'
import type { ReqsScope, ScopeLock } from './types'

const memo = new WeakMap<Datasets, WeakMap<ReqsScope, Datasets>>()

function applyReqs(data: Datasets, s: ReqsScope): Datasets {
  const out = {} as Record<string, unknown[]>
  // Emptied unless named below, including datasets added later.
  for (const k of Object.keys(data)) out[k] = []
  const kept: Partial<Datasets> = {
    employees: data.employees.filter((e) => !(e.hireDate > s.asOf) || s.startIds.has(e.employeeId)),
    requisitions: data.requisitions.filter((r) => s.reqIds.has(r.reqId)),
    candidates: data.candidates.filter((c) => s.reqIds.has(c.reqId)),
    onboardingTasks: data.onboardingTasks.filter(
      (t) =>
        (!!t.applicationId && s.appIds.has(t.applicationId)) ||
        (!!t.employeeId && s.startIds.has(t.employeeId)),
    ),
    hiringPlan: data.hiringPlan.filter((p) => !!p.reqId && s.reqIds.has(p.reqId)),
  }
  return { ...(out as unknown as Datasets), ...kept }
}

/** The datasets inside a scope, the same object when the scope changes nothing. */
export function applyScope(data: Datasets, scope: ScopeLock | null | undefined): Datasets {
  if (scope?.kind !== 'reqs') return data
  let byScope = memo.get(data)
  if (!byScope) {
    byScope = new WeakMap()
    memo.set(data, byScope)
  }
  const hit = byScope.get(scope)
  if (hit) return hit
  const out = applyReqs(data, scope)
  byScope.set(scope, out)
  return out
}
