/**
 * Compliance items for the Action center (docs/VIEWS.md, Elsewhere):
 *  - reverification to start (Global mobility): authorizations that ended without one, those
 *    inside the lead time without one, and those whose lead-time mark falls within the notice;
 *  - I-9 Section 2 past due and not complete (People operations);
 *  - export licenses not in force for someone working, or starting within the look-ahead (Trade
 *    compliance).
 *
 * `what` describes the state in plain words, never a nagging verb, and never the authorization
 * type; `note` holds the polite ask the copied note uses. Ids are stable across recomputes.
 *
 * Each item is one matter per person (`matter`: 'work-auth:', 'i9:', 'license:' and the employee
 * ID), so Onboarding's I-9 Section 2 item and its export-control screening task fold into these
 * (docs/ACTION-CENTER-AUDIT.md 4.2). A legal breach (an authorization that ended, an I-9 past due,
 * an export license not in force) carries `exposure` and ranks first; a license breach is due on
 * the start date, so it reads overdue, never "Due today". Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { addDays } from '@/lib/dates'
import { placeOf, TEAM_OWNER } from '../../hrbp/engine/places'
import type { ActionItem } from '../../types'
import { type DrillScope, expiryDrill, i9Drill, licenseDrill } from './drills'
import { USES } from './lineage'
import type { ComplianceCore } from './model'
import { businessDaysText, day } from './wording'
import { isJudged } from './work'

export const MOBILITY = TEAM_OWNER.mobility
export const PEOPLE_OPS = TEAM_OWNER.peopleOps
export const TRADE = TEAM_OWNER.trade

/** Item ids: '<view>:<kind>:<employee ID>'. */
export const actionId = (kind: 'reverification' | 'i9' | 'license', employeeId: string): string =>
  `compliance:${kind}:${employeeId}`

/** The matter an item is about, shared with the views that raise the same one: '<kind>:<employee ID>'. */
export const matterOf = (kind: 'work-auth' | 'i9' | 'license', employeeId: string): string =>
  `${kind}:${employeeId}`

export function buildActions(ctx: AnalyticsContext, m: ComplianceCore, s: DrillScope): ActionItem[] {
  const { work, i9, exportControl: ex, settings: cfg, base } = m
  const asOf = base.asOf
  if (!base.has.rightToWork) return []
  const items: ActionItem[] = []

  /* Reverification. */
  const noticeEnd = addDays(asOf, cfg.reverifyNotice)
  const upcoming = work.expiringHorizon.filter((x) => !isJudged(x, asOf) && x.dueBy <= noticeEnd)
  for (const x of [...work.expired, ...work.overdue, ...upcoming]) {
    const ended = x.status === 'Expired'
    const overdue = x.status === 'Not started'
    items.push({
      id: actionId('reverification', x.e.employeeId),
      ownerRole: 'immigration',
      ownerId: null,
      ownerName: MOBILITY,
      due: ended ? x.expiryDate : x.dueBy,
      severity:
        ended || (overdue && x.daysToExpiry <= cfg.overdueCriticalDays)
          ? 'critical'
          : overdue
            ? 'warning'
            : 'info',
      what: ended
        ? `Work authorization ended ${day(x.expiryDate)}; no reverification is recorded`
        : overdue
          ? `Work authorization ends ${day(x.expiryDate)}; reverification has not started`
          : `Work authorization ends ${day(x.expiryDate)}; reverification is due to start by ${day(x.dueBy)}`,
      subject: { kind: 'rightToWork', id: x.e.employeeId, label: x.e.name },
      view: 'compliance',
      tab: 'work',
      drill: () =>
        expiryDrill(s, [x], { title: `Work authorization of ${x.e.name}`, uses: USES.reverification }),
      note: ended
        ? `Could you confirm the current work authorization for ${x.e.name}, whose recorded authorization ended on ${day(x.expiryDate)}?`
        : `Could you start reverification for ${x.e.name}, whose work authorization ends on ${day(x.expiryDate)}?`,
      uses: USES.reverification,
      matter: matterOf('work-auth', x.e.employeeId),
      ...(ended ? { exposure: true } : {}),
      closesWhen: 'A reverification date, or a new authorization end date, on the Right to work row',
      place: placeOf(ctx, x.e),
    })
  }

  /* I-9 Section 2 past due. */
  for (const x of i9.open) {
    items.push({
      id: actionId('i9', x.e.employeeId),
      ownerRole: 'hr-ops',
      ownerId: null,
      ownerName: PEOPLE_OPS,
      due: x.deadline,
      severity: 'critical',
      what: `I-9 Section 2 is not complete; it was due ${day(x.deadline)}, ${businessDaysText(cfg.i9Days)} after the start`,
      subject: { kind: 'rightToWork', id: x.e.employeeId, label: x.e.name },
      view: 'compliance',
      tab: 'work',
      drill: () => i9Drill(s, [x], { title: `Form I-9 of ${x.e.name}`, uses: USES.i9 }),
      note: `Could you complete Form I-9 Section 2 for ${x.e.name}, who started on ${day(x.hireDate)}?`,
      uses: USES.i9,
      matter: matterOf('i9', x.e.employeeId),
      exposure: true,
      closesWhen: 'An I-9 Section 2 completed date on the Right to work row',
      place: placeOf(ctx, x.e),
    })
  }

  /* Export licenses. */
  for (const x of ex.without) {
    items.push({
      id: actionId('license', x.e.employeeId),
      ownerRole: 'trade-compliance',
      ownerId: null,
      ownerName: TRADE,
      // The breach began on the start date: it is overdue from then, never "Due today".
      due: x.startDate,
      severity: 'critical',
      what: `Working since ${day(x.startDate)} without an export license in force (license ${x.status.toLowerCase()})`,
      subject: { kind: 'rightToWork', id: x.e.employeeId, label: x.e.name },
      view: 'compliance',
      tab: 'export',
      drill: () => licenseDrill(s, [x], { title: `Export license of ${x.e.name}`, uses: USES.exportLicense }),
      note: `Could you confirm the export license for ${x.e.name}, and that access to controlled technology stays restricted until it is in force?`,
      uses: USES.exportLicense,
      matter: matterOf('license', x.e.employeeId),
      exposure: true,
      closesWhen: 'An export license status of Approved, or Not needed, on the Right to work row',
      place: placeOf(ctx, x.e),
    })
  }
  for (const x of ex.pendingStarts) {
    items.push({
      id: actionId('license', x.e.employeeId),
      ownerRole: 'trade-compliance',
      ownerId: null,
      ownerName: TRADE,
      due: x.startDate,
      severity: 'warning',
      what: `Starts ${day(x.startDate)}; the export license is ${x.status === 'Not recorded' ? 'not recorded' : x.status.toLowerCase()}`,
      subject: { kind: 'rightToWork', id: x.e.employeeId, label: x.e.name },
      view: 'compliance',
      tab: 'export',
      drill: () => licenseDrill(s, [x], { title: `Export license of ${x.e.name}`, uses: USES.exportLicense }),
      note: `Could you confirm whether the export license for ${x.e.name} will be in force before the start on ${day(x.startDate)}?`,
      uses: USES.exportLicense,
      matter: matterOf('license', x.e.employeeId),
      exposure: true,
      closesWhen: 'An export license status of Approved, or Not needed, on the Right to work row',
      place: placeOf(ctx, x.e),
    })
  }
  return items
}
