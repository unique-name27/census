/**
 * Excel templates and dataset exports (ExcelJS, loaded on demand).
 *
 * A template has one sheet per dataset with the field labels as headers (required ones marked
 * "*"), dropdowns for list fields, real Excel dates, and two help sheets: "Read me" and "Fields".
 * A dataset export writes the same layout with the current rows, so it can be edited and
 * uploaded again unchanged.
 */
import type { DataValidation, Workbook, Worksheet } from 'exceljs'
import {
  DATASET_KEYS,
  DATASETS,
  type DatasetDef,
  type DatasetKey,
  type Datasets,
  type FieldDef,
  LEVELS,
  type ViewKey,
} from '../schema'

type ExcelModule = typeof import('exceljs')

async function loadExcel(): Promise<ExcelModule> {
  const mod = await import('exceljs')
  // The browser bundle arrives as a CommonJS default export; Node also exposes named exports.
  return ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const VIEW_LABELS: Record<ViewKey, string> = {
  recruiting: 'Recruiting',
  hrbp: 'People stats',
  org: 'Org chart',
  services: 'HR ops',
  talent: 'Talent',
  comp: 'Compensation',
  ai: 'AI in HR',
}

const TYPE_LABELS: Record<FieldDef['type'], string> = {
  string: 'Text',
  id: 'ID',
  date: 'Date',
  datetime: 'Date and time',
  number: 'Number',
  percent: 'Percent',
  money: 'Amount',
  boolean: 'Yes or no',
  enum: 'List',
  level: 'Level',
}

const NUM_FMT: Partial<Record<FieldDef['type'], string>> = {
  date: 'yyyy-mm-dd',
  datetime: 'yyyy-mm-dd hh:mm',
  percent: '0.0%',
  money: '#,##0',
}

const INK = 'FF1F2933'
const FILL_REQUIRED = 'FFDDE3EA'
const FILL_RECOMMENDED = 'FFE9EDF2'
const FILL_OPTIONAL = 'FFF4F6F8'
const RULE = 'FF9AA5B1'

/** Rows below the data that still get dropdowns, so new rows typed in the template validate too. */
const VALIDATION_SPARE_ROWS = 500

const headerLabel = (f: FieldDef) => (f.required ? `${f.label} *` : f.label)
const requirement = (f: FieldDef) => (f.required ? 'Required' : f.recommended ? 'Recommended' : 'Optional')

function allowedValues(dataset: DatasetKey, f: FieldDef): string {
  if (f.type === 'enum') return (f.values ?? []).join(', ')
  if (f.type === 'level')
    return `${LEVELS.join(', ')}. Titles such as Senior, Staff, Director or VP are converted.`
  if (f.type === 'boolean') return 'Yes, No'
  if (dataset === 'reviews' && /rating/i.test(f.key)) return '1-5, or labels such as Meets or Exceeds'
  return ''
}

function listFor(f: FieldDef): readonly string[] | null {
  if (f.type === 'enum') return f.values ?? null
  if (f.type === 'level') return LEVELS
  if (f.type === 'boolean') return ['Yes', 'No']
  return null
}

const ISO_DT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/

/** A record value as an Excel cell value: dates as real dates, yes/no as words. */
function toCell(f: FieldDef, v: unknown, payValues: boolean): string | number | Date | null {
  if (v == null || v === '') return null
  if (f.pay && !payValues) return null
  if ((f.type === 'date' || f.type === 'datetime') && typeof v === 'string') {
    const m = ISO_DT.exec(v)
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)) : v
  }
  if (f.type === 'boolean') return v === true ? 'Yes' : v === false ? 'No' : String(v)
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  return String(v)
}

function widthFor(f: FieldDef, rows: readonly Record<string, unknown>[]): number {
  if (f.type === 'date') return Math.max(12, headerLabel(f).length + 3)
  if (f.type === 'datetime') return Math.max(17, headerLabel(f).length + 3)
  let w = headerLabel(f).length + 3
  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    const v = rows[i][f.key]
    if (v != null) w = Math.max(w, String(v).length + 2)
  }
  return Math.min(40, Math.max(10, w))
}

