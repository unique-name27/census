/**
 * People stats for the Scorecard and the Action center (docs/VIEWS.md, view contract):
 *
 *  - `hrbpSummary(ctx)`: voluntary, regretted and first-year attrition, with the readout, from
 *    the memoized model (`hrbpModel`).
 *  - `hrbpActions(ctx)`:
 *    - stay conversations after a regretted-exit cluster: one item per manager with at least the
 *      cluster minimum of regretted exits in the last 12 months (the readout rule's setting),
 *      owned by that manager, or by the team's HR business partner when the manager has left;
 *      due the rule's "Stay conversations due within" days (30) after the latest exit;
 *    - span outliers for the HR business partner: managers at or above the wide span or at or
 *      below the narrow span (the "Span outliers" settings). Single-report chains are left to the
 *      Org chart's list, so one manager never shows up twice.
 *
 * Wording: `what` states the facts, `note` is a polite ask; no leaver is named in either (the
 * drill lists them for HR). In Manager mode the item says "exits", never "regretted exits":
 * regretted is HR's call about named leavers (docs/ACTION-CENTER-AUDIT.md, open question 4).
 * A stay conversation item is about a team, so its subject is a group (`kind: 'none'`) and About
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
import { MANAGER, ORG } from './lineage'
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

/** Regretted exits in the last 12 months, by the manager they reported to. */
function regrettedByManager(p: Prep): Map<string, Employee[]> {
  const out = new Map<string, Employee[]>()
  for (const e of exitsIn(p.emps, p.t12, p.counts)) {
    if (!p.isRegretted(e) || !e.managerId) continue
    const arr = out.get(e.managerId)
    if (arr) arr.push(e)
    else out.set(e.managerId, [e])
  }
  return out
}

function stayItems(p: Prep, look: ReturnType<typeof ownerLookup>): ActionItem[] {
  if (!p.regrettedReady) return []
  const { minExits, criticalExits, stayWithinDays } = p.set.regrettedCluster
  // A manager reads "exits": whether an exit was regretted is HR's call about named leavers.
  const forManager = p.ctx.access.mode === 'manager'
  const [one, many] = forManager ? ['exit', 'exits'] : ['regretted exit', 'regretted exits']
  const out: ActionItem[] = []
  for (const [managerId, list] of regrettedByManager(p)) {
    if (list.length < minExits) continue
    const mgr = p.ctx.org.byId.get(managerId)
    const name = p.name(managerId)
    const active = !!mgr && (!mgr.terminationDate || mgr.terminationDate > p.asOf) && mgr.hireDate <= p.asOf
    const latest = list.map((e) => e.terminationDate as string).sort()[list.length - 1]
    const team = `${possessive(name)} team`
    const owner = active
      ? { ownerRole: 'manager' as const, ownerId: managerId, ownerName: name }
      : { ownerRole: 'hrbp' as const, ...hrbpOwner(mgr, look) }
    out.push({
      id: `hrbp:stay-conversations:${managerId}`,
      ...owner,
      due: addDays(latest, stayWithinDays),
      severity: list.length >= criticalExits ? 'critical' : 'warning',
      what: `${count(list.length, one, many)} from ${team} in the last 12 months, the latest on ${dateWords(latest, p.asOf)}`,
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
      uses: p.uses(p.lin.regrettedExits, MANAGER),
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
