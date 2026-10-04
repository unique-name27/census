/**
 * Styled Excel workbooks with ExcelJS (loaded on demand, so it never weighs on first paint).
 *
 * Every sheet carries a small title block (title, subtitle, view and scope line, confidentiality
 * stamp), then a bold header row with a bottom rule, frozen panes, an autofilter, real Excel
 * dates, number formats from each column's `format`, and widths fitted to the content.
 */
import type { CellValue, Workbook, Worksheet } from 'exceljs'
import type { Column, ExportMeta } from '@/charts/types'
import { excelNumFmt, type Format, fmt } from '@/lib/format'
import {
  cellFormat,
  columnFormat,
  exportNumber,
  isNumericFormat,
  sampleRow,
  sampleValue,
  visibleColumns,
} from './columns'
import { definitionsLineFor } from './definitions'
import { downloadBlob, MIME } from './download'
import { dataLine, fileStem, metaLine, stampLine, viewLine } from './names'
import type { ExportOptions, ExportTable } from './types'
import { exportNote } from './withheld'

type ExcelModule = typeof import('exceljs')

let excel: Promise<ExcelModule> | null = null
/** ExcelJS ships as CommonJS; the namespace lands on `default` in browsers and in Node. */
export function loadExcel(): Promise<ExcelModule> {
  excel ??= import('exceljs').then((m) => (m as unknown as { default?: ExcelModule }).default ?? m)
  return excel
}

/** Census ink and rule colors as ARGB. */
export const XL = {
  ink: 'FF12151A',
  ink2: 'FF475060',
  muted: 'FF737B8A',
  rule: 'FFDDE1E7',
  ruleStrong: 'FFC3C9D2',
  link: 'FF1C5CAB',
} as const

const INVALID_SHEET_CHARS = /[[\]:*?/\\]/g

/** Excel sheet rules: at most 31 characters, none of []:*?/\, no leading or trailing apostrophe. */
export function sanitizeSheetName(name: string): string {
  const cleaned = name
    .replace(INVALID_SHEET_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .trim()
  const base = cleaned || 'Sheet'
  const safe = base.toLowerCase() === 'history' ? `${base} (1)` : base
  return safe.slice(0, 31).trim()
}

/** Sanitize and de-duplicate (case-insensitively, as Excel does) a list of sheet names. */
export function uniqueSheetNames(names: readonly string[]): string[] {
  const used = new Set<string>()
  return names.map((n) => {
    const base = sanitizeSheetName(n)
    let candidate = base
    for (let k = 2; used.has(candidate.toLowerCase()); k++) {
      const suffix = ` (${k})`
      candidate = `${base.slice(0, 31 - suffix.length).trimEnd()}${suffix}`
    }
    used.add(candidate.toLowerCase())
    return candidate
  })
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/

/**
 * A JS value as an Excel cell value: real dates for date columns, empty for missing, never NaN.
 * Numbers are stored rounded to their format's export precision (`exportNumber`), not just
 * displayed rounded.
 */
export function excelValue(v: unknown, format: Format | undefined): CellValue {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? exportNumber(v, format) : null
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'string') {
    if (format === 'date') {
      const m = ISO_DATE.exec(v)
      if (m) {
        const t = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
        if (Number.isFinite(t)) return new Date(t)
      }
    }
    return v
  }
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

/**
 * Number format for a column (or, with a per-row format, for the cell of `row`); unformatted
 * numeric columns get a sensible default.
 */
export function numFmtFor(column: Pick<Column, 'format'>, sample: unknown, row?: object): string | undefined {
  return excelNumFmt(columnFormat(column, sample, row))
}

const WIDTH_MIN = 8
const WIDTH_MAX = 48

/**
 * Column width in characters from the header and the formatted values (first 500 rows). `format`
 * is the column's format, or one format per value for columns formatted per row.
 */
export function columnWidth(
  label: string,
  values: readonly unknown[],
  format: Format | readonly Format[],
): number {
  let max = label.length
  values.slice(0, 500).forEach((v, i) => {
    if (v == null) return
    const f = typeof format === 'string' ? format : (format[i] ?? 'text')
    const text = typeof v === 'string' && f !== 'date' ? v : fmt(v, f)
    if (text.length > max) max = text.length
  })
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, max + 2))
}

export interface SheetLayout {
  ws: Worksheet
  /** 1-based row of the column headers. */
  headerRow: number
  /** 1-based last data row (equals headerRow when there are no rows). */
  lastRow: number
  columnCount: number
}