/** ExcelJS supports range validations through `worksheet.dataValidations`, which its typings omit. */
interface RangeValidations {
  dataValidations: { add(range: string, validation: DataValidation): void }
}

function columnLetter(n: number): string {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}

function styleHeaderRow(ws: Worksheet, fills: string[]): void {
  const row = ws.getRow(1)
  row.height = 20
  row.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: INK } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[col - 1] ?? FILL_OPTIONAL } }
    cell.alignment = { vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: RULE } } }
  })
}

function addDatasetSheet(
  wb: Workbook,
  def: DatasetDef,
  fields: FieldDef[],
  rows: readonly Record<string, unknown>[],
  payValues: boolean,
): Worksheet {
  const ws = wb.addWorksheet(def.sheet, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = fields.map((f) => ({
    header: headerLabel(f),
    key: f.key,
    width: widthFor(f, rows),
    style: NUM_FMT[f.type] ? { numFmt: NUM_FMT[f.type] } : {},
  }))
  styleHeaderRow(
    ws,
    fields.map((f) => (f.required ? FILL_REQUIRED : f.recommended ? FILL_RECOMMENDED : FILL_OPTIONAL)),
  )
  fields.forEach((f, i) => {
    const allowed = allowedValues(def.key, f)
    ws.getRow(1).getCell(i + 1).note = [
      f.description,
      `${requirement(f)}.`,
      allowed ? `Allowed: ${allowed}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  })
  ws.addRows(rows.map((r) => fields.map((f) => toCell(f, r[f.key], payValues))))
  if (fields.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length } }

  const lastRow = rows.length + 1 + VALIDATION_SPARE_ROWS
  fields.forEach((f, i) => {
    const list = listFor(f)
    if (!list) return
    const col = columnLetter(i + 1)
    ;(ws as unknown as RangeValidations).dataValidations.add(`${col}2:${col}${lastRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${list.join(',')}"`],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: `Check ${f.label.toLowerCase()}`,
      error: `Census expects one of: ${list.join(', ')}. Other values are checked when you upload.`,
    })
  })
  return ws
}

function addFieldsSheet(wb: Workbook, defs: DatasetDef[], includePay: boolean): void {
  const ws = wb.addWorksheet('Fields', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Sheet', key: 'sheet', width: 18 },
    { header: 'Column', key: 'column', width: 26 },
    { header: 'Requirement', key: 'requirement', width: 14 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Allowed values', key: 'allowed', width: 48 },
    { header: 'Description', key: 'description', width: 80 },
    { header: 'Pay amount', key: 'pay', width: 12 },
  ]
  styleHeaderRow(ws, [])
  for (const def of defs)
    for (const f of def.fields) {
      if (f.pay && !includePay) continue
      ws.addRow({
        sheet: def.sheet,
        column: headerLabel(f),
        requirement: requirement(f),
        type: TYPE_LABELS[f.type],
        allowed: allowedValues(def.key, f),
        description: f.description,
        pay: f.pay ? 'Yes' : '',
      })
    }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } }
}

const GUIDANCE = [
  'Keep the header row as it is. Columns marked * are required; rows without them are skipped and listed in the import log.',
  'Dates can be real Excel dates or text such as 2026-09-30. Day-first dates (30/09/2026) are detected per column.',
  'Percentages can be typed as 3.5% or 0.035. A column of whole numbers such as 3.5 is read as 3.5%.',
  'Yes or no columns accept Yes, No, Y, N, True, False, 1 and 0.',
  'Levels use L1-L6, M1-M2 and E1-E3. Common titles such as Senior, Staff, Director and VP are converted.',
  'Leave a cell blank when the value is unknown rather than typing a placeholder such as TBD.',
  'Pay amounts (salary, ranges, equity, market median) only appear in Census when pay amounts are switched on.',
  'The file stays on this computer. Census reads it in the browser and never uploads it.',
]

