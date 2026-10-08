/**
 * One region index for every reader (docs/ROLES-V2.md, 1.3): the region scope, the region picker,
 * and Onboarding's and Listening's regions, so a region has one name everywhere.
 *
 * Regions come from the Region column of the Locations list in force (`effectiveLists(...)
 * .location`, official when made official, else proposed from the data). A location in the data
 * with no list entry takes `locationAttrs(location, country).region` (the known site, else its
 * country). A location with no region belongs to no region. Pure and memoized.
 */
import { locationAttrs } from '@/data/lists/seed'
import type { ListValue } from '@/data/lists/types'
import { type Datasets, REGIONS } from '@/data/schema'

/** The datasets whose location fields make a location part of the loaded data (the list's refs). */
export type RegionData = Pick<Datasets, 'employees' | 'requisitions' | 'cases' | 'hiringPlan'>

export interface RegionIndex {
  /** The region of a location, or null when it has none. */
  regionOf: (location: string | null | undefined) => string | null
  /** Regions with at least one location in the loaded data: Americas, EMEA, APAC first, then others by name. */
  regions: readonly string[]
  /** A region's locations in the loaded data, in list order (locations not on the list after, by name). */
  sitesOf: (region: string) => readonly string[]
  /** Locations in the loaded data that have no region. */
  noRegion: readonly string[]
}

const NO_LIST: readonly ListValue[] = []
const memo = new WeakMap<object, WeakMap<object, RegionIndex>>()

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Locations named in the loaded data, each with the first country an employee there has. */
function dataLocations(data: RegionData): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const e of data.employees)
    if (e.location && (!out.has(e.location) || !out.get(e.location))) out.set(e.location, e.country || null)
  const add = (l: string | null | undefined) => {
    if (l && !out.has(l)) out.set(l, null)
  }
  for (const r of data.requisitions) add(r.location)
  for (const c of data.cases) add(c.location)
  for (const p of data.hiringPlan) add(p.location)
  return out
}

/**
 * The region index for a Locations list and the loaded data. Without a list (tests, the gallery)
 * every location takes its known site's region, else its country's.
 */
export function regionIndex(
  locations: readonly ListValue[] | null | undefined,
  data: RegionData,
): RegionIndex {
  const list = locations ?? NO_LIST
  let byData = memo.get(list)
  if (!byData) {
    byData = new WeakMap()
    memo.set(list, byData)
  }
  const hit = byData.get(data)
  if (hit) return hit
  const listed = new Map<string, string | null>()
  for (const v of list) listed.set(v.value, text(v.attrs?.region))
  const inData = dataLocations(data)
  const regionOfLoc = new Map<string, string | null>(listed)
  for (const [loc, country] of inData)
    if (!regionOfLoc.has(loc)) regionOfLoc.set(loc, text(locationAttrs(loc, country).region))
  // Sites per region: list order first, then the data's own locations by name.
  const sites = new Map<string, string[]>()
  const noRegion: string[] = []
  const place = (loc: string) => {
    const r = regionOfLoc.get(loc) ?? null
    if (!r) {
      noRegion.push(loc)
      return
    }
    const xs = sites.get(r)
    if (xs) xs.push(loc)
    else sites.set(r, [loc])
  }
  for (const v of list) if (inData.has(v.value)) place(v.value)
  for (const loc of [...inData.keys()].filter((l) => !listed.has(l)).sort()) place(loc)
  const known = REGIONS as readonly string[]
  const regions = [
    ...known.filter((r) => sites.has(r)),
    ...[...sites.keys()].filter((r) => !known.includes(r)).sort(),
  ]
  const out: RegionIndex = {
    regionOf: (l) => (l ? (regionOfLoc.get(l) ?? null) : null),
    regions,
    sitesOf: (r) => sites.get(r) ?? [],
    noRegion: noRegion.sort(),
  }
  byData.set(data, out)
  return out
}
