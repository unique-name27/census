/**
 * Talent for the Scorecard and the Action center (docs/VIEWS.md, view contract):
 *
 *  - `talentSummary(ctx)`: critical roles covered, required training on time and key talent at
 *    risk, with the readout, from the memoized model (`talentModel`).
 *  - `talentActions(ctx)` (docs/ROLES-V2.md 5.14; docs/ACTION-CENTER-AUDIT.md 4.2 and 4.3):
 *    - overdue required training, one item per manager: their team's required assignments past
 *      due and not completed (employees active today, as Learning counts them). Listed for the
 *      manager; HR and Talent management read the course items below instead;
 *    - required courses below the on-time target, one item per course, for Talent management;
 *    - ratings missing in the latest cycle, one item per manager;
 *    - high performers overdue for promotion, one item per business unit, for its HR business
 *      partner;
 *    - Critical roles without a ready-now successor, for Talent management.
 *
 * A team item is about a group, so its subject is `kind: 'none'` and About never opens the
 * manager. Roll-ups carry a `fingerprint` of who is in them, so a handled mark reopens when that
 * changes. Item text never holds a flight-risk model score: a role's risk of loss is the one
 * recorded in the succession plan. Dates keep their year outside the as-of year. Wording: `what`
 * states the facts, `note` is a polite ask. Pure: no React.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Employee, ISODate, LearningRecord, Review } from '@/data/schema'
import { drillSpec } from '@/drill/types'
import { addDays, dateWords, daysBetween, formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { isActiveAt, isEmployee } from '@/lib/people'
import { targetStatus } from '@/metrics/api'
import { hrbpOwner, ownerLookup } from '../../hrbp/engine/owners'
import { fingerprintOf, placeOf, TEAM_OWNER } from '../../hrbp/engine/places'
import type { ActionItem, ViewSummary } from '../../types'
import type { Cycle } from './base'
import { talentModel } from './index'
import { ACTIVE, RATING, uses } from './lineage'
import type { OverdueRow } from './promotion'
import type { RoleRow } from './succession'
import { targetWords } from './wording'

/** The three measures the Scorecard judges Talent on, in order. */
export const SUMMARY_KPIS = [
  'talent-succession-coverage',
  'talent-training-on-time',
  'talent-key-talent-risk',
] as const

export function talentSummary(ctx: AnalyticsContext): ViewSummary {
  const m = talentModel(ctx)
  return {
    kpis: SUMMARY_KPIS.flatMap((id) => m.kpis.filter((k) => k.id === id)),
    findings: m.findings,
  }
}

/** The owner of items with no manager or role owner on record. */
export const TALENT_TEAM = TEAM_OWNER.talent

const possessive = (name: string) => `${name}'s`
type Model = ReturnType<typeof talentModel>

const activeAt = (e: Employee | undefined, d: ISODate): e is Employee =>
  !!e && e.hireDate <= d && (!e.terminationDate || e.terminationDate > d)

/** A manager's team as an item owner: the manager while they are here, else Talent management. */
function teamOwner(mgr: Employee | undefined, asOf: ISODate) {
  return activeAt(mgr, asOf)
    ? { ownerRole: 'manager' as const, ownerId: mgr.employeeId, ownerName: mgr.name }
    : { ownerRole: 'talent' as const, ownerId: null, ownerName: TALENT_TEAM }
}

/* ───────── overdue required training, by manager ───────── */

