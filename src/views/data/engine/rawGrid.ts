/**
 * The Raw panel's grid: the stored sheet of a version with its original headers, each cell that
 * failed conversion or was filled by a default flagged from the import log, rows the import
 * skipped marked, which columns stay hidden for privacy, search, paging and the export table.
 * Pure.
 */
import type { Column } from '@/charts/types'
import type { ImportIssue, ImportStats, IssueCode, ParsedSheet } from '@/data/import'
import type { DatasetVersion, VersionMapping } from '@/data/quality'
import { type DatasetKey, datasetDef } from '@/data/schema'
import type { ImportLog } from '../state/importLog'
import { cellText } from './flow'

/** A cell the import could not read as it stood, or filled by itself. */
export type CellFlagKind = 'invalid' | 'defaulted'

export interface CellFlag {
  kind: CellFlagKind
  /** The importer's sentence: "Hire date 31/02/2026 is not a date". */
  text: string
  field: string
}

export interface RawFlags {
  /** `${rowIndex}|${header}` → flag. Row indexes are into `sheet.rows`. */
  cells: Map<string, CellFlag>
  /** Row index → why the import left the row out. */
  skipped: Map<number, string>
  /** Indexes of rows with at least one flag or skipped. */
  flaggedRows: number[]
  counts: { invalid: number; defaulted: number; skipped: number }
}

const INVALID: ReadonlySet<IssueCode> = new Set<IssueCode>(['unreadable', 'unknown-value', 'out-of-range'])

export const cellKey = (row: number, header: string): string => `${row}|${header}`

/**
 * Flags from the import log. An issue names the Excel row and the field; the mapping gives the
 * field's column. Issues about the whole sheet (row 0) have no cell.
 */
/** Loaded values that are not in their field's list, by the loaded row's key (see `rowKeyOf`). */
export interface UnrecognizedValues {
  field: string
  label: string
  keys: ReadonlySet<string>
}

