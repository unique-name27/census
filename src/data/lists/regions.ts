/**
 * The regional HR business partners (docs/ACTION-CENTER-AUDIT.md 5.8 and part 8, question 3;
 * docs/ROLES-V2.md "Decisions made"): the Regions list in force (Settings > Official lists) names
 * one per region, by name or employee ID, so the sample and uploads work without a new column.
 * HRBP for a region mode reads it for its "me": the regional HRBP's own items and the region's
 * site matters are their Needs attention. A list saved for the other kind of data (the sample's
 * names while your data is loaded) names nobody. Pure and memoized.
 */
import { isFilled } from '../quality/applicability'
import { kindsKey, officialLists, type SourceKinds } from './effective'
import type { ListsState } from './types'

const memo = new WeakMap<ListsState, Map<string, ReadonlyMap<string, string>>>()

/** Region → the HR business partner the Regions list names (as typed: a name or an employee ID). */
export function regionOwners(saved: ListsState, sources: SourceKinds): ReadonlyMap<string, string> {
  const key = kindsKey(sources)
  let byKey = memo.get(saved)
  if (!byKey) {
    byKey = new Map()
    memo.set(saved, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const out = new Map<string, string>()
  const list = officialLists(saved, sources).region
  if (list?.validates)
    for (const v of list.values) {
      const who = v.attrs?.hrbp
      if (!v.retired && isFilled(who)) out.set(v.value, String(who).trim())
    }
  byKey.set(key, out)
  return out
}
