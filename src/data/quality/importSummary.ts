/**
 * Counts from an import log, kept with each dataset version: which codes and fields had issues,
 * how many values were not recognized or defaulted per field, how many rows had an error and
 * how many issues block silver.
 */
import type { ImportIssue, IssueCode } from '../import/types'
import { type DatasetKey, datasetDef } from '../schema'
import { isFilled } from './applicability'
import type { IssueCounts } from './types'

type Row = Record<string, unknown>

/** Codes that make a row count toward the issue rate. */
export const ERROR_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'missing-required',
  'unreadable',
  'unknown-value',
  'out-of-range',
  'duplicate',
  'manager-self',
  'manager-unknown',
  'manager-ambiguous',
  'manager-cycle',
])

/** Codes that stop a dataset reaching silver until they are fixed. */
export const BLOCKING_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>(['column-missing', 'manager-cycle'])

/** Codes for a value that could not be read or was not recognized. */
export const INVALID_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  'unreadable',
  'unknown-value',
  'out-of-range',
])

/**
 * For a field the file had no column for, the values the importer derived from other columns of
 * the same row. They are data, not defaults (country from a known site, a name built from first
 * and last name columns).
 */
const DERIVED_WITHOUT_COLUMN: Partial<Record<DatasetKey, Record<string, (r: Row) => boolean>>> = {
  employees: { name: (r) => r.name !== r.employeeId, country: () => true },
  candidates: {
    candidateName: (r) => r.candidateName !== r.candidateId && r.candidateName !== r.applicationId,
  },
  cases: { team: () => true },
  comp: { fxToUsd: (r) => r.currency === 'USD' },
}

export const emptyIssueCounts = (rows = 0): IssueCounts => ({
  rowsIn: rows,
  rowsOut: rows,
  total: 0,
  byCode: {},
  byField: {},
  invalidByField: {},
  defaultedByField: {},
  rowsWithErrors: 0,
  blocking: 0,
})

/** The importer's key for a row (its row-key values joined), as written on each issue. */
export function rowKeyOf(key: DatasetKey, rec: Row): string | null {
  const parts = datasetDef(key)
    .rowKey.map((k) => rec[k])
    .filter((v) => v != null && v !== '')
  return parts.length ? parts.join(' · ') : null
}

/**
 * Summarize an import log against the rows it produced. `mapped` tells which fields had a
 * column in the file; `rowsIn` is the file's row count when known (the importer's stats).
 */
export function summarizeImport(args: {
  dataset: DatasetKey
  rows: readonly object[]
  issues: readonly ImportIssue[]
  mapped?: (field: string) => boolean
  rowsIn?: number
}): IssueCounts {
  const { dataset, issues } = args
  const rows = args.rows as readonly Row[]
  const out = emptyIssueCounts(rows.length)
  const errorRows = new Set<number>()
  const skippedRows = new Set<number>()
  const loggedDefaults = new Map<string, Set<string>>()
  const sheetDefaults = new Set<string>()
  for (const i of issues) {
    out.total++
    out.byCode[i.code] = (out.byCode[i.code] ?? 0) + 1
    out.byField[i.field] = (out.byField[i.field] ?? 0) + 1
    if (BLOCKING_CODES.has(i.code)) out.blocking++
    if (i.row > 0 && ERROR_CODES.has(i.code)) errorRows.add(i.row)
    if (i.action === 'row-skipped' && i.row > 0) skippedRows.add(i.row)
    if (INVALID_CODES.has(i.code) && (i.action === 'left-blank' || i.action === 'cleared') && i.field)
      out.invalidByField[i.field] = (out.invalidByField[i.field] ?? 0) + 1
    if (i.code === 'defaulted' && i.field) {
      if (i.row === 0) sheetDefaults.add(i.field)
      else if (i.id) {
        const set = loggedDefaults.get(i.field) ?? new Set<string>()
        set.add(i.id)
        loggedDefaults.set(i.field, set)
      }
    }
  }
  out.rowsWithErrors = errorRows.size
  out.rowsIn = args.rowsIn ?? rows.length + skippedRows.size

  // A logged default counts only when the value it left is a real value ("Unknown" is blank anyway).
  let keys: (string | null)[] | null = null
  for (const [field, ids] of loggedDefaults) {
    keys ??= rows.map((r) => rowKeyOf(dataset, r))
    let n = 0
    rows.forEach((r, i) => {
      const k = (keys as (string | null)[])[i]
      if (k != null && ids.has(k) && isFilled(r[field])) n++
    })
    if (n) out.defaultedByField[field] = n
  }
  for (const field of sheetDefaults) {
    if (args.mapped?.(field)) continue
    const derived = DERIVED_WITHOUT_COLUMN[dataset]?.[field]
    let n = 0
    for (const r of rows) if (isFilled(r[field]) && !derived?.(r)) n++
    if (n) out.defaultedByField[field] = (out.defaultedByField[field] ?? 0) + n
  }
  return out
}
