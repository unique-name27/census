/**
 * Scope kinds (docs/ROLES-V2.md, 2.1 and 2.2): what a scoped mode holds Census to. `org`, `unit`
 * and `region` pin a filter (leader, business unit, location) through the one clamp; `reqs`
 * narrows the records after the filters (`applyScope`). Pure types.
 */
import type { ISODate } from '@/data/schema'

export type ScopeKind = 'org' | 'unit' | 'region' | 'reqs'

export const SCOPE_KINDS: readonly ScopeKind[] = ['org', 'unit', 'region', 'reqs']

interface ScopeBase {
  kind: ScopeKind
  /** For copy: "Priya Raman's org", "Silicon Engineering", "APAC", "Maya Chen's reqs". */
  label: string
  /** Active employees in the scope (org, unit, region), or candidates on the reqs (reqs). */
  size: number
}

/** Manager mode: the manager's subtree (docs/ROLES.md, 4.1). */
export interface OrgScope extends ScopeBase {
  kind: 'org'
  managerId: string
  managerName: string
  /** Employee IDs in the manager's org (`subtreeIds`), the manager included, current and former. */
  orgIds: ReadonlySet<string>
}

/** HRBP for a business unit: one business unit at every location. */
export interface UnitScope extends ScopeBase {
  kind: 'unit'
  unit: string
  /** Employee IDs in the unit, current and former (the person card and the records guard). */
  memberIds: ReadonlySet<string>
  /**
   * People whose org holds an active employee of the unit (the unit's members and everyone above
   * them): the leader filter keeps only these.
   */
  leaderIds: ReadonlySet<string>
  /** Departments whose official parent (else majority unit in the data) is another unit. */
  otherDepartments: ReadonlySet<string>
}

/** HRBP for a region: every employee at the region's sites, across business units. */
export interface RegionScope extends ScopeBase {
  kind: 'region'
  region: string
  /** The region's locations in the loaded data, in list order. */
  sites: readonly string[]
  /** Employee IDs at the region's sites, current and former. */
  memberIds: ReadonlySet<string>
}

/** Recruiter: one recruiter's requisitions, their candidates and the starts they produce. */
export interface ReqsScope extends ScopeBase {
  kind: 'reqs'
  recruiter: string
  recruiterId: string | null
  reqIds: ReadonlySet<string>
  /** Applications on those reqs. */
  appIds: ReadonlySet<string>
  /** Pre-hire employee IDs matched to an accepted candidate on those reqs (`matchPreHires`). */
  startIds: ReadonlySet<string>
  /** Requisitions with status Open. */
  openReqs: number
  /** Candidates with status Active on those reqs. */
  activeCandidates: number
  /** The as-of date the scope was built for: pre-hires are hired after it. */
  asOf: ISODate
}

export type ScopeLock = OrgScope | UnitScope | RegionScope | ReqsScope

/** Kept so code written for Manager mode compiles unchanged. */
export type ManagerLock = OrgScope

/** A scope and whether its pick is missing or gone (then the scope holds nobody). */
export interface HeldScope<S extends ScopeLock = ScopeLock> {
  scope: S
  unset: boolean
}
