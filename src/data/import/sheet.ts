/**
 * Turn an array of rows into a ParsedSheet: find the header row, name the columns and keep the
 * data rows. No SheetJS here, so code that already has rows in memory (the messy sample, pasted
 * tables) can build a sheet without loading the workbook reader.
 */
import type { ParsedSheet } from './types'

/** Rows scanned for the header. */
const HEADER_SCAN = 15

const isEmptyCell = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

/** Numbers, amounts and dates are data, never header text. */
const isDataCell = (v: unknown) =>
  typeof v === 'number' ||
  v instanceof Date ||
  (typeof v === 'string' &&
    /\d/.test(v) &&
    (/^[-+]?[$€£]?[\d,.\s]+%?$/.test(v.trim()) ||
      /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}(?:[ T].*)?$/.test(v.trim())))

/**
 * The header row: the first of the first 15 rows with at least two filled cells, more than 60%
 * of them text, and distinct names. Two refinements over the classic rule: rows much narrower
 * than the table (a "Run on | 30 Sep 2026" line above it) are passed over, and one repeated
 * column name in four is tolerated, since real exports do repeat a header now and then.
 * Falls back to the first row.
 */
export function detectHeaderRow(rows: readonly (readonly unknown[])[]): number {
  const limit = Math.min(rows.length, HEADER_SCAN)
  const filled = rows.slice(0, HEADER_SCAN * 2).map((r) => (r ?? []).filter((c) => !isEmptyCell(c)))
  const minCells = Math.max(2, Math.ceil(0.7 * Math.max(0, ...filled.map((c) => c.length))))
  for (let i = 0; i < limit; i++) {
    const cells = filled[i]
    if (cells.length < minCells) continue
    const text = cells.filter((c) => !isDataCell(c)).length
    if (text / cells.length <= 0.6) continue
    const names = cells.map((c) => String(c).trim().toLowerCase())
    if (new Set(names).size / names.length >= 0.75) return i
  }
  return 0
}

function headerText(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return isEmptyCell(v) ? '' : String(v).replace(/\s+/g, ' ').trim()
}

/** Trim, name blanks "Column N" and suffix repeats "Name (2)". */
export function dedupeHeaders(raw: readonly unknown[], width: number): string[] {
  const seen = new Map<string, number>()
  const out: string[] = []
  for (let i = 0; i < width; i++) {
    let h = headerText(raw[i]) || `Column ${i + 1}`
    const key = h.toLowerCase()
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    if (n > 1) h = `${h} (${n})`
    out.push(h)
  }
  return out
}

/**
 * Rows to a sheet. `firstRow` is the 0-based sheet row of `aoa[0]`, so row numbers match what the
 * reader sees in Excel. Null when every cell is blank.
 */
export function toSheet(name: string, aoa: unknown[][], firstRow: number): ParsedSheet | null {
  const nonBlank = aoa.some((r) => r?.some((c) => !isEmptyCell(c)))
  if (!nonBlank) return null
  const headerRow = detectHeaderRow(aoa)
  const width = aoa.reduce((w, r) => {
    let last = -1
    r?.forEach((c, i) => {
      if (!isEmptyCell(c)) last = i
    })
    return Math.max(w, last + 1)
  }, 0)
  const headers = dedupeHeaders(aoa[headerRow] ?? [], width)
  const rows: Record<string, unknown>[] = []
  const rowNumbers: number[] = []
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r?.some((c) => !isEmptyCell(c))) continue
    const obj: Record<string, unknown> = {}
    headers.forEach((h, j) => {
      const c = r[j]
      obj[h] = isEmptyCell(c) ? null : typeof c === 'string' ? c.trim() : c
    })
    rows.push(obj)
    rowNumbers.push(firstRow + i + 1)
  }
  return { name, headerRow: firstRow + headerRow, headers, rows, rowNumbers }
}

/** Build a ParsedSheet from rows already in memory (pasted tables, the messy sample, tests). */
export function sheetFromRows(name: string, aoa: unknown[][]): ParsedSheet | null {
  return toSheet(name, aoa, 0)
}