function trainingItems(ctx: AnalyticsContext, m: Model): ActionItem[] {
  const { asOf } = m
  const byManager = new Map<string, { l: LearningRecord; e: Employee }[]>()
  for (const p of m.learning.records.pastDue) {
    if (!p.overdue) continue
    const key = p.e.managerId ?? ''
    const arr = byManager.get(key)
    if (arr) arr.push(p)
    else byManager.set(key, [p])
  }
  const fields = uses(m.uses['talent-overdue-assignments'], ['employees.managerId'])
  const out: ActionItem[] = []
  for (const [managerId, list] of byManager) {
    const mgr = managerId ? ctx.org.byId.get(managerId) : undefined
    const owner = teamOwner(mgr, asOf)
    const people = new Set(list.map((p) => p.e.employeeId)).size
    const oldest = list.map((p) => p.l.dueDate as string).sort()[0]
    const team = mgr ? `${possessive(mgr.name)} team` : 'people with no manager on record'
    const rows = list
      .map((p) => p.l)
      .sort(
        (a, b) =>
          (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.employeeId.localeCompare(b.employeeId),
      )
    out.push({
      id: `talent:training-overdue:${managerId || 'none'}`,
      ...owner,
      due: oldest,
      severity: 'warning',
      what: `${plural(list.length, 'required course')} overdue for ${plural(people, 'person', 'people')} on ${team}, the oldest due ${dateWords(oldest, asOf)}`,
      // A team, not the manager: About opens the overdue assignments, never the manager's card.
      subject: { kind: 'none', label: mgr ? `${possessive(mgr.name)} team` : 'No manager on record' },
      view: 'talent',
      tab: 'learning',
      drill: () =>
        drillSpec({
          kind: 'learning',
          title: `Overdue required training, ${team}`,
          subtitle: `As of ${formatDate(asOf)} · ${ctx.scopeLabel}`,
          rows,
          note: 'Required assignments past their due date and not completed, for employees active today.',
          extra: {
            columns: [{ key: 'daysOverdue', label: 'Days overdue', format: 'days' }],
            values: (l: LearningRecord) => ({ daysOverdue: l.dueDate ? daysBetween(l.dueDate, asOf) : null }),
          },
        }),
      note:
        owner.ownerRole === 'manager'
          ? 'Could you ask your team to complete their overdue required courses this week?'
          : 'Could we find who should follow up on these overdue required courses this week?',
      uses: fields,
      fingerprint: fingerprintOf(rows.map((l) => `${l.employeeId}|${l.course}|${l.dueDate}`)),
      closesWhen: 'A completed date on each overdue assignment',
      place: placeOf(ctx, mgr),
    })
  }
  return out
}

/* ───────── required courses below their on-time target ───────── */

/**
 * A required course whose on-time share is under the target of `talent.learning.requiredOnTime`,
 * with 5 or more assignments due in the period (docs/ROLES-V2.md 5.14): one item per course for
 * Talent management, in place of a training item per manager.
 */
function courseItems(ctx: AnalyticsContext, m: Model): ActionItem[] {
  const target = m.settings.onTimeTarget
  if (!target) return []
  const fields = uses(m.uses['talent-training-on-time-by-course'], m.uses['talent-overdue-assignments'])
  const out: ActionItem[] = []
  for (const c of m.learning.byCourse) {
    if (c.onTimeRate == null || c.due < m.settings.minGroup || targetStatus(c.onTimeRate, target) === 'met')
      continue
    const overdue = m.learning.records.pastDue.filter((p) => p.overdue && p.l.course === c.course)
    const dueRows = m.learning.records.due.filter((l) => l.course === c.course)
    out.push({
      id: `talent:course-below-target:${c.course}`,
      kind: 'Required course below target',
      ownerRole: 'talent',
      ownerId: null,
      ownerName: TALENT_TEAM,
      due: null,
      severity: 'warning',
      what: `${c.course}: ${fmt(c.onTimeRate, 'pct0')} completed on time against a target of ${targetWords(target)}, ${plural(overdue.length, 'assignment')} overdue`,
      subject: { kind: 'none', label: c.course },
      view: 'talent',
      tab: 'learning',
      drill: () =>
        drillSpec({
          kind: 'learning',
          title: overdue.length ? `${c.course}: overdue assignments` : `${c.course}: assignments due`,
          subtitle: overdue.length
            ? `As of ${formatDate(m.asOf)} · ${ctx.scopeLabel}`
            : `${ctx.window.label} · ${ctx.scopeLabel}`,
          rows: overdue.length ? overdue.map((p) => p.l) : dueRows,
          note: `${fmt(c.onTime, 'int')} of ${fmt(c.due, 'int')} assignments due ${ctx.window.label.toLowerCase()} were completed on time.`,
        }),
      note: `Could we review the deadlines and the course plan for ${c.course} with its owner this month?`,
      uses: fields,
      fingerprint: `${c.onTime}/${c.due}/${overdue.length}`,
      closesWhen: 'The on-time share reaching the target',
      place: { businessUnit: null, region: null, location: null },
    })
  }
  return out
}

/* ───────── ratings missing in the latest cycle ───────── */

/** The latest cycle whose date is at least the grace days before the as-of date. */
function dueCycle(m: Model, ctx: AnalyticsContext): Cycle | null {
  const last = addDays(m.asOf, -m.settings.reviewMissing.graceDays)
  const cycles = [...new Map(ctx.all.reviews.map((r) => [r.cycle, r.cycleDate])).entries()]
    .map(([cycle, cycleDate]) => ({ cycle, cycleDate }))
    .filter((c) => c.cycleDate <= last)
    .sort((a, b) => a.cycleDate.localeCompare(b.cycleDate) || a.cycle.localeCompare(b.cycle))
  return cycles.at(-1) ?? null
}

/**
 * People active on the cycle date (and still here), hired the eligible days or more before it,
 * with no review in the cycle, grouped by their manager (docs/ROLES-V2.md 5.14). The fingerprint
 * is the unrated IDs.
 */
function reviewItems(ctx: AnalyticsContext, m: Model): ActionItem[] {
  if (!m.has.reviews) return []
  const cycle = dueCycle(m, ctx)
  if (!cycle) return []
  const { eligibleAfterDays, criticalDays } = m.settings.reviewMissing
  const hiredBy = addDays(cycle.cycleDate, -eligibleAfterDays)
  const rated = new Set(
    ctx.all.reviews.filter((r: Review) => r.cycle === cycle.cycle).map((r) => r.employeeId),
  )
  const byManager = new Map<string, Employee[]>()
  for (const e of ctx.data.employees) {
    if (!isEmployee(e) || rated.has(e.employeeId) || e.hireDate > hiredBy) continue
    if (!isActiveAt(e, cycle.cycleDate) || !isActiveAt(e, m.asOf)) continue
    const k = e.managerId ?? ''
    const list = byManager.get(k)
    if (list) list.push(e)
    else byManager.set(k, [e])
  }
  const late = daysBetween(cycle.cycleDate, m.asOf)
  const fields = uses(RATING, ACTIVE, ['employees.managerId'])
  const out: ActionItem[] = []
  for (const [managerId, people] of byManager) {
    const mgr = managerId ? ctx.org.byId.get(managerId) : undefined
    const owner = teamOwner(mgr, m.asOf)
    const team = mgr ? `${possessive(mgr.name)} team` : 'no manager on record'
    const sorted = people.slice().sort((a, b) => a.name.localeCompare(b.name))
    const n = people.length
    out.push({
      id: `talent:review-missing:${managerId || 'none'}`,
      kind: 'Ratings missing',
      ...owner,
      due: addDays(cycle.cycleDate, m.settings.reviewMissing.graceDays),
      severity: late >= criticalDays ? 'critical' : 'warning',
      what: `${plural(n, 'person', 'people')} on ${team} ${n === 1 ? 'has' : 'have'} no rating in the ${cycle.cycle} cycle`,
      subject: { kind: 'none', label: mgr ? `${possessive(mgr.name)} team` : 'No manager on record' },
      view: 'talent',
      tab: 'performance',
      drill: () =>
        drillSpec({
          kind: 'employees',
          title: `No rating in the ${cycle.cycle} cycle, ${team}`,
          subtitle: `As of ${formatDate(m.asOf)} · ${ctx.scopeLabel}`,
          rows: sorted,
          note: `Employees active on the cycle date (${formatDate(cycle.cycleDate)}) and hired at least ${plural(eligibleAfterDays, 'day')} before it, with no review in the cycle.`,
        }),
      note:
        owner.ownerRole === 'manager'
          ? 'Could you complete these ratings or let me know when they will be in?'
          : 'Could we find who should complete these ratings, now that the manager is not on record?',
      uses: fields,
      fingerprint: fingerprintOf(people.map((e) => e.employeeId)),
      closesWhen: `A review in the ${cycle.cycle} cycle for each person`,
      place: placeOf(ctx, mgr),
    })
  }
  return out
}

/* ───────── high performers overdue for promotion, by business unit ───────── */

/**
 * One item per business unit for its HR business partner (the HRBP most of the unit's people
 * name), in place of one per person. It names no flight risk: the list is for the promotion
 * cycle, and a model score about a named person stays out of item text.
 */
function promotionItems(ctx: AnalyticsContext, m: Model, look: ReturnType<typeof ownerLookup>): ActionItem[] {
  const years = m.settings.promotionYears
  const byUnit = new Map<string, { row: OverdueRow; e: Employee }[]>()
  for (const row of m.overdue.rows) {
    const e = ctx.org.byId.get(row.employeeId)
    if (!e) continue
    const bu = e.businessUnit || 'Unknown'
    const list = byUnit.get(bu)
    if (list) list.push({ row, e })
    else byUnit.set(bu, [{ row, e }])
  }
  const fields = m.uses['talent-promotion-overdue']
  const out: ActionItem[] = []
  for (const [bu, list] of byUnit) {
    const n = list.length
    const rows = list.map((x) => x.e).sort((a, b) => a.name.localeCompare(b.name))
    const facts = new Map(list.map((x) => [x.e.employeeId, x.row]))
    out.push({
      id: `talent:promotion-overdue:${bu}`,
      ownerRole: 'hrbp',
      ...hrbpOwner(
        unitHrbp(
          ctx,
          bu,
          list.map((x) => x.e),
        ),
        look,
      ),
      due: null,
      severity: 'info',
      what: `${plural(n, 'high performer')} in ${bu} ${n === 1 ? 'has' : 'have'} had no promotion in ${plural(years, 'year')}`,
      subject: { kind: 'none', label: `${bu} high performers` },
      view: 'talent',
      tab: 'retention',
      drill: () =>
        drillSpec({
          kind: 'employees',
          title: `High performers with no promotion in ${plural(years, 'year')}, ${bu}`,
          subtitle: `As of ${formatDate(ctx.asOf)} · ${ctx.scopeLabel}`,
          rows,
          note: 'Rated high in the last two annual cycles, with no promotion in the years set on the metric.',
          extra: {
            columns: [
              { key: 'ratings', label: 'Last two annual ratings' },
              { key: 'lastPromotion', label: 'Last promotion', format: 'date' },
            ],
            values: (e: Employee) => {
              const r = facts.get(e.employeeId)
              return { ratings: r?.ratings ?? null, lastPromotion: r?.lastPromotion ?? null }
            },
          },
        }),
      note: `Could we review these paths to the next level with the ${bu} leaders before the next promotion cycle?`,
      uses: fields,
      fingerprint: fingerprintOf(list.map((x) => x.e.employeeId)),
      closesWhen: 'A promotion in Job changes, or a lower rating, for each person',
      place: { businessUnit: bu, region: null, location: null },
    })
  }
  return out
}

/** The unit's HR business partner: the one most of its active people name, else the listed people's. */
function unitHrbp(ctx: AnalyticsContext, bu: string, fallback: readonly Employee[]): Pick<Employee, 'hrbp'> {
  const count = new Map<string, number>()
  const add = (e: Employee) => {
    const h = e.hrbp?.trim()
    if (h) count.set(h, (count.get(h) ?? 0) + 1)
  }
  for (const e of ctx.all.employees) if (e.businessUnit === bu && isActiveAt(e, ctx.asOf)) add(e)
  if (!count.size) for (const e of fallback) add(e)
  const best = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return { hrbp: best?.[0] ?? null }
}

/* ───────── critical roles without a ready-now successor ───────── */

function roleItem(ctx: AnalyticsContext, r: RoleRow, m: Model): ActionItem {
  const none = r.successors === 0
  // The risk of loss recorded in the plan only: a model score never reaches item text.
  const highRisk = r.riskOfLoss === 'High'
  const label = r.roleTitle === r.roleId ? r.roleId : `${r.roleId} ${r.roleTitle}`
  return {
    id: `talent:critical-role:${r.roleId}`,
    ownerRole: 'talent',
    ownerId: null,
    ownerName: TALENT_TEAM,
    due: null,
    severity: none || highRisk ? 'critical' : 'warning',
    what: none
      ? `No successor named for this Critical role${highRisk ? ', and the incumbent is at high risk of loss' : ''}`
      : `No ready-now successor for this Critical role: ${r.readiness}${highRisk ? '; the incumbent is at high risk of loss' : ''}`,
    subject: { kind: 'succession', id: r.roleId, label },
    view: 'talent',
    tab: 'succession',
    drill: m.drill.roles([r], `${label}: succession plan`),
    note: `Could we review the bench for ${r.roleTitle} at the next talent review and agree who could be ready now?`,
    uses: m.uses['talent-critical-roles'],
    fingerprint: `${r.successors}/${r.readyNow}/${r.ready1to2}/${r.ready3plus}/${r.riskOfLoss ?? ''}`,
    closesWhen: 'A successor rated Ready now in the succession plan',
    place: placeOf(ctx, ctx.org.byId.get(r.incumbentId)),
  }
}

/** Open items for managers, HR business partners and Talent management, most serious first. */
export function talentActions(ctx: AnalyticsContext): ActionItem[] {
  const m = talentModel(ctx)
  const look = ownerLookup(ctx.all.employees, ctx.asOf)
  const items: ActionItem[] = [
    ...trainingItems(ctx, m),
    ...courseItems(ctx, m),
    ...reviewItems(ctx, m),
    ...promotionItems(ctx, m, look),
    ...m.succession.roles
      .filter((r) => r.criticality === 'Critical' && r.readyNow === 0)
      .map((r) => roleItem(ctx, r, m)),
  ]
  const rank = { critical: 0, warning: 1, info: 2, good: 3 } as const
  return items.sort(
    (x, y) =>
      rank[x.severity] - rank[y.severity] ||
      (x.due ?? '9999').localeCompare(y.due ?? '9999') ||
      x.id.localeCompare(y.id),
  )
}