function addReadMe(wb: Workbook, title: string, intro: string[], defs: DatasetDef[]): void {
  const ws = wb.addWorksheet('Read me')
  ws.columns = [{ width: 22 }, { width: 70 }, { width: 44 }, { width: 44 }]
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: INK } }
  for (const line of intro) ws.addRow([line])
  ws.addRow([])
  ws.addRow(['How to fill it in']).font = { bold: true, color: { argb: INK } }
  for (const line of GUIDANCE) ws.addRow([line])
  ws.addRow([])
  const head = ws.addRow(['Sheet', 'What it holds', 'Required columns', 'Used by'])
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: INK } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_REQUIRED } }
  })
  for (const def of defs) {
    const row = ws.addRow([
      def.sheet,
      def.description,
      def.fields
        .filter((f) => f.required)
        .map((f) => f.label)
        .join(', '),
      def.usedBy.map((v) => VIEW_LABELS[v]).join(', '),
    ])
    row.alignment = { vertical: 'top', wrapText: true }
  }
  ws.addRow([])
  ws.addRow(['See the Fields sheet for every column, its type and the values it accepts.'])
  ws.addRow(['Company confidential.']).font = { italic: true }
}

async function toBlob(wb: Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: XLSX_MIME })
}

const today = () => new Date().toISOString().slice(0, 10)

export interface TemplateOptions {
  /** Datasets to include, in this order; all ten by default. */
  datasets?: DatasetKey[]
  /** Example rows to pre-fill (e.g. the sample company). */
  sample?: Datasets
  /** Example rows per sheet when `sample` is given (default 20). */
  sampleRows?: number
  /** Write pay amounts in the example rows. Pay columns are always present; their cells stay blank unless this is true. */
  includePay?: boolean
}

/** Build the upload template workbook. */
export async function buildTemplateWorkbook(opts: TemplateOptions = {}): Promise<Blob> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Census'
  wb.created = new Date()
  const keys = opts.datasets ?? DATASET_KEYS
  const defs = keys.map((k) => DATASETS.find((d) => d.key === k)).filter((d): d is DatasetDef => !!d)
  const limit = opts.sampleRows ?? 20
  addReadMe(
    wb,
    'Census data template',
    [
      `Prepared ${today()}. Fill one sheet per dataset, then upload the file in the Data room.`,
      'Census recognizes each sheet by its columns, so sheets can be renamed, removed or reordered.',
    ],
    defs,
  )
  for (const def of defs) {
    const rows = (opts.sample?.[def.key] ?? []).slice(0, Math.max(0, limit)) as unknown as Record<
      string,
      unknown
    >[]
    addDatasetSheet(wb, def, def.fields, rows, !!opts.includePay)
  }
  addFieldsSheet(wb, defs, true)
  return toBlob(wb)
}

/** One dataset's current rows as a workbook that can be edited and uploaded again. */
export async function exportDatasetWorkbook<K extends DatasetKey>(
  key: K,
  rows: readonly Datasets[K][number][],
  opts: { includePay: boolean },
): Promise<Blob> {
  const ExcelJS = await loadExcel()
  const def = DATASETS.find((d) => d.key === key)
  if (!def) throw new Error(`Unknown dataset ${key}`)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Census'
  wb.created = new Date()
  const fields = def.fields.filter((f) => opts.includePay || !f.pay)
  addDatasetSheet(wb, def, fields, rows as unknown as Record<string, unknown>[], opts.includePay)
  addFieldsSheet(wb, [def], opts.includePay)
  addReadMe(
    wb,
    `Census export: ${def.label}`,
    [
      `${rows.length.toLocaleString('en-US')} rows exported ${today()}.`,
      opts.includePay
        ? 'Pay amounts are included. Handle this file as confidential pay data.'
        : 'Pay amounts are left out. Switch on pay amounts in Census to include them.',
      'Edit the rows and upload the file again in the Data room to replace this dataset.',
    ],
    [def],
  )
  return toBlob(wb)
}
