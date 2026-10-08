/**
 * Competing offers, revised offers and where offers sat in the range (docs/ANALYSES.md, 3.6.6-7):
 * acceptance in four fixed groups (competing offer or not recorded, revised or not), and the median
 * position in range of declined and accepted offers, for the company and each location. A blank
 * Competing offer reads as none recorded and a blank Offer revised as not revised. Position in
 * range is a ratio (0 at the minimum, 1 at the maximum), never an amount. Pure.
 */
import { median } from '@/lib/stats'
import { declineCount, type Offer } from './offers'

export const COMPETING_GROUPS = [
  'Competing offer, revised',
  'Competing offer, not revised',
  'No competing offer recorded, revised',
  'No competing offer recorded, not revised',
] as const
export type CompetingGroup = (typeof COMPETING_GROUPS)[number]

export const competingGroupOf = (o: Offer): CompetingGroup =>
  o.competing === true
    ? o.revised === true
      ? 'Competing offer, revised'
      : 'Competing offer, not revised'
    : o.revised === true
      ? 'No competing offer recorded, revised'
      : 'No competing offer recorded, not revised'

export interface AcceptanceRow {
  group: CompetingGroup
  resolved: number
  /** Null with the rate under the minimum. */
  accepted: number | null
  acceptance: number | null
  offers: Offer[]
}

export function competingRows(offers: readonly Offer[], min: number): AcceptanceRow[] {
  return COMPETING_GROUPS.map((group) => {
    const list = offers.filter((o) => competingGroupOf(o) === group)
    const c = declineCount(list)
    const show = c.resolved >= min
    return {
      group,
      resolved: c.resolved,
      accepted: show ? c.accepted : null,
      acceptance: show && c.rate != null ? 1 - c.rate : null,
      offers: show ? list : [],
    }
  })
}

/** Acceptance over offers that pass `keep`; null under the minimum. */
export function acceptanceOf(
  offers: readonly Offer[],
  min: number,
  keep: (o: Offer) => boolean = () => true,
) {
  const list = offers.filter(keep)
  const c = declineCount(list)
  return {
    offers: list,
    resolved: c.resolved,
    accepted: c.accepted,
    acceptance: c.resolved >= min && c.rate != null ? 1 - c.rate : null,
  }
}

/* ───────── position in range ───────── */

export interface RangeRow {
  /** "Company" first, then each location. */
  label: string
  kind: 'company' | 'location'
  declined: number | null
  accepted: number | null
  declinedN: number
  acceptedN: number
  /** accepted − declined, when both show. */
  gap: number | null
  declinedOffers: Offer[]
  acceptedOffers: Offer[]
}

function rangeRow(label: string, kind: RangeRow['kind'], offers: readonly Offer[], min: number): RangeRow {
  const withPos = offers.filter((o) => o.position != null)
  const dec = withPos.filter((o) => o.declined)
  const acc = withPos.filter((o) => !o.declined)
  const med = (list: readonly Offer[]) =>
    list.length >= min ? median(list.map((o) => o.position as number)) : null
  const d = med(dec)
  const a = med(acc)
  return {
    label,
    kind,
    declined: d,
    accepted: a,
    declinedN: dec.length,
    acceptedN: acc.length,
    gap: d != null && a != null ? a - d : null,
    declinedOffers: d != null ? dec : [],
    acceptedOffers: a != null ? acc : [],
  }
}

/**
 * The company's medians first, then each location of the scope's offers with a position, by the
 * gap (largest first; rows with one outcome only after them). Locations with no outcome shown
 * are left out.
 */
export function rangeRows(scope: readonly Offer[], company: readonly Offer[], min: number): RangeRow[] {
  const byLoc = new Map<string, Offer[]>()
  for (const o of scope) {
    if (o.position == null || !o.location) continue
    const arr = byLoc.get(o.location)
    if (arr) arr.push(o)
    else byLoc.set(o.location, [o])
  }
  const locations = [...byLoc]
    .map(([loc, list]) => rangeRow(loc, 'location', list, min))
    .filter((r) => r.declined != null || r.accepted != null)
    .sort(
      (a, b) =>
        Number(b.gap != null) - Number(a.gap != null) ||
        (b.gap ?? 0) - (a.gap ?? 0) ||
        a.label.localeCompare(b.label),
    )
  const head = rangeRow('Company', 'company', company, min)
  return head.declined != null || head.accepted != null ? [head, ...locations] : locations
}
