/**
 * One clamp for every scope (docs/ROLES-V2.md, 2.3). `clampFilters` runs at every way the filters
 * change (the store's filter guard: the filter row, Reset, the opening address, Back and Forward,
 * saved views, `focusScope`, Filter to and Leave out, Ask) and once more inside `buildContext`. It
 * is pure, idempotent, and returns the same object when nothing changes.
 *
 * - `org`: the leader is the manager or someone in their org, include only (docs/ROLES.md 4.2).
 * - `unit`: the business unit is `[unit]`, include only; departments of other units and leaders
 *   whose org has nobody active in the unit are dropped. Everything else keeps its values and modes.
 * - `region`: the location filter is a non-empty subset of the region's sites, include only.
 * - `reqs`: no change (every filter works inside the reqs, as on Recruiting today).
 * - Finance (no scope): leader, department, location and level are cleared, the business unit
 *   keeps its values in include mode (an excluded list becomes empty). The period is kept. Any
 *   other unscoped mode whose pay view is 'totals' (cost totals without the switch) gets the same
 *   restriction, so its totals also differ only by whole business units (`byWholeUnits`).
 */
import { FILTER_DIMENSIONS, type FilterDimension, type Filters, isExcluded, withMode } from '@/data/scope'
import { linkLeaderReplaced } from '../copy'
import { MODE_NAME, type Mode } from '../modes'
import { payView } from '../pay'
import { leaderInLock } from './org'
import { pinnedSites } from './region'
import type { OrgScope, RegionScope, ScopeLock, UnitScope } from './types'

/** The org filters each mode's filter row offers (2.5): Finance filters by business unit only. */
export const FILTER_DIMS_OF: Readonly<Record<Mode, readonly FilterDimension[]>> = {
  hr: FILTER_DIMENSIONS,
  chro: FILTER_DIMENSIONS,
  'hrbp-unit': FILTER_DIMENSIONS,
  'hrbp-region': FILTER_DIMENSIONS,
  compensation: FILTER_DIMENSIONS,
  'talent-management': FILTER_DIMENSIONS,
  recruiter: FILTER_DIMENSIONS,
  'hr-ops': FILTER_DIMENSIONS,
  finance: ['businessUnit'],
  manager: FILTER_DIMENSIONS,
  developer: FILTER_DIMENSIONS,
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

function clampOrg(f: Filters, s: OrgScope): Filters {
  if (leaderInLock(f, s)) return f
  return { ...f, leaderId: s.managerId, modes: withMode(f.modes, 'leaderId', 'include') }
}

function clampUnit(f: Filters, s: UnitScope): Filters {
  let out = f
  if (!(sameList(f.businessUnit, [s.unit]) && !isExcluded(f, 'businessUnit')))
    out = { ...out, businessUnit: [s.unit], modes: withMode(out.modes, 'businessUnit', 'include') }
  if (f.department.some((d) => s.otherDepartments.has(d))) {
    const department = f.department.filter((d) => !s.otherDepartments.has(d))
    out = {
      ...out,
      department,
      modes: department.length ? out.modes : withMode(out.modes, 'department', 'include'),
    }
  }
  if (f.leaderId && !s.leaderIds.has(f.leaderId))
    out = { ...out, leaderId: null, modes: withMode(out.modes, 'leaderId', 'include') }
  return out
}

function clampRegion(f: Filters, s: RegionScope): Filters {
  const sites = pinnedSites(s)
  const excluded = isExcluded(f, 'location')
  let location: string[]
  if (excluded) {
    const out = new Set(f.location)
    const left = sites.filter((l) => !out.has(l))
    location = left.length ? left : [...sites]
  } else {
    const at = new Set(sites)
    const named = f.location.filter((l) => at.has(l))
    location = named.length ? named : [...sites]
  }
  if (!excluded && sameList(location, f.location)) return f
  return { ...f, location, modes: withMode(f.modes, 'location', 'include') }
}

function clampFinance(f: Filters): Filters {
  const buOut = isExcluded(f, 'businessUnit')
  const untouched =
    !f.leaderId &&
    !f.department.length &&
    !f.location.length &&
    !f.level.length &&
    !Object.keys(f.modes ?? {}).length
  if (untouched) return f
  return {
    ...f,
    leaderId: null,
    department: [],
    location: [],
    level: [],
    businessUnit: buOut ? [] : f.businessUnit,
    modes: {},
  }
}

/** Finance's restriction applies: Finance, or any unscoped mode showing cost totals without the switch. */
export const byWholeUnits = (mode: Mode | undefined): boolean =>
  mode === 'finance' || (!!mode && payView(mode) === 'totals')

/**
 * The filters inside a scope (or Finance's restriction when `mode` shows cost totals without the
 * switch and there is no scope). The same object when nothing changes.
 */
export function clampFilters(filters: Filters, scope: ScopeLock | null | undefined, mode?: Mode): Filters {
  if (scope)
    switch (scope.kind) {
      case 'org':
        return clampOrg(filters, scope)
      case 'unit':
        return clampUnit(filters, scope)
      case 'region':
        return clampRegion(filters, scope)
      case 'reqs':
        return filters
    }
  if (byWholeUnits(mode)) return clampFinance(filters)
  return filters
}

/** Whether a mode changes filters at all (a scope, or Finance's restriction). */
export const clamps = (scope: ScopeLock | null | undefined, mode?: Mode): boolean =>
  (!!scope && scope.kind !== 'reqs') || (!scope && byWholeUnits(mode))

/**
 * The one toast a link or a saved view gets when the clamp changed its filters (2.3), or null when
 * it did not (or changed nothing the reader asked for). Back and Forward never ask.
 */
export function clampReason(
  mode: Mode,
  scope: ScopeLock | null | undefined,
  asked: Filters,
  kept: Filters,
  from: 'link' | 'view' = 'link',
): string | null {
  if (asked === kept) return null
  const what = from === 'view' ? 'saved view' : 'link'
  if (scope?.kind === 'org') {
    if (!asked.leaderId || asked.leaderId === kept.leaderId || !scope.managerName) return null
    return linkLeaderReplaced(scope.managerName, from)
  }
  if (scope?.kind === 'unit') {
    if (!scope.label) return null
    const otherUnits = asked.businessUnit.some((u) => u !== scope.unit) || isExcluded(asked, 'businessUnit')
    if (otherUnits)
      return `${MODE_NAME[mode]} mode shows ${scope.label}, so the ${what}'s other business units were left out.`
    if (!sameList(asked.department, kept.department) || asked.leaderId !== kept.leaderId)
      return `${MODE_NAME[mode]} mode shows ${scope.label}, so the ${what}'s filters outside it were left out.`
    return null
  }
  if (scope?.kind === 'region') {
    if (!scope.label) return null
    const at = new Set(scope.sites)
    const outside = asked.location.some((l) => !at.has(l)) || isExcluded(asked, 'location')
    return outside && asked.location.length
      ? `${MODE_NAME[mode]} mode shows ${scope.label}, so the ${what}'s other locations were left out.`
      : null
  }
  if (!scope && byWholeUnits(mode))
    return `${MODE_NAME[mode]} mode filters by business unit and period, so the ${what}'s other filters were left out.`
  return null
}
