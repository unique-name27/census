/**
 * People stats for the Scorecard and the Action center (docs/VIEWS.md, view contract):
 *
 *  - `hrbpSummary(ctx)`: voluntary, regretted and first-year attrition, with the readout, from
 *    the memoized model (`hrbpModel`).
 *  - `hrbpActions(ctx)`:
 *    - stay conversations after a regretted-exit cluster: one item per manager with at least the
 *      cluster minimum of regretted exits in the last 12 months (the readout rule's setting),
 *      owned by that manager, or by the team's HR business partner when the manager has left;
 *      due the rule's "Stay conversations due within" days (30) after the latest regretted exit
 *      (after the team's latest exit in what a manager reads);
 *    - span outliers for the HR business partner: managers at or above the wide span or at or
 *      below the narrow span (the "Span outliers" settings). Single-report chains are left to the
 *      Org chart's list, so one manager never shows up twice.
 *
 * Wording: `what` states the facts, `note` is a polite ask; no leaver is named in either (the
 * drill lists them for HR). In Manager mode the item counts and lists every exit from the team in
 * the 12 months, never "regretted exits" or only the regretted leavers: regretted is HR's call
 * about named leavers (docs/ACTION-CENTER-AUDIT.md, open question 4; docs/ROLES-V2.md, Decisions
 * made, 8 Oct 2026). It is also raised there from the exits the regretted rule could count
 * (voluntary ones by default), with the same settings, and its severity and fingerprint follow
 * them: raised from regretted exits, whether a manager has the item, whether it is critical and
 * when a handled one comes back would each say which exits were regretted. Copy note is read by the manager, so the item carries `forOwner` in those
 * words in every mode ("6 exits from your team"). A stay conversation item is about a team, so its subject is a group (`kind: 'none'`) and About
 * never opens the manager; its fingerprint is the leavers, so a handled mark reopens when another
 * exit joins the cluster. Every item carries its place for the HRBP lenses. Pure: no React.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Employee } from '@/data/schema'
import { addDays, dateWords } from '@/lib/dates'
import type { ActionItem, ViewSummary } from '../../types'
import { count, type Prep, possessive } from './base'
import { leaversSpec, managersSpec } from './drill'
import { hrbpModel } from './index'
import { EXITS, MANAGER, ORG } from './lineage'
import type { ManagerRow } from './org'
import { firstName, hrbpOwner, ownerLookup } from './owners'
import { fingerprintOf, placeOf } from './places'
import { exitsIn } from './population'

/** The three measures the Scorecard judges People stats on, in order. */
export const SUMMARY_KPIS = ['voluntary', 'regretted', 'first-year'] as const

export function hrbpSummary(ctx: AnalyticsContext): ViewSummary {
  const m = hrbpModel(ctx)
  return {
    kpis: SUMMARY_KPIS.flatMap((id) => m.kpi.kpis.filter((k) => k.id === id)),
    findings: m.findings,
  }
}

/** Exits in the last 12 months (only the regretted ones with `regretted`), by the manager they reported to. */
function exitsByManager(p: Prep, regretted: boolean): Map<string, Employee[]> {
  const out = new Map<string, Employee[]>()
  for (const e of exitsIn(p.emps, p.t12, p.counts)) {
    if ((regretted && !p.isRegretted(e)) || !e.managerId) continue
    const arr = out.get(e.managerId)
    if (arr) arr.push(e)
    else out.set(e.managerId, [e])
  }
  return out
}

const latestOf = (list: readonly Employee[]): string =>
  list.map((e) => e.terminationDate as string).sort()[list.length - 1]

