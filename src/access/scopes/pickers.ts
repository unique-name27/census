/**
 * What each pick dialog lists (docs/ROLES-V2.md, 1.3), largest first. Pure: the Shell's
 * `ScopePicker` renders these rows; the counts are the ones in each row's line ("412 employees ·
 * 7 locations", "506 employees · Bengaluru, Hsinchu", "14 open reqs · 61 active candidates").
 * Managers keep the leader filter's own list (`leaderOptions` in `@/app/filterOptions`).
 */
import type { Datasets, Employee, ISODate } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { addMonths } from '@/lib/dates'
import type { RegionIndex } from './regions'
import { recruiterKey } from './reqs'

const active = (e: Employee, asOf: ISODate) => isEmployee(e) && isActiveAt(e, asOf)

export interface UnitOption {
  unit: string
  /** Active employees in the unit. */
  employees: number
  /** Locations those employees work at. */
  locations: number
  /** False for a unit on the official list with nobody in the data (shown muted). */
  pickable: boolean
}

/** Each business unit with active employees, largest first, then listed units with nobody. */
export function unitOptions(
  employees: readonly Employee[],
  asOf: ISODate,
  listed: readonly string[] = [],
): UnitOption[] {
  const by = new Map<string, { n: number; at: Set<string> }>()
  for (const e of employees) {
    if (!e.businessUnit || !active(e, asOf)) continue
    let u = by.get(e.businessUnit)
    if (!u) {
      u = { n: 0, at: new Set() }
      by.set(e.businessUnit, u)
    }
    u.n++
    if (e.location) u.at.add(e.location)
  }
  const rows: UnitOption[] = [...by].map(([unit, u]) => ({
    unit,
    employees: u.n,
    locations: u.at.size,
    pickable: true,
  }))
  rows.sort((a, b) => b.employees - a.employees || a.unit.localeCompare(b.unit))
  const empty = [...new Set(listed)]
    .filter((u) => !by.has(u))
    .sort((a, b) => a.localeCompare(b))
    .map((unit) => ({ unit, employees: 0, locations: 0, pickable: false }))
  return [...rows, ...empty]
}

export interface RegionOption {
  region: string
  /** Active employees at the region's sites. */
  employees: number
  /** The region's sites in the loaded data, in list order. */
  sites: readonly string[]
}

export interface RegionOptions {
  rows: RegionOption[]
  /** Active employees at locations with no region (the dialog's foot line). */
  noRegionPeople: number
}

/** Each region with a location in the loaded data, largest first. */
export function regionOptions(
  regions: RegionIndex,
  employees: readonly Employee[],
  asOf: ISODate,
): RegionOptions {
  const counts = new Map<string, number>()
  let noRegionPeople = 0
  for (const e of employees) {
    if (!active(e, asOf)) continue
    const r = regions.regionOf(e.location)
    if (r) counts.set(r, (counts.get(r) ?? 0) + 1)
    else noRegionPeople++
  }
  const rows = regions.regions.map((region) => ({
    region,
    employees: counts.get(region) ?? 0,
    sites: regions.sitesOf(region),
  }))
  rows.sort(
    (a, b) =>
      b.employees - a.employees || regions.regions.indexOf(a.region) - regions.regions.indexOf(b.region),
  )
  return { rows, noRegionPeople }
}

export interface RecruiterOption {
  /** The name as most of their reqs spell it. */
  name: string
  /** Their employee ID when exactly one active person on the roster has the name. */
  id: string | null
  /** Their requisitions with status Open. */
  openReqs: number
  /** Active candidates on their requisitions. */
  activeCandidates: number
}

/**
 * Everyone named as the recruiter on a req that is open now or was opened in the last 12 months
 * (trimmed, matched case-insensitively), largest first. Counts cover all of their reqs.
 */
export function recruiterOptions(
  data: Pick<Datasets, 'requisitions' | 'candidates' | 'employees'>,
  asOf: ISODate,
): RecruiterOption[] {
  const since = addMonths(asOf, -12)
  const recent = new Set<string>()
  for (const r of data.requisitions) {
    const k = recruiterKey(r.recruiter)
    if (k && (r.status === 'Open' || (r.openedDate > since && r.openedDate <= asOf))) recent.add(k)
  }
  const spellings = new Map<string, Map<string, number>>()
  const openReqs = new Map<string, number>()
  const reqOwner = new Map<string, string>()
  for (const r of data.requisitions) {
    const k = recruiterKey(r.recruiter)
    if (!recent.has(k)) continue
    reqOwner.set(r.reqId, k)
    const raw = (r.recruiter ?? '').trim().replace(/\s+/g, ' ')
    let s = spellings.get(k)
    if (!s) {
      s = new Map()
      spellings.set(k, s)
    }
    s.set(raw, (s.get(raw) ?? 0) + 1)
    if (r.status === 'Open') openReqs.set(k, (openReqs.get(k) ?? 0) + 1)
  }
  const activeCandidates = new Map<string, number>()
  for (const c of data.candidates) {
    const k = c.status === 'Active' ? reqOwner.get(c.reqId) : undefined
    if (k) activeCandidates.set(k, (activeCandidates.get(k) ?? 0) + 1)
  }
  // A name matches the roster only when exactly one person active on the as-of date has it.
  const roster = new Map<string, string | null>()
  for (const e of data.employees) {
    if (!e.name || !isActiveAt(e, asOf)) continue
    const k = recruiterKey(e.name)
    roster.set(k, roster.has(k) ? null : e.employeeId)
  }
  const rows: RecruiterOption[] = [...spellings].map(([k, s]) => {
    const name = [...s].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    return {
      name,
      id: roster.get(k) ?? null,
      openReqs: openReqs.get(k) ?? 0,
      activeCandidates: activeCandidates.get(k) ?? 0,
    }
  })
  return rows.sort(
    (a, b) =>
      b.openReqs - a.openReqs || b.activeCandidates - a.activeCandidates || a.name.localeCompare(b.name),
  )
}
