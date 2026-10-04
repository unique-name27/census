/**
 * Facts for the detail panel and the exit simulation. Pure functions of the tree, the roster
 * (for leavers) and the reviews index.
 *
 * Team averages over fewer than MIN_GROUP people are null (shown "—", hidden to protect
 * anonymity). Exit counts are counts, not rates.
 */
import { type Employee, type ISODate, MIN_GROUP, type Potential } from '@/data/schema'
import { addMonths } from '@/lib/dates'
import { latestCycle, type ReviewIndex, reviewAt, tenureYears } from '@/lib/people'
import { mean } from '@/lib/stats'
import { WIDE_SPAN } from './flags'
import { chainTo, type OrgTree, subtreeOf } from './tree'

export interface RatingFact {
  rating: number
  cycle: string
  /** Latest potential on record (Annual cycles carry it), with its cycle. */
  potential: Potential | null
  potentialCycle: string | null
}

/** Latest rating on or before the as-of date, and the latest potential on record. */
export function ratingOf(idx: ReviewIndex, id: string, asOf: ISODate): RatingFact | null {
  const r = reviewAt(idx, id, asOf)
  if (!r) return null
  const all = idx.byEmployee.get(id) ?? []
  let potential: Potential | null = null
  let potentialCycle: string | null = null
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].cycleDate <= asOf && all[i].potential) {
      potential = all[i].potential ?? null
      potentialCycle = all[i].cycle
      break
    }
  }
  return { rating: r.rating, cycle: r.cycle, potential, potentialCycle }
}

export interface TeamStats {
  directs: number
  totalOrg: number
  /** Mean tenure of the whole org below (years), null under MIN_GROUP. */
  avgTenure: number | null
  /** Contractors and interns among direct reports. */
  contingentDirects: number
  /** Voluntary regretted exits of people who reported to this person, last 12 months. */
  regrettedExits12: number
  /** All exits of people who reported to this person, last 12 months. */
  exits12: number
  /** Open requisitions where this person is the hiring manager. */
  openReqs: number
  /** The records behind each number, for drill-down (same order as shown). */
  ids: {
    directs: string[]
    /** Everyone below the person. */
    org: string[]
    /** The people the average tenure is measured over; empty when it is hidden (n < 5). */
    tenure: string[]
    contingent: string[]
  }
  /** The leavers behind `exits12` and `regrettedExits12` (raw roster rows). */
  exits: Employee[]
  regretted: Employee[]
}

export function teamStats(
  tree: OrgTree,
  id: string,
  employees: readonly Employee[],
  openReqs = 0,
): TeamStats {
  const asOf = tree.asOf
  const from = addMonths(asOf, -12)
  const exits: Employee[] = []
  const regretted: Employee[] = []
  for (const e of employees) {
    if (e.managerId !== id || !e.terminationDate) continue
    if (e.terminationDate <= from || e.terminationDate > asOf) continue
    exits.push(e)
    if (e.terminationType === 'Voluntary' && e.regrettable === true) regretted.push(e)
  }
  const org = subtreeOf(tree, id).filter((x) => x !== id)
  const tenures = org.map((x) => tenureYears(tree.people.get(x)!, asOf))
  const kids = [...(tree.children.get(id) ?? [])]
  const contingent = kids.filter((k) => tree.people.get(k)?.employmentType !== 'Employee')
  const shown = org.length >= MIN_GROUP
  return {
    directs: kids.length,
    totalOrg: tree.total.get(id) ?? 0,
    avgTenure: shown ? mean(tenures) : null,
    contingentDirects: contingent.length,
    regrettedExits12: regretted.length,
    exits12: exits.length,
    openReqs,
    ids: { directs: kids, org, tenure: shown ? org : [], contingent },
    exits,
    regretted,
  }
}

/* ───────── exit simulation ───────── */

export interface BackfillCandidate {
  id: string
  rating: number
  potential: Potential | null
}

export interface ExitImpact {
  personId: string
  managerId: string | null
  directs: string[]
  orgSize: number
  /** Manager's direct reports before and after the reports roll up. */
  managerSpan: { before: number; after: number } | null
  /** The manager would end up at or above the wide-span line. */
  wideAfter: boolean
  /** Peers (the manager's other direct reports) who lose a teammate. */
  peers: number
  peerIds: string[]
  /** The manager's direct reports after the person's reports roll up. */
  managerTeamAfter: string[]
  /** The latest review cycle on or before the as-of date. */
  cycle: string | null
  /** Direct reports rated 4 or 5 in that cycle, best first. */
  backfills: BackfillCandidate[]
  /** Direct reports with no rating in that cycle. */
  unrated: number
  unratedIds: string[]
}

/** What happens if `id` leaves: their reports roll up to their manager. */
export function exitImpact(tree: OrgTree, id: string, reviews: ReviewIndex): ExitImpact {
  const managerId = tree.parent.get(id) ?? null
  const directs = [...(tree.children.get(id) ?? [])]
  const mgrTeam = managerId ? (tree.children.get(managerId) ?? []) : []
  const mgrDirects = mgrTeam.length
  const after = mgrDirects - 1 + directs.length
  const peerIds = mgrTeam.filter((x) => x !== id)
  const cyc = latestCycle(reviews, tree.asOf)
  const backfills: BackfillCandidate[] = []
  const unratedIds: string[] = []
  for (const d of directs) {
    const r = cyc ? (reviews.byEmployee.get(d) ?? []).find((x) => x.cycle === cyc.cycle) : undefined
    if (!r) {
      unratedIds.push(d)
      continue
    }
    if (r.rating >= 4) {
      backfills.push({
        id: d,
        rating: r.rating,
        potential: ratingOf(reviews, d, tree.asOf)?.potential ?? null,
      })
    }
  }
  const potRank = (p: Potential | null) => (p === 'High' ? 2 : p === 'Moderate' ? 1 : 0)
  backfills.sort(
    (a, b) =>
      b.rating - a.rating ||
      potRank(b.potential) - potRank(a.potential) ||
      (tree.total.get(b.id) ?? 0) - (tree.total.get(a.id) ?? 0),
  )
  return {
    personId: id,
    managerId,
    directs,
    orgSize: tree.total.get(id) ?? 0,
    managerSpan: managerId ? { before: mgrDirects, after } : null,
    wideAfter: !!managerId && after >= WIDE_SPAN,
    peers: peerIds.length,
    peerIds,
    managerTeamAfter: managerId ? [...peerIds, ...directs] : [],
    cycle: cyc?.cycle ?? null,
    backfills,
    unrated: unratedIds.length,
    unratedIds,
  }
}

/** Chain of names from the top to the person, for the breadcrumb. */
export function chainNames(tree: OrgTree, id: string): { id: string; name: string }[] {
  return chainTo(tree, id).map((x) => ({ id: x, name: tree.people.get(x)?.name ?? x }))
}