/** A raw row's key as the importer would write it: its row-key columns, joined with " · ". */
export function rawRowKey(
  row: Record<string, unknown>,
  mapping: VersionMapping,
  rowKey: readonly string[],
): string | null {
  const parts = rowKey
    .map((f) => {
      const h = mapping[f]?.header
      return h ? cellText(row[h]) : ''
    })
    .filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export function rawFlags(
  sheet: Pick<ParsedSheet, 'rowNumbers' | 'rows'>,
  issues: readonly ImportIssue[],
  mapping: VersionMapping,
  /** Values kept as they were but not recognized now, found in the loaded rows by row key. */
  unrecognized?: { rowKey: readonly string[]; values: readonly UnrecognizedValues[] },
): RawFlags {
  const byExcelRow = new Map<number, number>()
  sheet.rowNumbers.forEach((n, i) => {
    if (!byExcelRow.has(n)) byExcelRow.set(n, i)
  })
  const cells = new Map<string, CellFlag>()
  const skipped = new Map<number, string>()
  const flagged = new Set<number>()
  const counts = { invalid: 0, defaulted: 0, skipped: 0 }
  for (const i of issues) {
    if (i.row <= 0) continue
    const at = byExcelRow.get(i.row)
    if (at == null) continue
    if (i.action === 'row-skipped') {
      if (!skipped.has(at)) {
        skipped.set(at, i.issue)
        counts.skipped++
        flagged.add(at)
      }
      continue
    }
    const kind: CellFlagKind | null = INVALID.has(i.code)
      ? 'invalid'
      : i.code === 'defaulted'
        ? 'defaulted'
        : null
    if (!kind) continue
    const header = mapping[i.field]?.header
    if (!header) continue
    const k = cellKey(at, header)
    const prev = cells.get(k)
    // An unreadable value outranks a default filled in its place.
    if (prev && (prev.kind === 'invalid' || kind === 'defaulted')) continue
    if (prev) counts[prev.kind]--
    cells.set(k, { kind, text: i.issue, field: i.field })
    counts[kind]++
    flagged.add(at)
  }
  if (unrecognized?.values.length) {
    const wanted = unrecognized.values.filter((v) => v.keys.size && mapping[v.field]?.header)
    if (wanted.length)
      sheet.rows.forEach((r, at) => {
        const key = rawRowKey(r, mapping, unrecognized.rowKey)
        if (key == null) return
        for (const v of wanted) {
          if (!v.keys.has(key)) continue
          const k = cellKey(at, mapping[v.field].header as string)
          if (cells.has(k)) continue
          cells.set(k, {
            kind: 'invalid',
            text: `${v.label} is not one of the recognized values; kept as it was.`,
            field: v.field,
          })
          counts.invalid++
          flagged.add(at)
        }
      })
  }
  return { cells, skipped, flaggedRows: [...flagged].sort((a, b) => a - b), counts }
}

/* ───────────── privacy ───────────── */

export interface HiddenColumn {
  header: string
  reason: string
}

export interface RawColumns {
  visible: string[]
  hidden: HiddenColumn[]
}

const PAY_REASON = 'Pay amounts are off'
const ER_REASON = 'Employee relations topics stay at category level'

/**
 * Which raw columns can be shown. Columns mapped to pay amount fields stay hidden while pay
 * amounts are off, and so does every column of a compensation sheet that is not mapped (it may
 * hold pay). Case subcategories and the case sheet's unmapped columns (notes, descriptions) are
 * never shown, so employee relations cases stay at category level.
 */
export function rawColumns(
  key: DatasetKey,
  headers: readonly string[],
  mapping: VersionMapping,
  showPay: boolean,
): RawColumns {
  const def = datasetDef(key)
  const fieldOf = new Map<string, string>()
  for (const [field, m] of Object.entries(mapping)) if (m.header) fieldOf.set(m.header, field)
  const payFields = new Set(def.fields.filter((f) => f.pay).map((f) => f.key))
  const visible: string[] = []
  const hidden: HiddenColumn[] = []
  for (const h of headers) {
    const field = fieldOf.get(h)
    let reason: string | null = null
    if (key === 'cases' && (!field || field === 'subcategory')) reason = ER_REASON
    else if (!showPay && field && payFields.has(field)) reason = PAY_REASON
    else if (!showPay && key === 'comp' && !field) reason = PAY_REASON
    if (reason) hidden.push({ header: h, reason })
    else visible.push(h)
  }
  return { visible, hidden }
}

/** "3 columns hidden: pay amounts are off." One sentence per reason. */
export function hiddenText(hidden: readonly HiddenColumn[]): string[] {
  const by = new Map<string, number>()
  for (const h of hidden) by.set(h.reason, (by.get(h.reason) ?? 0) + 1)
  return [...by].map(
    ([reason, n]) => `${n} ${n === 1 ? 'column' : 'columns'} hidden: ${reason.toLowerCase()}.`,
  )
}

/* ───────────── search and paging ───────────── */

export type RawFilter = 'all' | 'flagged'

/** Indexes of rows matching the search (any visible cell contains it, ignoring case) and filter. */
export function filterRawRows(
  sheet: Pick<ParsedSheet, 'rows' | 'rowNumbers'>,
  headers: readonly string[],
  query: string,
  filter: RawFilter = 'all',
  flags?: Pick<RawFlags, 'flaggedRows'>,
): number[] {
  const q = query.trim().toLowerCase()
  const base = filter === 'flagged' && flags ? flags.flaggedRows : sheet.rows.map((_, i) => i)
  if (!q) return [...base]
  return base.filter((i) => {
    const r = sheet.rows[i]
    if (String(sheet.rowNumbers[i] ?? '') === q) return true
    return headers.some((h) => cellText(r[h]).toLowerCase().includes(q))
  })
}

export const RAW_PAGE_SIZE = 50

export interface Page<T> {
  items: T[]
  page: number
  pages: number
  /** 1-based positions of the first and last item shown; 0 when empty. */
  from: number
  to: number
  total: number
}

/** One page of a list; the page number is clamped into range. */
export function pageOf<T>(list: readonly T[], page: number, size = RAW_PAGE_SIZE): Page<T> {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const p = Math.min(Math.max(0, Math.floor(page)), pages - 1)
  const start = p * size
  const items = list.slice(start, start + size)
  return {
    items,
    page: p,
    pages,
    from: items.length ? start + 1 : 0,
    to: start + items.length,
    total: list.length,
  }
}

/* ───────────── export ───────────── */

/** The raw sheet as a table: the row number in the file, every visible column, then the flags. */
export function rawExportTable(
  sheet: Pick<ParsedSheet, 'rows' | 'rowNumbers'>,
  headers: readonly string[],
  flags: RawFlags,
  rows: readonly number[] = sheet.rows.map((_, i) => i),
): { columns: Column[]; rows: Record<string, unknown>[] } {
  // Positional keys, so a header named like a built-in column never collides.
  const columns: Column[] = [
    { key: 'r', label: 'Row in the file', format: 'int', align: 'right' },
    ...headers.map((h, i) => ({ key: `c${i}`, label: h })),
    { key: 'flags', label: 'Import notes', width: 60 },
  ]
  const out = rows.map((i) => {
    const r = sheet.rows[i]
    const rec: Record<string, unknown> = { r: sheet.rowNumbers[i] ?? i + 2 }
    const notes: string[] = []
    const skip = flags.skipped.get(i)
    if (skip) notes.push(`Skipped: ${skip}`)
    headers.forEach((h, c) => {
      rec[`c${c}`] = cellText(r[h])
      const f = flags.cells.get(cellKey(i, h))
      if (f) notes.push(f.text)
    })
    rec.flags = notes.join(' ')
    return rec
  })
  return { columns, rows: out }
}

/* ───────────── a log for versions without one ───────────── */

/**
 * The "what the import changed" summary for a version whose upload log isn't kept separately
 * (the sample's raw extracts): its counts and the issues stored with the raw sheet.
 */
export function logFromRaw(
  version: Pick<DatasetVersion, 'dataset' | 'fileName' | 'sheetName' | 'importedAt' | 'issues'>,
  issues: readonly ImportIssue[],
): ImportLog {
  const c = version.issues
  const defaulted = Object.values(c.defaultedByField).reduce((a, n) => a + n, 0)
  const stats: ImportStats = {
    rowsIn: c.rowsIn,
    rowsOut: c.rowsOut,
    skippedMissingRequired: c.byCode['missing-required'] ?? 0,
    duplicates: c.byCode.duplicate ?? 0,
    defaulted,
    defaults: { ...c.defaultedByField },
    blanked: Object.values(c.invalidByField).reduce((a, n) => a + n, 0),
    notInRoster: c.byCode['not-in-roster'] ?? 0,
    rowsWithIssues: c.rowsWithErrors,
  }
  return {
    dataset: version.dataset,
    fileName: version.fileName ?? 'Raw extract',
    sheetName: version.sheetName ?? '',
    importedAt: version.importedAt ?? '',
    stats,
    issues: [...issues],
    truncated: 0,
  }
}
