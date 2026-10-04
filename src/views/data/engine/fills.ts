/**
 * Which values of an upload the importer supplied itself rather than reading them from the file,
 * per field. Worked out once, when a sheet is applied, and kept with the import log so field
 * coverage can count those values as blank: a column the file didn't have must not look complete.
 *
 * Two kinds of fill are told apart, following the importer's own split:
 * - judgment calls it logs ("treated as Employee", "filled from the employee ID") are defaults;
 * - derivations that can't mislead (country from a known site, a name built from first and last
 *   name columns) are data and count as filled.
 */
import type { ImportIssue, Mapping } from '@/data/import'
import type { DatasetDef, DatasetKey } from '@/data/schema'
import { type FieldFills, isFilled } from './coverage'

type Row = Record<string, unknown>

/**
 * For a field the file had no column for, the values the importer derived from other columns of
 * the same row. Every other value of such a field (when the log shows a default was used) is a
 * default. Fallbacks to "Unknown" count as blank anyway.
 */
export const DERIVED_WITHOUT_COLUMN: Partial<Record<DatasetKey, Record<string, (r: Row) => boolean>>> = {
  employees: {
    // Built from first and last name columns; the logged fallback is the employee ID.
    name: (r) => r.name !== r.employeeId,
    // Taken from a known work site; the logged fallback is Unknown.
    country: () => true,
  },
  candidates: {
    candidateName: (r) => r.candidateName !== r.candidateId && r.candidateName !== r.applicationId,
  },
  // Taken from the case category; the logged fallback is Unknown.
  cases: { team: () => true },
  // 1 for pay in USD; other currencies get a logged reference rate.
  comp: { fxToUsd: (r) => r.currency === 'USD' },
}

/** The importer's key for a row (its row-key values joined), as written on each issue. */
export function rowKeyOf(def: Pick<DatasetDef, 'rowKey'>, rec: Row): string | null {
  const parts = def.rowKey.map((k) => rec[k]).filter((v) => v != null && v !== '')
  return parts.length ? parts.join(' · ') : null
}

export function defaultFills(
  def: DatasetDef,
  rows: readonly object[],
  issues: readonly ImportIssue[],
  mapping: Mapping,
): FieldFills {
  const all = rows as readonly Row[]
  const logged = new Map<string, Set<string>>()
  const sheetLevel = new Set<string>()
  for (const i of issues) {
    if (i.code !== 'defaulted') continue
    if (i.row === 0) sheetLevel.add(i.field)
    else if (i.id) {
      const set = logged.get(i.field) ?? new Set<string>()
      set.add(i.id)
      logged.set(i.field, set)
    }
  }
  const notInFile: string[] = []
  const defaulted: Record<string, number> = {}
  let keys: (string | null)[] | null = null
  for (const f of def.fields) {
    const inFile = !!mapping[f.key]?.header
    if (!inFile) notInFile.push(f.key)
    let n = 0
    if (inFile) {
      const ids = logged.get(f.key)
      if (ids?.size) {
        keys ??= all.map((r) => rowKeyOf(def, r))
        all.forEach((r, i) => {
          const k = (keys as (string | null)[])[i]
          if (k != null && ids.has(k) && isFilled(r[f.key])) n++
        })
      }
    } else if (sheetLevel.has(f.key)) {
      const derived = DERIVED_WITHOUT_COLUMN[def.key]?.[f.key]
      for (const r of all) if (isFilled(r[f.key]) && !derived?.(r)) n++
    }
    if (n) defaulted[f.key] = n
  }
  return { notInFile, defaulted }
}
