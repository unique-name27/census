/**
 * Right to work as the immigration vendor's tracker exports it: immigration programs instead of
 * Census's broad categories ("H-1B", "STEM OPT EAD", "Blue Card"; permanent authorization reads
 * "No expiry"), day-month-year dates and Yes/No flags. Global mobility confirmed the mapping. Two
 * renewals the vendor is still processing read "Pending renewal" in the expiry column, so those
 * expiry dates are blank. Nationality and citizenship are not in the tracker.
 */
import type { AuthorizationType, Datasets, RightToWork } from '../../../schema'
import { siteByLocation } from '../../../schema'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, dMonY, toAoa } from '../format'
import { FILES } from '../plan'

/** Authorization expiries that read "Pending renewal" (all more than a year away). */
export const PENDING_RENEWAL = 2

export function pendingRenewalRows(rows: readonly RightToWork[]): Set<number> {
  return pickRows(
    rows,
    PENDING_RENEWAL,
    rngFor('raw-right-to-work'),
    (r) => !!r.expiryDate && r.expiryDate > '2027-10-01' && !r.reverificationStartedDate,
  )
}

/** The rows the import yields: "Pending renewal" is not a date, so the expiry is blank. */
export function rightToWorkPlanted(base: Datasets): RightToWork[] {
  const pending = pendingRenewalRows(base.rightToWork)
  return base.rightToWork.map((r, i) => (pending.has(i) ? { ...r, expiryDate: null } : r))
}

/** The vendor's program name for a category, by the person's work country. */
function program(type: AuthorizationType | null | undefined, country: string): string | null {
  switch (type) {
    case 'Permanent (no expiry)':
      return 'No expiry'
    case 'Employer-sponsored visa':
      return 'H-1B'
    case 'Intra-company transfer':
      return country === 'United States' ? 'L-1A' : 'ICT permit'
    case 'Employment authorization document':
      return 'EAD (C09)'
    case 'Student work authorization':
      return 'STEM OPT EAD'
    case 'Dependent work authorization':
      return 'H-4 EAD'
    case 'Work permit':
      return country === 'Germany' ? 'Blue Card' : 'Work permit'
    case 'Other time-limited':
      return 'Temporary status'
    default:
      return null
  }
}

export function rightToWorkExtract(base: Datasets): RawExtract<'rightToWork'> {
  const pending = pendingRenewalRows(base.rightToWork)
  const country = new Map(
    base.employees.map((e) => [e.employeeId, siteByLocation.get(e.location)?.country ?? '']),
  )
  const yesNo = (b: boolean | null | undefined) => (b == null ? null : b ? 'Yes' : 'No')
  const columns: Column<RightToWork>[] = [
    { header: 'Employee ID', cell: (r) => r.employeeId },
    {
      header: 'Work Authorization',
      cell: (r) => program(r.authorizationType, country.get(r.employeeId) ?? ''),
    },
    {
      header: 'Authorization Expiry',
      cell: (r, i) => (pending.has(i) ? 'Pending renewal' : dMonY(r.expiryDate)),
    },
    { header: 'Renewal Filed', cell: (r) => dMonY(r.reverificationStartedDate) },
    { header: 'I-9 Section 1', cell: (r) => dMonY(r.i9Section1Date) },
    { header: 'I-9 Section 2', cell: (r) => dMonY(r.i9Section2Date) },
    { header: 'License Required', cell: (r) => yesNo(r.exportLicenseRequired) },
    {
      header: 'License Status',
      cell: (r) => (r.exportLicenseRequired ? (r.exportLicenseStatus ?? null) : null),
    },
    { header: 'License Expiry', cell: (r) => dMonY(r.exportLicenseExpiry) },
  ]
  return { dataset: 'rightToWork', ...FILES.rightToWork, aoa: toAoa(base.rightToWork, columns) }
}
