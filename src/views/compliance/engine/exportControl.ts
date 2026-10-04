/**
 * Export control: people whose role needs an export-control license, and whether it is in force.
 *
 * Definitions (docs/VIEWS.md, Compliance):
 *  - in force: status Approved and no license expiry before the as-of date;
 *  - working without a license in force: active, license required, and status Pending, Denied or
 *    Expired, or a license expiry before the as-of date (target 0);
 *  - upcoming starts with a license pending: pre-hires starting within the look-ahead whose
 *    required license is not in force.
 * The license flag never records nationality. Pure.
 */
import { EXPORT_LICENSE_STATUSES, type ISODate } from '@/data/schema'
import { addDays } from '@/lib/dates'
import type { ComplianceBase, Person } from './base'

export interface LicenseRow extends Person {
  /** The status as judged at the as-of date: an Approved license past its expiry reads Expired. */
  status: string
  inForce: boolean
  /** Hire date (future for a pre-hire). */
  startDate: ISODate
  upcoming: boolean
}

export interface StatusRow {
  status: string
  people: number
  rows: LicenseRow[]
}

export interface ExportModel {
  /** Active or starting people whose role needs a license. */
  required: LicenseRow[]
  byStatus: StatusRow[]
  /** Active, required, not in force (the planted story: started while still pending). */
  without: LicenseRow[]
  /** Pre-hires in the look-ahead whose required license is not in force, soonest first. */
  pendingStarts: LicenseRow[]
  approved: number
}

const NOT_IN_FORCE = new Set(['Pending', 'Denied', 'Expired'])

export function licenseRow(p: Person, asOf: ISODate): LicenseRow {
  const raw = p.r.exportLicenseStatus ?? null
  const expired = !!p.r.exportLicenseExpiry && p.r.exportLicenseExpiry < asOf
  const status = expired && raw !== 'Denied' ? 'Expired' : (raw ?? 'Not recorded')
  return {
    ...p,
    status,
    inForce: raw === 'Approved' && !expired,
    startDate: p.e.hireDate,
    upcoming: p.e.hireDate > asOf,
  }
}

/** Working (or about to work) without a license in force, as the spec defines it. */
export const isWithout = (x: LicenseRow): boolean => NOT_IN_FORCE.has(x.status)

export function computeExport(base: ComplianceBase): ExportModel {
  const { asOf, settings: s } = base
  const lookEnd = addDays(asOf, s.pendingDays)
  const required = [...base.active, ...base.upcoming]
    .filter((p) => p.r.exportLicenseRequired === true)
    .map((p) => licenseRow(p, asOf))
  const statuses = new Map<string, LicenseRow[]>()
  for (const x of required) statuses.set(x.status, [...(statuses.get(x.status) ?? []), x])
  const order = [...EXPORT_LICENSE_STATUSES, 'Not recorded'] as readonly string[]
  const byStatus = [...statuses.entries()]
    .map(([status, rows]) => ({ status, people: rows.length, rows }))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
  const byStart = (a: LicenseRow, b: LicenseRow) =>
    a.startDate.localeCompare(b.startDate) || a.e.name.localeCompare(b.e.name)
  return {
    required,
    byStatus,
    without: required.filter((x) => !x.upcoming && isWithout(x)).sort(byStart),
    pendingStarts: required.filter((x) => x.upcoming && x.startDate <= lookEnd && !x.inForce).sort(byStart),
    approved: required.filter((x) => x.inForce).length,
  }
}
