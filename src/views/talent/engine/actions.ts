/**
 * Talent for the Scorecard and the Action center (docs/VIEWS.md, view contract):
 *
 *  - `talentSummary(ctx)`: critical roles covered, required training on time and key talent at
 *    risk, with the readout, from the memoized model (`talentModel`).
 *  - `talentActions(ctx)`:
 *    - overdue required training, one item per manager: their team's required assignments past
 *      due and not completed (employees active today, as Learning counts them);
 *    - high performers overdue for promotion, one item per person, for their HR business partner;
 *    - Critical roles without a ready-now successor, for Talent management.
 *
 * Wording: `what` states the facts, `note` is a polite ask. Pure: no React.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Employee, LearningRecord } from '@/data/schema'
import { drillSpec } from '@/drill/types'
import { daysBetween, formatDate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { firstName, hrbpOwner, ownerLookup } from '../../hrbp/engine/owners'
import type { ActionItem, ViewSummary } from '../../types'
import { talentModel } from './index'
import { uses } from './lineage'
import type { OverdueRow } from './promotion'
import type { RoleRow } from './succession'

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
export const TALENT_TEAM = 'Talent management'

const possessive = (name: string) => `${name}'s`
const short = (d: string) => formatDate(d).replace(/ \d{4}$/, '')

/* ───────── overdue required training, by manager ───────── */

function trainingItems(ctx: AnalyticsContext): ActionItem[] {
  const m = talentModel(ctx)
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
    const active = !!mgr && mgr.hireDate <= asOf && (!mgr.terminationDate || mgr.terminationDate > asOf)
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
      ...(active && mgr
        ? { ownerRole: 'manager' as const, ownerId: mgr.employeeId, ownerName: mgr.name }
        : { ownerRole: 'talent' as const, ownerId: null, ownerName: TALENT_TEAM }),
      due: oldest,
      severity: 'warning',
      what: `${plural(list.length, 'required course')} overdue for ${plural(people, 'person', 'people')} on ${team}, the oldest due ${short(oldest)}`,
      subject: mgr
        ? { kind: 'employees', id: mgr.employeeId, label: `${possessive(mgr.name)} team` }
        : { kind: 'none', label: 'No manager on record' },
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
      note: active
        ? 'Could you ask your team to complete their overdue required courses this week?'
        : 'Could we find who should follow up on these overdue required courses this week?',
      uses: fields,
    })
  }
  return out
}

/* ───────── high performers overdue for promotion ───────── */

function promotionItem(
  ctx: AnalyticsContext,
  row: OverdueRow,
  look: ReturnType<typeof ownerLookup>,
  fields: ActionItem['uses'],
  years: number,
): ActionItem | null {
  const e = ctx.org.byId.get(row.employeeId)
  if (!e) return null
  const since = row.lastPromotion
    ? `last promoted ${formatDate(row.lastPromotion)}`
    : `not promoted since joining on ${formatDate(e.hireDate)}`
  return {
    id: `talent:promotion-overdue:${row.employeeId}`,
    ownerRole: 'hrbp',
    ...hrbpOwner(e, look),
    due: null,
    severity: row.riskBand === 'High' ? 'warning' : 'info',
    what: `Rated ${row.ratings.replace(', ', ' and ')} in the last two annual cycles, ${since}${row.riskBand === 'High' ? ', high flight risk' : ''}`,
    subject: { kind: 'employees', id: row.employeeId, label: row.name },
    view: 'talent',
    tab: 'retention',
    drill: () =>
      drillSpec({
        kind: 'employees',
        title: `${row.name}: a high performer with no promotion in ${plural(years, 'year')}`,
        subtitle: `As of ${formatDate(ctx.asOf)}`,
        rows: [e],
        extra: {
          columns: [
            { key: 'ratings', label: 'Last two annual ratings' },
            { key: 'lastPromotion', label: 'Last promotion', format: 'date' },
            { key: 'riskBand', label: 'Flight-risk band' },
          ],
          values: () => ({ ratings: row.ratings, lastPromotion: row.lastPromotion, riskBand: row.riskBand }),
        },
      }),
    note: `Could we review ${possessive(firstName(row.name))} path to the next level with ${row.manager} before the next promotion cycle?`,
    uses: fields,
  }
}

/* ───────── critical roles without a ready-now successor ───────── */

function roleItem(r: RoleRow, m: ReturnType<typeof talentModel>): ActionItem {
  const none = r.successors === 0
  const highRisk = r.riskOfLoss === 'High' || (r.riskOfLoss == null && r.modelRisk === 'High')
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
  }
}

/** Open items for managers, HR business partners and Talent management, most serious first. */
export function talentActions(ctx: AnalyticsContext): ActionItem[] {
  const m = talentModel(ctx)
  const look = ownerLookup(ctx.all.employees, ctx.asOf)
  const promoFields = m.uses['talent-promotion-overdue']
  const items: ActionItem[] = [
    ...trainingItems(ctx),
    ...m.overdue.rows.flatMap(
      (r) => promotionItem(ctx, r, look, promoFields, m.settings.promotionYears) ?? [],
    ),
    ...m.succession.roles
      .filter((r) => r.criticality === 'Critical' && r.readyNow === 0)
      .map((r) => roleItem(r, m)),
  ]
  const rank = { critical: 0, warning: 1, info: 2, good: 3 } as const
  return items.sort(
    (x, y) =>
      rank[x.severity] - rank[y.severity] ||
      (x.due ?? '9999').localeCompare(y.due ?? '9999') ||
      x.id.localeCompare(y.id),
  )
}
