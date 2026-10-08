/**
 * The `region` scope: HRBP for a region (docs/ROLES-V2.md, 2.1 to 2.4). It pins the location filter
 * to a non-empty subset of the region's sites, include only; every dataset follows it through
 * `scopeDatasets`. The sites come from the one region index (`regionIndex`). Pure and memoized.
 */
import type { Employee, ISODate } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import type { RegionIndex } from './regions'
import type { RegionOwner, RegionScope } from './types'
import { NOBODY } from './unit'

const nameKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * The regional HR business partner as the Regions list names them (a name or an employee ID),
 * matched on the roster: by employee ID, else the one person of that name (an active one first).
 * Unmatched, the name stands alone (`id` null); a blank names nobody.
 */
export function regionOwnerOf(
  named: string | null | undefined,
  employees: readonly Employee[],
  asOf: ISODate,
): RegionOwner | null {
  const text = named?.trim()
  if (!text) return null
  const byId = employees.find((e) => e.employeeId === text)
  if (byId) return { name: byId.name, id: byId.employeeId }
  const key = nameKey(text)
  const same = employees.filter((e) => nameKey(e.name) === key)
  const active = same.filter((e) => isActiveAt(e, asOf))
  const one = active.length === 1 ? active[0] : same.length === 1 ? same[0] : null
  return one ? { name: one.name, id: one.employeeId } : { name: text, id: null }
}

const memo = new WeakMap<RegionIndex, WeakMap<readonly Employee[], Map<string, RegionScope>>>()

/** The scope for one region, memoized per region index, roster, as-of date, region and owner. */
export function regionScope(
  employees: readonly Employee[],
  asOf: ISODate,
  region: string,
  regions: RegionIndex,
  owner: RegionOwner | null = null,
): RegionScope {
  let byRoster = memo.get(regions)
  if (!byRoster) {
    byRoster = new WeakMap()
    memo.set(regions, byRoster)
  }
  let byKey = byRoster.get(employees)
  if (!byKey) {
    byKey = new Map()
    byRoster.set(employees, byKey)
  }
  const key = `${asOf}|${region}|${owner?.id ?? ''}|${owner?.name ?? ''}`
  const hit = byKey.get(key)
  if (hit) return hit
  const sites = regions.sitesOf(region)
  const at = new Set(sites)
  const memberIds = new Set<string>()
  let size = 0
  for (const e of employees) {
    if (!e.location || !at.has(e.location)) continue
    memberIds.add(e.employeeId)
    if (isEmployee(e) && isActiveAt(e, asOf)) size++
  }
  const scope: RegionScope = { kind: 'region', label: region, region, sites, size, memberIds, owner }
  byKey.set(key, scope)
  return scope
}

/** A region scope that holds nobody: no region picked, or no location in the loaded data is in it. */
export function emptyRegionScope(region: string | null | undefined): RegionScope {
  const label = region ?? ''
  let s = emptyRegions.get(label)
  if (!s) {
    s = { kind: 'region', label, region: region || NOBODY, sites: [], size: 0, memberIds: new Set() }
    emptyRegions.set(label, s)
  }
  return s
}
const emptyRegions = new Map<string, RegionScope>()

/** The locations a region scope pins: its sites, or a value no record has when it has none. */
export const pinnedSites = (scope: Pick<RegionScope, 'sites'>): readonly string[] =>
  scope.sites.length ? scope.sites : [NOBODY]