/** Write one table into a new worksheet with the Census title block and table styling. */
export function addTableSheet(
  wb: Workbook,
  sheetName: string,
  table: ExportTable,
  meta: ExportMeta,
  opts: { showPay: boolean },
): SheetLayout {
  const cols = visibleColumns(table.columns, opts.showPay)
  const ws = wb.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 16 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  // Title block
  const block: { text: string; size: number; bold?: boolean; color: string; italic?: boolean }[] = [
    { text: table.title ?? table.name, size: 14, bold: true, color: XL.ink },
  ]
  if (table.subtitle) block.push({ text: table.subtitle, size: 10, color: XL.ink2 })
  block.push({ text: [viewLine(meta), metaLine(meta)].filter(Boolean).join(' · '), size: 9, color: XL.muted })
  const data = dataLine(meta.standard, table.tier, table.withheld)
  if (data) block.push({ text: data, size: 9, color: XL.ink2 })
  const definitions = definitionsLineFor(meta)
  if (definitions) block.push({ text: definitions, size: 9, color: XL.ink2 })
  block.push({ text: stampLine(meta), size: 9, color: XL.muted, bold: true })
  // A withheld table prints no note: notes usually carry the numbers the standard hides.
  const note = exportNote(table)
  if (note) block.push({ text: note, size: 9, color: XL.muted, italic: true })
  block.forEach((line, i) => {
    const cell = ws.getCell(i + 1, 1)
    cell.value = line.text
    cell.font = { size: line.size, bold: line.bold, italic: line.italic, color: { argb: line.color } }
  })
  ws.getRow(1).height = 22

  const headerRow = block.length + 2
  const samples = cols.map((c) => sampleValue(table.rows, c.key))
  const formats = cols.map((c, i) => columnFormat(c, samples[i], sampleRow(table.rows, c.key)))
  // Per-row formats resolve per cell (e.g. a value column mixing rates and day counts).
  const perRow = cols.map((c) => typeof c.format === 'function')
  const formatAt = (i: number, row: Record<string, unknown>) =>
    perRow[i] ? cellFormat(cols[i], row, formats[i]) : formats[i]

  // Header
  const hr = ws.getRow(headerRow)
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = c.label
    cell.font = { bold: true, size: 10, color: { argb: XL.ink } }
    cell.border = { bottom: { style: 'thin', color: { argb: XL.ink } } }
    cell.alignment = {
      vertical: 'bottom',
      horizontal: isNumericFormat(formats[i]) || c.align === 'right' ? 'right' : 'left',
      wrapText: true,
    }
  })
  hr.height = 20

  // Body
  table.rows.forEach((row, r) => {
    const xr = ws.getRow(headerRow + 1 + r)
    cols.forEach((c, i) => {
      const cell = xr.getCell(i + 1)
      const f = formatAt(i, row)
      cell.value = excelValue(row[c.key], f)
      cell.font = { size: 10, color: { argb: XL.ink } }
      const nf = excelNumFmt(f)
      if (nf) cell.numFmt = nf
      if (c.align) cell.alignment = { horizontal: c.align }
    })
  })
  if (!table.rows.length) {
    const cell = ws.getCell(headerRow + 1, 1)
    cell.value = 'No rows in this table.'
    cell.font = { size: 10, italic: true, color: { argb: XL.muted } }
  }

  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = columnWidth(
      c.label,
      table.rows.map((r) => r[c.key]),
      perRow[i] ? table.rows.map((r) => formatAt(i, r)) : formats[i],
    )
  })

  const lastRow = headerRow + table.rows.length
  ws.views = [
    {
      state: 'frozen',
      xSplit: 0,
      ySplit: headerRow,
      topLeftCell: `A${headerRow + 1}`,
      activeCell: `A${headerRow + 1}`,
    },
  ]
  if (cols.length && table.rows.length) {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: cols.length } }
  }
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`
  ws.headerFooter.oddFooter = `&L&8${stampLine(meta).replace(/&/g, '&&')}&R&8Page &P of &N`
  return { ws, headerRow, lastRow, columnCount: cols.length }
}

export async function newWorkbook(meta: ExportMeta, title: string): Promise<Workbook> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Census'
  wb.created = new Date()
  wb.title = title
  wb.company = meta.company
  wb.subject = metaLine(meta)
  return wb
}

/** Build (without downloading) a workbook with one sheet per table. */
export async function buildWorkbook(
  tables: readonly ExportTable[],
  meta: ExportMeta,
  opts: { showPay: boolean },
): Promise<Workbook> {
  const wb = await newWorkbook(meta, tables[0]?.title ?? tables[0]?.name ?? 'Census export')
  const names = uniqueSheetNames(tables.map((t) => t.name))
  tables.forEach((t, i) => {
    addTableSheet(wb, names[i], t, meta, opts)
  })
  return wb
}

export async function saveWorkbook(wb: Workbook, fileName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buffer], { type: MIME.xlsx }), `${fileName}.xlsx`)
}

/** Download tables as a styled workbook, one sheet each. */
export async function downloadXlsx(
  tables: readonly ExportTable[],
  meta: ExportMeta,
  opts: ExportOptions,
): Promise<void> {
  const wb = await buildWorkbook(tables, meta, opts)
  await saveWorkbook(wb, opts.fileName ?? fileStem(meta, tables[0]?.name ?? 'export'))
}
