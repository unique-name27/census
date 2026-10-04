/**
 * HR transactions as the HRIS business-process audit exports them: business process names,
 * day-first dates (the report runs from the Munich shared-service center), Y/N flags, and the
 * leave type and estimated return date on leave requests. Four old job changes carry "TBC" in
 * the retro column.
 */
import type { Datasets, HrTransaction, LeaveReason, TransactionType } from '../../../schema'
import { rngFor } from '../../prng'
import { pickRows, type RawExtract } from '../extract'
import { type Column, ddmmyyyy, toAoa, yn } from '../format'
import { FILES } from '../plan'

const PROCESS: Record<TransactionType, string> = {
  'New hire': 'Hire',
  Termination: 'Termination',
  'Job change': 'Change Job',
  'Compensation change': 'Request Compensation Change',
  'Leave start': 'Request Leave of Absence',
  'Return from leave': 'Return from Leave of Absence',
  'Location change': 'Change Work Location',
  'Personal data change': 'Change Personal Information',
}

/** HRIS leave types (the importer reads them as the Atlas categories). */
const LEAVE_TYPE: Record<LeaveReason, string> = {
  Parental: 'Parental Leave',
  Medical: 'Medical Leave',
  'Family care': 'Family Care Leave',
  Personal: 'Personal Leave (Unpaid)',
  Bereavement: 'Bereavement Leave',
  Military: 'Military Leave',
  'Civic duty': 'Jury Duty',
  "Workers' compensation": "Workers' Comp",
  Sabbatical: 'Sabbatical',
}

/** Job changes whose retro flag reads "TBC". */
export const UNREADABLE_RETRO = 4

export function unreadableRetroRows(rows: readonly HrTransaction[]): Set<number> {
  return pickRows(
    rows,
    UNREADABLE_RETRO,
    rngFor('raw-transactions'),
    (r) => r.type === 'Job change' && r.retro === false && r.submittedDate < '2025-04-01',
  )
}

/** The rows the import yields: "TBC" is not yes or no, so retro is blank. */
export function transactionsPlanted(base: Datasets): HrTransaction[] {
  const tbc = unreadableRetroRows(base.transactions)
  return base.transactions.map((r, i) => (tbc.has(i) ? { ...r, retro: null } : r))
}

export function transactionsExtract(base: Datasets): RawExtract<'transactions'> {
  const tbc = unreadableRetroRows(base.transactions)
  const columns: Column<HrTransaction>[] = [
    { header: 'Transaction ID', cell: (r) => r.transactionId },
    { header: 'Business Process', cell: (r) => PROCESS[r.type] },
    { header: 'Worker ID', cell: (r) => r.employeeId },
    { header: 'Initiated Date', cell: (r) => ddmmyyyy(r.submittedDate) },
    { header: 'Effective Date', cell: (r) => ddmmyyyy(r.effectiveDate) },
    { header: 'Due Date', cell: (r) => ddmmyyyy(r.dueDate) },
    { header: 'Date Processed', cell: (r) => ddmmyyyy(r.completedDate) },
    { header: 'Retro', cell: (r, i) => (tbc.has(i) ? 'TBC' : yn(r.retro)) },
    { header: 'Leave Type', cell: (r) => (r.leaveReason ? LEAVE_TYPE[r.leaveReason] : null) },
    { header: 'Estimated Return Date', cell: (r) => ddmmyyyy(r.expectedReturnDate) },
  ]
  return {
    dataset: 'transactions',
    ...FILES.transactions,
    aoa: toAoa(base.transactions, columns),
  }
}
