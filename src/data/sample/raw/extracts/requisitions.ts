/**
 * Requisitions as the ATS job report exports them: US dates, sites with a region suffix,
 * "Closed - Filled" statuses. 3% of reqs have no hiring manager on record, three carry a hire
 * reason Census does not know ("Conversion"), and reqs closed before the last 12 months still use
 * the old ATS names for two departments ("DV"), so they do not match the roster.
 */
import type { Datasets, ReqStatus, Requisition } from '../../../schema'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, levelCode, mdy, siteLabel, toAoa } from '../format'
import { FILES } from '../plan'

const STATUS: Record<ReqStatus, string> = {
  Open: 'Open',
  'On hold': 'On Hold',
  Filled: 'Closed - Filled',
  Cancelled: 'Closed - Cancelled',
}
const REQ_TYPE: Record<string, string> = { New: 'New Headcount', Backfill: 'Backfill' }
const PRIORITY: Record<string, string> = {
  Critical: '1 - Critical',
  High: '2 - High',
  Standard: '3 - Standard',
}

/** Share of reqs with no hiring manager (neither ID nor name). */
export const NO_MANAGER_SHARE = 0.03
/** Reqs whose hire reason is "Conversion", which is not a req type. */
export const CONVERSIONS = 3

/** Department names the ATS used before the naming standard, on reqs closed before Oct 2025. */
export const OLD_DEPARTMENT_NAMES: Readonly<Record<string, string>> = {
  'Design Verification': 'DV',
  'Test & Product Engineering': 'Test & Product Eng',
}

/** Closed before the last 12 months, so no open pipeline or recent fill depends on them. */
const closedEarly = (r: Requisition) =>
  r.status === 'Cancelled' || (r.status === 'Filled' && !!r.filledDate && r.filledDate < '2025-10-01')

export interface ReqMess {
  noManager: Set<number>
  conversion: Set<number>
  /** Row index → the old department name the req carries. */
  oldDepartment: Map<number, string>
}

export function requisitionMess(rows: readonly Requisition[]): ReqMess {
  const rng = rngFor('raw-requisitions')
  const noManager = pickRows(rows, Math.round(rows.length * NO_MANAGER_SHARE), rng, closedEarly)
  const conversion = pickRows(
    rows,
    CONVERSIONS,
    rng,
    (r, i) => !noManager.has(i) && r.status === 'Filled' && r.openedDate < '2025-04-01',
  )
  const oldDepartment = new Map<number, string>()
  rows.forEach((r, i) => {
    const old = OLD_DEPARTMENT_NAMES[r.department]
    if (old && closedEarly(r)) oldDepartment.set(i, old)
  })
  return { noManager, conversion, oldDepartment }
}

/** The rows the import yields: no hiring manager on 3%, old department names, and "Conversion" is not a req type. */
export function requisitionsPlanted(base: Datasets): Requisition[] {
  const mess = requisitionMess(base.requisitions)
  return base.requisitions.map((r, i) => {
    const department = mess.oldDepartment.get(i)
    if (!department && !mess.noManager.has(i) && !mess.conversion.has(i)) return r
    const out = { ...r }
    if (department) out.department = department
    if (mess.noManager.has(i)) {
      out.hiringManagerId = null
      out.hiringManager = null
    }
    if (mess.conversion.has(i)) out.reqType = null
    return out
  })
}

export function requisitionsExtract(base: Datasets): RawExtract<'requisitions'> {
  const mess = requisitionMess(base.requisitions)
  const columns: Column<Requisition>[] = [
    { header: 'Job Req ID', cell: (r) => r.reqId },
    { header: 'Job Posting Title', cell: (r) => r.jobTitle },
    { header: 'Business Group', cell: (r) => r.businessUnit },
    { header: 'Dept', cell: (r, i) => mess.oldDepartment.get(i) ?? r.department },
    { header: 'Primary Location', cell: (r) => siteLabel(r.location) },
    { header: 'Job Level', cell: (r) => levelCode(r.level) },
    {
      header: 'Hiring Manager Employee ID',
      cell: (r, i) => (mess.noManager.has(i) ? null : (r.hiringManagerId ?? null)),
    },
    { header: 'Hiring Manager', cell: (r, i) => (mess.noManager.has(i) ? null : (r.hiringManager ?? null)) },
    { header: 'Recruiter', cell: (r) => r.recruiter ?? null },
    { header: 'Date Opened', cell: (r) => mdy(r.openedDate) },
    { header: 'Target Start', cell: (r) => mdy(r.targetStartDate) },
    { header: 'Offer Accepted Date', cell: (r) => mdy(r.filledDate) },
    { header: 'Date Closed', cell: (r) => mdy(r.closedDate) },
    { header: 'Req Status', cell: (r) => STATUS[r.status] },
    {
      header: 'Reason for Hire',
      cell: (r, i) => (mess.conversion.has(i) ? 'Conversion' : r.reqType ? REQ_TYPE[r.reqType] : null),
    },
    { header: 'Priority', cell: (r) => (r.priority ? PRIORITY[r.priority] : null) },
    { header: '# of Openings', cell: (r) => r.openings },
  ]
  return {
    dataset: 'requisitions',
    ...FILES.requisitions,
    aoa: toAoa(base.requisitions, columns),
  }
}
