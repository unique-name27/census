/**
 * Where an Action center item sits, for the HRBP lenses (docs/ACTION-CENTER-AUDIT.md 4.1, `place`):
 * the business unit, location and region of the person, req or group it is about. Regions come
 * from the one region index (docs/ROLES-V2.md 1.3: `ctx.regions`, the Locations list in force), so
 * an item, the region scope and every chart name a region the same way ("APAC").
 *
 * Also the team names an item owner can be when no person is named, from one list, so the same
 * team never reads two ways ("Recruiting team" and "Recruiting"). Pure: no React.
 */
import { type RegionIndex, regionIndex } from '@/access/scopes/regions'
import type { AnalyticsContext } from '@/data/context'
import type { ActionItem } from '../../types'

/** The region index in force: the context's (the Locations list), else each site's own region. */
export function regionsOf(ctx: Pick<AnalyticsContext, 'regions' | 'all'>): RegionIndex {
  return ctx.regions ?? regionIndex(null, ctx.all)
}

/** An item's `place` from a record's business unit and location (region from the index). */
export function placeOf(
  ctx: Pick<AnalyticsContext, 'regions' | 'all'>,
  rec: { businessUnit?: string | null; location?: string | null } | null | undefined,
): NonNullable<ActionItem['place']> {
  const location = rec?.location ?? null
  return {
    businessUnit: rec?.businessUnit ?? null,
    location,
    region: location ? regionsOf(ctx).regionOf(location) : null,
  }
}

/**
 * Owner names for team queues and fallbacks, one spelling each. `ACTION_OWNER_LABEL` names the
 * groups ("Recruiters"); these name the queue an item waits in.
 */
export const TEAM_OWNER = {
  recruiting: 'Recruiting team',
  hrbp: 'HR business partner',
  peopleOps: 'People operations',
  talent: 'Talent management',
  totalRewards: 'Total rewards',
  benefits: 'Benefits',
  finance: 'Finance',
  payroll: 'Payroll',
  mobility: 'Global mobility',
  trade: 'Trade compliance',
  it: 'IT',
  facilities: 'Facilities',
} as const

/**
 * A short, stable fingerprint of a roll-up's content (docs/ACTION-CENTER-AUDIT.md 4.1): the same
 * parts in any order give the same string, and a mark made under another fingerprint reopens. The
 * parts are IDs and counts, never names, so a relabel does not reopen anything.
 */
export function fingerprintOf(parts: Iterable<string | number>): string {
  const sorted = [...parts].map(String).sort()
  // FNV-1a over the joined parts, as 8 hex digits, with the count up front for readability.
  let h = 0x811c9dc5
  for (const ch of sorted.join('\u0001')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${sorted.length}:${h.toString(16).padStart(8, '0')}`
}
