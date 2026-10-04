/**
 * HR cases as the help desk exports them: its own state, channel, priority and tier names and
 * second-precision timestamps. The first response is missing on 8% of cases past New, and three
 * help-desk services added in January 2026 were never mapped to a case category, so their cases
 * arrive with the service name as the category.
 */
import type { CaseStatus, Datasets, HrCase } from '../../../schema'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, stamp, toAoa } from '../format'
import { FILES } from '../plan'

const STATE: Record<CaseStatus, string> = {
  New: 'New',
  'In progress': 'Work in Progress',
  'Waiting on employee': 'Awaiting Info',
  'Waiting on third party': 'Awaiting Third Party',
  Resolved: 'Resolved',
  Closed: 'Closed Complete',
}
const CHANNEL: Record<string, string> = {
  Portal: 'Self-service',
  Email: 'E-mail',
  Chat: 'Chat',
  Phone: 'Phone',
  'Walk-in': 'Walk-in',
}
const PRIORITY: Record<string, string> = {
  P1: '1 - Critical',
  P2: '2 - High',
  P3: '3 - Moderate',
  P4: '4 - Low',
}
const TIER: Record<string, string> = {
  'Tier 0': 'L0 - Self-service',
  'Tier 1': 'L1 - Service center',
  'Tier 2': 'L2 - Specialist',
  'Tier 3': 'L3 - Center of excellence',
}

/** Share of cases past New whose first response time is missing. */
export const MISSING_FIRST_RESPONSE_SHARE = 0.08
/** Help-desk services launched on this date that were never mapped to a category. */
export const NEW_SERVICES_FROM = '2026-01-01'
/** Those services (case subcategories in the sample), written as the case's category. */
export const UNMAPPED_SERVICES: readonly string[] = [
  'Experience certificate',
  'Password or MFA reset',
  'Holiday calendar',
]

export interface CaseMess {
  noFirstResponse: Set<number>
  unmapped: Set<number>
}

export function caseMess(rows: readonly HrCase[]): CaseMess {
  const pastNew = rows.filter((r) => r.status !== 'New').length
  const noFirstResponse = pickRows(
    rows,
    Math.round(pastNew * MISSING_FIRST_RESPONSE_SHARE),
    rngFor('raw-cases'),
    (r) => r.status !== 'New' && !!r.firstResponseAt,
  )
  const unmapped = new Set<number>()
  rows.forEach((r, i) => {
    if (r.openedAt >= NEW_SERVICES_FROM && r.subcategory && UNMAPPED_SERVICES.includes(r.subcategory))
      unmapped.add(i)
  })
  return { noFirstResponse, unmapped }
}

/**
 * The rows the import yields: no first response on 8%, and the unmapped services kept as the
 * category, so no process ID can be derived for them.
 */
export function casesPlanted(base: Datasets): HrCase[] {
  const mess = caseMess(base.cases)
  return base.cases.map((r, i) => {
    if (!mess.noFirstResponse.has(i) && !mess.unmapped.has(i)) return r
    const out = { ...r }
    if (mess.noFirstResponse.has(i)) out.firstResponseAt = null
    if (mess.unmapped.has(i)) {
      out.category = r.subcategory ?? r.category
      out.processId = null
    }
    return out
  })
}

export function casesExtract(base: Datasets): RawExtract<'cases'> {
  const mess = caseMess(base.cases)
  const columns: Column<HrCase>[] = [
    { header: 'Case Number', cell: (r) => r.caseId },
    { header: 'Opened', cell: (r) => stamp(r.openedAt) },
    {
      header: 'First Response',
      cell: (r, i) => (mess.noFirstResponse.has(i) ? null : stamp(r.firstResponseAt)),
    },
    { header: 'Resolved', cell: (r) => stamp(r.resolvedAt) },
    { header: 'State', cell: (r) => STATE[r.status] },
    { header: 'HR Service', cell: (r, i) => (mess.unmapped.has(i) ? (r.subcategory ?? null) : r.category) },
    { header: 'Subcategory', cell: (r) => r.subcategory ?? null },
    { header: 'Contact Channel', cell: (r) => CHANNEL[r.channel] ?? r.channel },
    { header: 'Priority', cell: (r) => (r.priority ? PRIORITY[r.priority] : null) },
    { header: 'Support Tier', cell: (r) => (r.tier ? TIER[r.tier] : null) },
    { header: 'Assignment Group', cell: (r) => r.team },
    { header: 'Assigned To', cell: (r) => r.assignee ?? null },
    { header: 'Employee ID', cell: (r) => r.requesterId ?? null },
    { header: 'Location', cell: (r) => r.location ?? null },
    { header: 'Response SLA (hrs)', cell: (r) => r.responseTargetHours ?? null },
    { header: 'Resolution SLA (hrs)', cell: (r) => r.resolutionTargetHours ?? null },
    { header: 'Survey Score', cell: (r) => r.csat ?? null },
    { header: 'Reopen Count', cell: (r) => (r.reopened == null ? null : r.reopened ? 1 : 0) },
    { header: 'Escalated', cell: (r) => (r.escalated == null ? null : r.escalated ? 'true' : 'false') },
  ]
  return {
    dataset: 'cases',
    ...FILES.cases,
    aoa: toAoa(base.cases, columns),
  }
}
