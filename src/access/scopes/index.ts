/**
 * Scopes (docs/ROLES-V2.md, part 2): `scopeFor(mode, picks, env)` is the scope a mode holds for
 * its remembered pick, like `heldLock` for Manager mode. A pick that is missing or gone gives an
 * empty scope of its kind (holding nobody, never the whole company) and `unset: true`. Pure.
 */
import type { Datasets, ISODate } from '@/data/schema'
import type { OrgIndex } from '@/data/scope'
import { EVERY_RECRUITER, type Mode, type ModePicks, SCOPE_OF } from '../modes'
import { heldLock } from './org'
import { emptyRegionScope, regionScope } from './region'
import { type RegionIndex, regionIndex } from './regions'
import { DEFAULT_DEDUP_DAYS, emptyReqsScope, reqsScope } from './reqs'
import type { ScopeLock } from './types'
import { emptyUnitScope, unitScope } from './unit'

export * from './apply'
export * from './clamp'
export * from './label'
export * from './org'
export * from './pickers'
export * from './records'
export * from './region'
export * from './regions'
export * from './reqs'
export * from './types'
export * from './unit'

/** What building a scope reads. */
export interface ScopeEnv {
  org: OrgIndex
  asOf: ISODate
  /** The unscoped datasets (`ctx.all`). */
  all: Datasets
  /** The region index; built from the data alone (known sites, else countries) when not given. */
  regions?: RegionIndex | null
  /** Department → business unit on the official Departments list, for the unit clamp. */
  departmentParents?: ReadonlyMap<string, string | null> | null
  /** The onboarding matching window (`onboarding.upcoming.starts`, `dedupDays`). */
  dedupDays?: number
}

export interface ScopeResult {
  /** Null for the modes without a scope, and for Recruiter's "Every recruiter". */
  scope: ScopeLock | null
  /** The mode's pick is missing or gone: the scope holds nobody until one is picked. */
  unset: boolean
}

const NONE: ScopeResult = Object.freeze({ scope: null, unset: false })

/** The scope a mode holds for its picks. */
export function scopeFor(mode: Mode, picks: Partial<ModePicks>, env: ScopeEnv): ScopeResult {
  switch (SCOPE_OF[mode]) {
    case 'org': {
      const held = heldLock(env.org, env.asOf, picks.managerId)
      return { scope: held.scope, unset: held.unset }
    }
    case 'unit': {
      const unit = picks.unit?.trim()
      if (!unit) return { scope: emptyUnitScope(null), unset: true }
      const s = unitScope(env.all.employees, env.asOf, unit, { departmentParents: env.departmentParents })
      return s.size > 0 ? { scope: s, unset: false } : { scope: emptyUnitScope(unit), unset: true }
    }
    case 'region': {
      const region = picks.region?.trim()
      if (!region) return { scope: emptyRegionScope(null), unset: true }
      const regions = env.regions ?? regionIndex(null, env.all)
      const s = regionScope(env.all.employees, env.asOf, region, regions)
      return s.sites.length ? { scope: s, unset: false } : { scope: emptyRegionScope(region), unset: true }
    }
    case 'reqs': {
      const r = picks.recruiter
      if (!r?.name?.trim()) return { scope: emptyReqsScope(null, env.asOf), unset: true }
      if (r.name === EVERY_RECRUITER) return NONE
      const s = reqsScope(env.all, env.asOf, r, env.dedupDays ?? DEFAULT_DEDUP_DAYS)
      return s.reqIds.size ? { scope: s, unset: false } : { scope: emptyReqsScope(r, env.asOf), unset: true }
    }
    default:
      return NONE
  }
}
