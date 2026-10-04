/**
 * HR ops items for the Action center (`ViewDef.actions`): cases open past their resolution
 * target (owned by the case's team, or its agent), HR transactions open past their due date, and
 * returns from leave in the look-ahead whose systems are not ready (Atlas LV-03).
 *
 * Wording follows the recruiting tone rules: `what` states the open state in plain words, the
 * note is a polite ask, never a nagging verb. An employee relations case never names a person
 * (no case ID, no agent, no drill). A return from leave never shows the leave reason.
 * Item ids are stable across recomputes ('services:<kind>:<record id>') so Mark handled and
 * Snooze stick.
 */
import type { AnalyticsContext } from '@/data/context'
import { drillSpec } from '@/drill/types'
import { daysBetween, formatDate, iso, ms } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ActionItem, ActionOwnerRole } from '@/views/types'
import { isRowPrivate } from './cases'
import { asOfSub, oneCaseDrill } from './drills'
import type { CaseFact, TxFact } from './facts'
import { computeCached, type ServicesModel } from './index'
import { leaveDrill } from './leaveDrills'
import { LEAVE, lineage, union } from './lineage'
import { duration } from './util'

/** The Action center group that owns a case team's queue. */
const TEAM_ROLE: Readonly<Record<string, ActionOwnerRole>> = {
  Payroll: 'payroll',
  Benefits: 'total-rewards',
  'Total rewards': 'total-rewards',
  'Global mobility': 'immigration',
}

/** Transactions whose deadline Payroll owns. */
const PAYROLL_TX = new Set(['Termination', 'Compensation change'])

const dateWords = (d: string) => formatDate(d)

/** When a case's resolution target runs out: opened plus its target in hours. */
const caseDue = (f: CaseFact): string | null =>
  f.resolutionTarget == null ? null : iso(ms(f.openedAt) + f.resolutionTarget * 3_600_000)

function targetWords(hours: number): string {
  const d = duration(hours)
  return fmt(d.value, d.format)
}

/** Open cases past their resolution target, one item per case. */
export function caseActions(m: ServicesModel): ActionItem[] {
  const L = lineage(m.caseCols)
  const uses = union(L.open, L.resolutionTarget, L.team)
  const critical = m.settings.agedBacklog.days
  const out: ActionItem[] = []
  for (const f of m.cases) {
    if (!f.open || f.resolutionMet !== false || f.resolutionTarget == null) continue
    const er = isRowPrivate(f)
    const age = f.ageDays ?? 0
    const past = Math.max(0, Math.round(age - f.resolutionTarget / 24))
    const waiting = f.status === 'Waiting on third party'
    out.push({
      id: `services:case:${f.caseId}`,
      ownerRole: TEAM_ROLE[f.team] ?? 'hr-ops',
      ownerName: er ? f.team : (f.assignee ?? f.team),
      due: caseDue(f),
      severity: age > critical ? 'critical' : 'warning',
      what: `${f.category} case open ${fmt(age, 'days')}, ${fmt(past, 'days')} past its ${targetWords(f.resolutionTarget)} resolution target${waiting ? ', waiting on a third party' : ''}`,
      subject: er
        ? { kind: 'none', label: 'Employee relations case' }
        : { kind: 'cases', id: f.caseId, label: `${f.category} case ${f.caseId}` },
      view: 'services',
      tab: 'cases',
      drill: er || !m.scope.on ? undefined : () => oneCaseDrill(m.scope, f),
      note: waiting
        ? 'It is waiting on a third party. Could you share the date you expect to hear back?'
        : 'Could you share when it can be resolved, or what it is waiting on?',
      uses,
    })
  }
  return out
}

/** HR transactions open past their due date, one item per transaction. */
export function transactionActions(m: ServicesModel): ActionItem[] {
  const L = lineage(m.caseCols)
  const uses = union(L.onTime, L.txType)
  const out: ActionItem[] = []
  for (const f of m.tx) {
    if (f.outcome !== 'overdue' || !f.due) continue
    const payroll = PAYROLL_TX.has(f.type)
    const late = daysBetween(f.due, m.asOf)
    const who = f.name ?? f.employeeId
    const finalPay = f.type === 'Termination'
    out.push({
      id: `services:tx:${f.transactionId}`,
      ownerRole: payroll ? 'payroll' : 'hr-ops',
      ownerName: payroll ? 'Payroll' : 'People operations',
      due: f.due,
      severity: finalPay || late > 14 ? 'critical' : 'warning',
      what: `${f.type} for ${who} is not processed, due ${dateWords(f.due)}`,
      subject: { kind: 'transactions', id: f.transactionId, label: `${f.type}, ${who}` },
      view: 'services',
      tab: 'transactions',
      drill: m.scope.on ? () => oneTxDrill(m, f) : undefined,
      note: finalPay
        ? `Final pay was due on ${dateWords(f.due)} under the local rule. Could you confirm when it will be paid?`
        : `It was due on ${dateWords(f.due)}. Could you confirm when it will be processed?`,
      uses,
    })
  }
  return out
}

/** One listed transaction: the item names it already, so only the scope gate applies. */
function oneTxDrill(m: ServicesModel, f: TxFact) {
  return drillSpec({
    kind: 'transactions',
    title: `${f.type} ${f.transactionId}`,
    subtitle: asOfSub(m.scope),
    rows: [f.record],
  })
}

/** Returns from leave in the look-ahead without systems ready (LV-03), one item per return. */
export function returnActions(m: ServicesModel): ActionItem[] {
  const out: ActionItem[] = []
  for (const u of m.leave.upcoming) {
    if (u.ready) continue
    const f = u.fact
    const who = f.name ?? f.employeeId
    const day = dateWords(u.expected)
    out.push({
      id: `services:return:${f.leaveId}`,
      ownerRole: 'hr-ops',
      ownerName: 'People operations',
      due: u.expected,
      severity: u.urgent ? 'critical' : 'warning',
      what:
        u.status === 'Not entered'
          ? `Return from leave on ${day} is not entered in the HRIS`
          : `Return from leave on ${day} is entered but not processed`,
      subject: { kind: 'employees', id: f.employeeId, label: who },
      view: 'services',
      tab: 'leave',
      drill: m.scope.on
        ? () =>
            leaveDrill({ ...m.scope, minGroup: 1 }, [f], {
              title: `Return from leave, ${who}`,
              subtitle: asOfSub(m.scope),
              columns: ['expected', 'days'],
            })
        : undefined,
      note: `Could you confirm that pay, access and equipment are ready for ${who}'s return on ${day}?`,
      uses: LEAVE.systemsReady,
    })
  }
  return out
}

/** Every open HR ops item for the Action center. */
export function servicesActions(ctx: AnalyticsContext): ActionItem[] {
  const m = computeCached(ctx)
  return [...caseActions(m), ...transactionActions(m), ...returnActions(m)]
}
