/**
 * Read an Excel or CSV file into header-keyed rows with SheetJS.
 *
 * Workbook cells keep their types (numbers, text, dates as UTC Date objects). Text files are read
 * raw, so "03/04/2026" stays text and the importer decides the day order per column instead of
 * SheetJS assuming month-first. Title rows above the header are skipped by header detection.
 */
import * as XLSX from 'xlsx'
import { toSheet } from './sheet'
import type { FileFormat, ParsedSheet, ParsedWorkbook } from './types'

export { dedupeHeaders, detectHeaderRow, sheetFromRows } from './sheet'

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
