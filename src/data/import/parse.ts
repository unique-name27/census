/**
 * Read an Excel or CSV file into header-keyed rows with SheetJS.
 *
 * Workbook cells keep their types (numbers, text, dates as UTC Date objects). Text files are read
 * raw, so "03/04/2026" stays text and the importer decides the day order per column instead of
 * SheetJS assuming month-first. Title rows above the header are skipped by header detection.
 */
import * as XLSX from 'xlsx'
import type { FileFormat, ParsedSheet, ParsedWorkbook } from './types'

/** Rows scanned for the header. */
const HEADER_SCAN = 15

export class WorkbookReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'WorkbookReadError'
  }
}

export function formatOf(fileName: string): FileFormat {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? ''
  if (ext === 'csv' || ext === 'txt') return 'csv'
  if (ext === 'tsv' || ext === 'tab') return 'tsv'
  if (ext === 'xls') return 'xls'
  if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xlsb') return 'xlsx'
  return 'other'
}

const isEmpty = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

/** Most frequent of comma, tab, semicolon and pipe in the first non-blank line. */
export function sniffDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  let best = ','
  let bestCount = 0
  for (const d of [',', '\t', ';', '|']) {
    const count = line.split(d).length - 1
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

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
  const filled = rows.slice(0, HEADER_SCAN * 2).map((r) => (r ?? []).filter((c) => !isEmpty(c)))
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
  return isEmpty(v) ? '' : String(v).replace(/\s+/g, ' ').trim()
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

function toSheet(name: string, aoa: unknown[][], firstRow: number): ParsedSheet | null {
  const nonBlank = aoa.some((r) => r?.some((c) => !isEmpty(c)))
  if (!nonBlank) return null
  const headerRow = detectHeaderRow(aoa)
  const width = aoa.reduce((w, r) => {
    let last = -1
    r?.forEach((c, i) => {
      if (!isEmpty(c)) last = i
    })
    return Math.max(w, last + 1)
  }, 0)
  const headers = dedupeHeaders(aoa[headerRow] ?? [], width)
  const rows: Record<string, unknown>[] = []
  const rowNumbers: number[] = []
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r?.some((c) => !isEmpty(c))) continue
    const obj: Record<string, unknown> = {}
    headers.forEach((h, j) => {
      const c = r[j]
      obj[h] = isEmpty(c) ? null : typeof c === 'string' ? c.trim() : c
    })
    rows.push(obj)
    rowNumbers.push(firstRow + i + 1)
  }
  return { name, headerRow: firstRow + headerRow, headers, rows, rowNumbers }
}

function readBook(input: Uint8Array, format: FileFormat): XLSX.WorkBook {
  if (format === 'csv' || format === 'tsv') {
    const text = new TextDecoder('utf-8').decode(input)
    const FS = format === 'tsv' ? '\t' : sniffDelimiter(text)
    return XLSX.read(text, { type: 'string', raw: true, FS, dense: true })
  }
  return XLSX.read(input, { type: 'array', cellDates: true, dense: true })
}

/**
 * Parse an .xlsx, .xls, .csv or .tsv file. Every non-empty sheet is returned with its detected
 * header row and data rows. Throws `WorkbookReadError` with a plain message when the file can't
 * be read.
 */
export function readWorkbook(input: ArrayBuffer | Uint8Array, fileName: string): ParsedWorkbook {
  const format = formatOf(fileName)
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let book: XLSX.WorkBook
  try {
    book = readBook(bytes, format)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (/password/i.test(msg))
      throw new WorkbookReadError(
        `"${fileName}" is password protected. Remove the password in Excel and try again.`,
        { cause: err },
      )
    throw new WorkbookReadError(`"${fileName}" could not be read. Save it as .xlsx or .csv and try again.`, {
      cause: err,
    })
  }
  const sheets: ParsedSheet[] = []
  const emptySheets: string[] = []
  for (const name of book.SheetNames) {
    const ws = book.Sheets[name]
    const ref = ws?.['!ref']
    const sheet = ref
      ? toSheet(
          name,
          XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            raw: true,
            defval: null,
            blankrows: true,
            UTC: true,
          }),
          XLSX.utils.decode_range(ref).s.r,
        )
      : null
    if (sheet) sheets.push(sheet)
    else emptySheets.push(name)
  }
  return { fileName, format, sheets, emptySheets }
}

/** Build a ParsedSheet from rows already in memory (pasted tables, tests). */
export function sheetFromRows(name: string, aoa: unknown[][]): ParsedSheet | null {
  return toSheet(name, aoa, 0)
}