function stayItems(p: Prep, look: ReturnType<typeof ownerLookup>): ActionItem[] {
  if (!p.regrettedReady) return []
  const { minExits, criticalExits, stayWithinDays } = p.set.regrettedCluster
  // A manager reads "exits": whether an exit was regretted is HR's call about named leavers. So
  // whatever a manager reads (Manager mode, and the note sent to them) counts and lists every exit
  // from the team, never only the regretted ones (docs/ROLES-V2.md, Decisions made, 8 Oct 2026).
  const forManager = p.ctx.access.mode === 'manager'
  const everyExit = exitsByManager(p, false)
  // Raised from regretted exits, the item's being there (2 by default), its severity (3) and its
  // fingerprint (the regretted leavers, which reopens a handled item only when a regretted one
  // leaves) would each tell a manager how many of the exits, and which, were regretted. So in
  // Manager mode it is raised from the exits the rule could count (voluntary ones, or every exit
  // when any flagged exit counts), with the same settings: every team HR's rule flags is flagged,
  // and nothing about it reads the regrettable flag.
  const couldCount =
    p.set.regretted === 'anyFlagged' ? () => true : (e: Employee) => e.terminationType === 'Voluntary'
  const raising = forManager
    ? new Map([...everyExit].map(([id, list]) => [id, list.filter(couldCount)] as const))
    : exitsByManager(p, true)
  const out: ActionItem[] = []
  for (const [managerId, raised] of raising) {
    if (raised.length < minExits) continue
    const mgr = p.ctx.org.byId.get(managerId)
    const name = p.name(managerId)
    const active = !!mgr && (!mgr.terminationDate || mgr.terminationDate > p.asOf) && mgr.hireDate <= p.asOf
    // HR's list is the regretted leavers (what raised it); a manager's, every exit from the team.
    const exits = everyExit.get(managerId) ?? raised
    const list = forManager ? exits : raised
    const latest = latestOf(list)
    // What a manager reads is dated from the team's latest exit, so no date points at a regretted one.
    const managerDue = addDays(latestOf(exits), stayWithinDays)
    const team = `${possessive(name)} team`
    const owner = active
      ? { ownerRole: 'manager' as const, ownerId: managerId, ownerName: name }
      : { ownerRole: 'hrbp' as const, ...hrbpOwner(mgr, look) }
    out.push({
      id: `hrbp:stay-conversations:${managerId}`,
      ...owner,
      due: forManager ? managerDue : addDays(latest, stayWithinDays),
      severity: raised.length >= criticalExits ? 'critical' : 'warning',
      what: forManager
        ? `${count(list.length, 'exit', 'exits')} from ${team} in the last 12 months, the latest on ${dateWords(latest, p.asOf)}`
        : `${count(list.length, 'regretted exit', 'regretted exits')} from ${team} in the last 12 months, the latest on ${dateWords(latest, p.asOf)}`,
      // The note goes to the manager: every exit (never "regretted", never the regretted count), and "your team".
      ...(active
        ? {
            forOwner: {
              what: `${count(exits.length, 'exit', 'exits')} from your team in the last 12 months, the latest on ${dateWords(latestOf(exits), p.asOf)}`,
              subject: 'Your team',
              due: managerDue,
            },
          }
        : {}),
      // A team, not the manager: About opens the leavers, never the manager's card.
      subject: { kind: 'none', label: team },
      view: 'hrbp',
      tab: 'attrition',
      drill: () =>
        leaversSpec(p, `${forManager ? 'Leavers' : 'Regretted leavers'} from ${team}, last 12 months`, list, {
          when: p.t12.label,
        }),
      note: active
        ? 'Could you hold stay conversations with the rest of your team this month? Your HR business partner can help you prepare.'
        : `Could you arrange stay conversations this month with the rest of the team that ${name} led?`,
      uses: forManager ? p.uses(EXITS, MANAGER) : p.uses(p.lin.regrettedExits, MANAGER),
      // The leavers it lists, so a handled mark reopens when the cluster grows (in Manager mode,
      // when anyone else leaves the team).
      fingerprint: fingerprintOf(list.map((e) => e.employeeId)),
      closesWhen: 'Mark handled once the stay conversations are held; no record in the data closes it',
      place: placeOf(p.ctx, mgr),
    })
  }
  return out
}

function spanItems(
  p: Prep,
  managers: readonly ManagerRow[],
  chains: ReadonlySet<string>,
  look: ReturnType<typeof ownerLookup>,
): ActionItem[] {
  const { wide, narrow } = p.set.spanOutliers
  const out: ActionItem[] = []
  for (const m of managers) {
    const isWide = m.directs >= wide
    const isNarrow = m.directs <= narrow && !chains.has(m.managerId)
    if (!isWide && !isNarrow) continue
    const who = firstName(m.name)
    out.push({
      id: `hrbp:span:${m.managerId}`,
      ownerRole: 'hrbp',
      ...hrbpOwner(m.employee, look),
      due: null,
      severity: isWide ? 'warning' : 'info',
      what: isWide
        ? `${m.name} has ${count(m.directs, 'direct report', 'direct reports')}, at or above the wide span of ${wide}`
        : `${m.name} has ${m.directs === 1 ? 'a single direct report' : `${m.directs} direct reports`}, at or below the narrow span of ${narrow}`,
      subject: { kind: 'employees', id: m.managerId, label: m.name },
      view: 'hrbp',
      tab: 'org',
      drill: () => managersSpec(p, `${m.name}: ${count(m.directs, 'direct report', 'direct reports')}`, [m]),
      note: isWide
        ? `Could we review with ${who} whether the team would benefit from a team lead or a split?`
        : `Could we review with ${who} whether this layer is still needed or could be merged?`,
      uses: p.uses(ORG),
      fingerprint: `${m.directs}`,
      closesWhen: 'A span between the narrow and wide spans',
      place: placeOf(p.ctx, m.employee),
    })
  }
  return out
}

/** Open items for HR business partners and managers, most serious first. */
export function hrbpActions(ctx: AnalyticsContext): ActionItem[] {
  const m = hrbpModel(ctx)
  const p = m.prep
  if (!p.emps.length) return []
  const look = ownerLookup(ctx.all.employees, p.asOf)
  const chains = new Set(m.org.chains.map((c) => c.managerId))
  const rank = { critical: 0, warning: 1, info: 2, good: 3 } as const
  return [...stayItems(p, look), ...spanItems(p, m.org.managers, chains, look)].sort(
    (x, y) =>
      rank[x.severity] - rank[y.severity] ||
      (x.due ?? '9999').localeCompare(y.due ?? '9999') ||
      x.id.localeCompare(y.id),
  )
}
