/**
 * The "Metric dictionary" workbook: every metric on a Metrics sheet (one row each, with its
 * wording and target) and every setting on a Settings sheet (one row each, with its default and
 * the value in force). People can edit the wording, targets and current values in Excel and
 * import the file back; each value is validated on its own and the import reports what it changed.
 */
import type { CellValue, Workbook, Worksheet } from 'exceljs'
import { formatDate, todayISO } from '@/lib/dates'
import { loadExcel, saveWorkbook, XL } from '@/lib/export/xlsx'
import { excelNumFmt, type Format } from '@/lib/format'
import { applyImport } from './imports'
import {
  allowedText,
  formatParam,
  isNumericParam,
  paramFormat,
  parseParamInput,
  parseParamNumber,
} from './params'
import { fieldLabel, METRIC_VIEW_LABEL, type MetricCatalog, paramField } from './registry'
import type {
  MetricDef,
  MetricEdit,
  MetricImportReport,
  MetricsApi,
  MetricsState,
  MetricTarget,
  ParamDef,
  RejectedValue,
  TextField,
} from './types'

export const METRICS_SHEET = 'Metrics'
export const SETTINGS_SHEET = 'Settings'

/** Units in words, for the Unit column. */
const UNIT_LABEL: Partial<Record<Format, string>> = {
  int: 'count',
  compact: 'count',
  num1: 'number',
  num2: 'number',
  pct: '%',
  pct0: '%',
  pct2: '%',
  pts: 'pts',
  pts2: 'pts',
  deltaDays: 'd',
  deltaPct: '%',
  money: 'USD',
  moneyFull: 'USD',
  days: 'd',
  hours: 'h',
  years: 'yrs',
  ratio: 'ratio',
  times: '×',
  date: 'date',
  text: 'text',
}

interface Col {
  key: string
  label: string
  width: number
  /** People may edit it; the import reads it. */
  editable?: boolean
  wrap?: boolean
}

const METRIC_COLS: readonly Col[] = [
  { key: 'id', label: 'Metric ID', width: 30 },
  { key: 'name', label: 'Name', width: 26 },
  { key: 'views', label: 'Views', width: 22, wrap: true },
  { key: 'definition', label: 'Definition', width: 60, editable: true, wrap: true },
  { key: 'formula', label: 'Formula', width: 36, editable: true, wrap: true },
  { key: 'population', label: 'Population', width: 36, editable: true, wrap: true },
  { key: 'window', label: 'Window', width: 22, wrap: true },
  { key: 'unit', label: 'Unit', width: 8 },
  { key: 'goodDirection', label: 'Good direction', width: 12 },
  { key: 'targetRule', label: 'Target rule', width: 12, editable: true },
  { key: 'targetValue', label: 'Target value', width: 12, editable: true },
  { key: 'owner', label: 'Owner', width: 18, editable: true },
  { key: 'uses', label: 'Data used', width: 40, wrap: true },
  { key: 'changed', label: 'Changed from default', width: 22, wrap: true },
]

const SETTING_COLS: readonly Col[] = [
  { key: 'id', label: 'Metric ID', width: 30 },
  { key: 'metric', label: 'Metric', width: 26 },
  { key: 'key', label: 'Setting key', width: 18 },
  { key: 'label', label: 'Setting', width: 28 },
  { key: 'description', label: 'Description', width: 50, wrap: true },
  { key: 'allowed', label: 'Allowed values', width: 26, wrap: true },
  { key: 'default', label: 'Default', width: 22 },
  { key: 'current', label: 'Current value', width: 22, editable: true },
  { key: 'changed', label: 'Changed', width: 10 },
]

const TARGET_RULE: Record<MetricTarget['comparator'], string> = {
  '>=': 'At least',
  '<=': 'At most',
  '<': 'Under',
}

/** A setting's number format in Excel; shares show up to two decimals ("3.5%", "0.25%"). */
function paramNumFmt(def: ParamDef): string | undefined {
  if (def.type === 'months') return '0" months"'
  const f = paramFormat(def)
  if (f === 'pct' || f === 'pct0' || f === 'pct2') return '0.0#%'
  if (f === 'days') return '#,##0" d"'
  return excelNumFmt(f)
}

/** A setting's value as an Excel cell: a number for numbers, words for the rest. */
function paramCell(def: ParamDef, value: unknown): CellValue {
  if (value == null) return null
  if (isNumericParam(def) && typeof value === 'number') return value
  return formatParam(def, value as never)
}

const isPct = (f: Format) => f === 'pct' || f === 'pct0' || f === 'pct2'

function targetNumFmt(def: MetricDef): string | undefined {
  return isPct(def.unit) ? '0.0#%' : excelNumFmt(def.unit === 'text' ? undefined : def.unit)
}

function titleBlock(
  ws: Worksheet,
  lines: { text: string; size: number; bold?: boolean; color: string; italic?: boolean }[],
) {
  lines.forEach((l, i) => {
    const cell = ws.getCell(i + 1, 1)
    cell.value = l.text
    cell.font = { size: l.size, bold: l.bold, italic: l.italic, color: { argb: l.color } }
  })
  ws.getRow(1).height = 22
  return lines.length + 2
}

function writeTable(
  ws: Worksheet,
  headerRow: number,
  cols: readonly Col[],
  rows: Record<string, CellValue>[],
  fmts: Record<string, string | undefined>[],
) {
  const hr = ws.getRow(headerRow)
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = c.label
    cell.font = { bold: true, size: 10, color: { argb: XL.ink } }
    cell.border = { bottom: { style: 'thin', color: { argb: XL.ink } } }
    cell.alignment = { vertical: 'bottom', wrapText: true }
    ws.getColumn(i + 1).width = c.width
  })
  hr.height = 20
  rows.forEach((row, r) => {
    const xr = ws.getRow(headerRow + 1 + r)
    cols.forEach((c, i) => {
      const cell = xr.getCell(i + 1)
      cell.value = row[c.key] ?? null
      cell.font = { size: 10, color: { argb: c.editable ? XL.ink : XL.ink2 } }
      cell.alignment = { vertical: 'top', wrapText: !!c.wrap }
      const nf = fmts[r]?.[c.key]
      if (nf) cell.numFmt = nf
    })
  })
  const lastRow = headerRow + rows.length
  ws.views = [
    {
      state: 'frozen',
      xSplit: 1,
      ySplit: headerRow,
      topLeftCell: `B${headerRow + 1}`,
      activeCell: `B${headerRow + 1}`,
    },
  ]
  if (rows.length)
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: cols.length } }
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`
}

export interface DictionaryMeta {
  /** Company name for the workbook properties. */
  company?: string
  /** "Sample data" joins the confidentiality stamp. */
  isSample?: boolean
  now?: Date
}

/** The dictionary as a styled workbook: Metrics and Settings sheets. */
export async function buildDictionaryWorkbook(api: MetricsApi, meta: DictionaryMeta = {}): Promise<Workbook> {
  const ExcelJS = await loadExcel()
  const now = meta.now ?? new Date()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Census'
  wb.created = now
  wb.title = 'Metric dictionary'
  if (meta.company) wb.company = meta.company
  const stamp = meta.isSample ? 'Company confidential · Sample data' : 'Company confidential'
  const changed = api.changedCount
  const exported = `Exported ${formatDate(now.toISOString().slice(0, 10))} · Definitions changed from defaults: ${changed.toLocaleString('en-US')}`

  /* Metrics */
  const ms = wb.addWorksheet(METRICS_SHEET, {
    properties: { defaultRowHeight: 16 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const mHeader = titleBlock(ms, [
    { text: 'Metric dictionary', size: 14, bold: true, color: XL.ink },
    { text: exported, size: 9, color: XL.muted },
    {
      text: 'Edit Definition, Formula, Population, Target rule (At least or At most), Target value and Owner, then import this file in Data room > Metric definitions.',
      size: 9,
      color: XL.ink2,
      italic: true,
    },
    { text: stamp, size: 9, color: XL.muted, bold: true },
  ])
  const metricRows: Record<string, CellValue>[] = []
  const metricFmts: Record<string, string | undefined>[] = []
  for (const d of api.list) {
    const fields = api.changedFields(d.id)
    metricRows.push({
      id: d.id,
      name: d.name,
      views: d.views.map((v) => METRIC_VIEW_LABEL[v] ?? v).join(', '),
      definition: d.definition,
      formula: d.formula ?? null,
      population: d.population ?? null,
      window: d.window ?? null,
      unit: UNIT_LABEL[d.unit] ?? d.unit,
      goodDirection: d.goodDirection === 'up' ? 'Up' : d.goodDirection === 'down' ? 'Down' : 'Neutral',
      targetRule: d.target ? TARGET_RULE[d.target.comparator] : null,
      targetValue: d.target ? d.target.value : null,
      owner: d.owner ?? null,
      uses: d.uses.join(', '),
      changed: fields.length ? fields.map((f) => fieldLabel(d, f)).join(', ') : null,
    })
    metricFmts.push({ targetValue: targetNumFmt(d) })
  }
  writeTable(ms, mHeader, METRIC_COLS, metricRows, metricFmts)

  /* Settings */
  const ss = wb.addWorksheet(SETTINGS_SHEET, {
    properties: { defaultRowHeight: 16 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const sHeader = titleBlock(ss, [
    { text: 'Metric settings', size: 14, bold: true, color: XL.ink },
    { text: exported, size: 9, color: XL.muted },
    {
      text: 'Edit Current value, then import this file in Data room > Metric definitions. Shares are percents; locked settings keep their value.',
      size: 9,
      color: XL.ink2,
      italic: true,
    },
    { text: stamp, size: 9, color: XL.muted, bold: true },
  ])
  const settingRows: Record<string, CellValue>[] = []
  const settingFmts: Record<string, string | undefined>[] = []
  for (const d of api.list)
    for (const p of d.params) {
      const current = api.param(d.id, p.key)
      const nf = isNumericParam(p) ? paramNumFmt(p) : undefined
      settingRows.push({
        id: d.id,
        metric: d.name,
        key: p.key,
        label: p.label,
        description: p.description,
        allowed: allowedText(p),
        default: paramCell(p, p.default),
        current: paramCell(p, current),
        changed: api.changedFields(d.id).includes(paramField(p.key)) ? 'Yes' : null,
      })
      settingFmts.push({ default: nf, current: nf })
    }
  writeTable(ss, sHeader, SETTING_COLS, settingRows, settingFmts)
  return wb
}

export const dictionaryFileName = (today: string = todayISO()): string => `census-metric-dictionary-${today}`

/** Download the dictionary workbook. */
export async function downloadMetricDictionary(api: MetricsApi, meta: DictionaryMeta = {}): Promise<void> {
  const wb = await buildDictionaryWorkbook(api, meta)
  await saveWorkbook(wb, dictionaryFileName())
}

/* ───────────── reading a dictionary back ───────────── */

type Plain = string | number | boolean | null

/** A cell's value as plain data (rich text joined, formulas by their result, dates as ISO). */
export function plainCell(v: CellValue | undefined): Plain {
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>
    if (Array.isArray(o.richText))
      return (o.richText as { text?: string }[]).map((t) => t.text ?? '').join('')
    if ('result' in o) return plainCell(o.result as CellValue)
    if (typeof o.text === 'string') return o.text
  }
  return null
}

export interface DictionaryRow {
  sheet: string
  /** 1-based row in the sheet. */
  row: number
  /** Values by column key; a key is absent when the sheet has no such column. */
  cells: Partial<Record<string, Plain>>
}

export interface ParsedDictionary {
  metrics: DictionaryRow[] | null
  settings: DictionaryRow[] | null
}

function readSheet(ws: Worksheet | undefined, cols: readonly Col[]): DictionaryRow[] | null {
  if (!ws) return null
  const byLabel = new Map(cols.map((c) => [c.label.toLowerCase(), c.key]))
  let header = 0
  const keys = new Map<number, string>()
  for (let r = 1; r <= Math.min(ws.rowCount, 25) && !header; r++) {
    const row = ws.getRow(r)
    row.eachCell((cell, col) => {
      const text = plainCell(cell.value)
      if (typeof text === 'string' && text.trim().toLowerCase() === 'metric id') header = r
      const key = typeof text === 'string' ? byLabel.get(text.trim().toLowerCase()) : undefined
      if (key) keys.set(col, key)
    })
    if (!header) keys.clear()
  }
  if (!header) return null
  const out: DictionaryRow[] = []
  for (let r = header + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: Partial<Record<string, Plain>> = {}
    for (const [col, key] of keys) cells[key] = plainCell(row.getCell(col).value)
    const id = cells.id
    if (typeof id === 'string' && id.trim()) out.push({ sheet: ws.name, row: r, cells })
  }
  return out
}

/** The Metrics and Settings rows of a dictionary workbook (null for a sheet that is missing). */
export async function readDictionaryWorkbook(data: ArrayBuffer | Uint8Array): Promise<ParsedDictionary> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  const buffer =
    data instanceof Uint8Array
      ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
      : data
  await wb.xlsx.load(buffer)
  const find = (name: string) => wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase())
  return {
    metrics: readSheet(find(METRICS_SHEET), METRIC_COLS),
    settings: readSheet(find(SETTINGS_SHEET), SETTING_COLS),
  }
}

const text = (v: Plain | undefined): string => (v == null ? '' : typeof v === 'string' ? v : String(v))
const shown = (v: Plain | undefined): string =>
  v == null ? '' : typeof v === 'number' ? String(+v.toPrecision(12)) : String(v)

function targetRule(v: Plain | undefined): MetricTarget['comparator'] | null | undefined {
  const w = text(v).trim().toLowerCase()
  if (!w) return null
  if (['at least', '>=', '≥', 'min', 'minimum', 'above'].includes(w)) return '>='
  if (['at most', '<=', '≤', 'max', 'maximum', 'below'].includes(w)) return '<='
  if (['under', '<', 'less than'].includes(w)) return '<'
  return undefined
}

interface Planned {
  edit: MetricEdit
  where: Pick<RejectedValue, 'sheet' | 'row' | 'value'>
}

/**
 * The changes a dictionary workbook asks for, field by field. Only the editable columns are read;
 * a column missing from the sheet changes nothing. Rows for metrics Census doesn't know are skipped.
 */
export function planDictionaryImport(
  parsed: ParsedDictionary,
  catalog: MetricCatalog,
): { planned: Planned[]; rejected: RejectedValue[]; unknown: string[] } {
  const planned: Planned[] = []
  const rejected: RejectedValue[] = []
  const unknown = new Set<string>()

  for (const r of parsed.metrics ?? []) {
    const id = text(r.cells.id).trim()
    const def = catalog.byId.get(id)
    if (!def) {
      unknown.add(id)
      continue
    }
    const where = (value: Plain | undefined) => ({ sheet: r.sheet, row: r.row, value: shown(value) })
    for (const f of ['definition', 'formula', 'population', 'owner'] as TextField[]) {
      if (!(f in r.cells)) continue
      planned.push({
        edit: { metricId: id, field: f, value: text(r.cells[f]).trim() },
        where: where(r.cells[f]),
      })
    }
    if ('targetRule' in r.cells && 'targetValue' in r.cells) {
      const rule = targetRule(r.cells.targetRule)
      const raw = r.cells.targetValue
      const blank = raw == null || text(raw).trim() === ''
      const at = where(blank ? r.cells.targetRule : raw)
      if (rule === undefined)
        rejected.push({
          metricId: id,
          field: 'target',
          reason: 'Target rule: write "At least" or "At most".',
          ...at,
        })
      else if (rule === null && blank)
        planned.push({ edit: { metricId: id, field: 'target', value: null }, where: at })
      else if (rule === null || blank)
        rejected.push({
          metricId: id,
          field: 'target',
          reason: 'Give both a target rule and a target value, or leave both blank.',
          ...at,
        })
      else {
        const value = parseParamNumber(raw, {
          type: 'number',
          format: def.unit,
          max: isPct(def.unit) ? 1 : undefined,
        })
        if (value == null)
          rejected.push({
            metricId: id,
            field: 'target',
            reason: `Target value: "${shown(raw)}" is not a number.`,
            ...at,
          })
        else
          planned.push({
            edit: { metricId: id, field: 'target', value: { value, comparator: rule } },
            where: at,
          })
      }
    }
  }

  for (const r of parsed.settings ?? []) {
    const id = text(r.cells.id).trim()
    const key = text(r.cells.key).trim()
    const def = catalog.byId.get(id)
    if (!def) {
      unknown.add(id)
      continue
    }
    if (!('current' in r.cells)) continue
    const raw = r.cells.current
    const at = { sheet: r.sheet, row: r.row, value: shown(raw) }
    const p = def.params.find((x) => x.key === key)
    if (!p) {
      rejected.push({
        metricId: id,
        field: paramField(key),
        reason: `${def.name} has no setting called ${key || 'that'}.`,
        ...at,
      })
      continue
    }
    if (raw == null || text(raw).trim() === '') {
      rejected.push({
        metricId: id,
        field: paramField(key),
        reason: `${p.label}: the current value is blank.`,
        ...at,
      })
      continue
    }
    const check = parseParamInput(p, raw)
    if (!check.ok) {
      // A locked setting shown at its value parses fine; anything else past a lock is refused here.
      rejected.push({ metricId: id, field: paramField(key), reason: check.error, ...at })
      continue
    }
    planned.push({ edit: { metricId: id, field: paramField(key), value: check.value }, where: at })
  }
  return { planned, rejected, unknown: [...unknown] }
}

export type DictionaryPlan = ReturnType<typeof planDictionaryImport>

/** Read a dictionary workbook and work out its changes, or say why the file can't be used. */
export async function prepareDictionaryImport(
  data: ArrayBuffer | Uint8Array,
  catalog: MetricCatalog,
): Promise<{ ok: true; plan: DictionaryPlan } | { ok: false; error: string }> {
  let parsed: ParsedDictionary
  try {
    parsed = await readDictionaryWorkbook(data)
  } catch {
    return { ok: false, error: 'The file is not an Excel workbook Census can read.' }
  }
  if (!parsed.metrics && !parsed.settings)
    return {
      ok: false,
      error:
        'This is not a Census metric dictionary: it has no Metrics or Settings sheet with a Metric ID column.',
    }
  return { ok: true, plan: planDictionaryImport(parsed, catalog) }
}

/** Apply a prepared dictionary import to a state: each value validated on its own, values in force change nothing. */
export function applyDictionaryPlan(
  plan: DictionaryPlan,
  state: MetricsState,
  catalog: MetricCatalog,
  opts: { by?: string | null; at?: string } = {},
): { state: MetricsState; report: MetricImportReport } {
  return applyImport(state, catalog, plan.planned, plan.rejected, plan.unknown, opts)
}

/**
 * Read a dictionary workbook and apply it: every editable value is validated on its own; values
 * already in force change nothing. Returns the new state and the report, or why the file can't be
 * used.
 */
export async function importDictionary(
  data: ArrayBuffer | Uint8Array,
  state: MetricsState,
  catalog: MetricCatalog,
  opts: { by?: string | null; at?: string } = {},
): Promise<{ ok: true; state: MetricsState; report: MetricImportReport } | { ok: false; error: string }> {
  const r = await prepareDictionaryImport(data, catalog)
  if (!r.ok) return r
  return { ok: true, ...applyDictionaryPlan(r.plan, state, catalog, opts) }
}

/** One rejected value in words: "Settings row 14, Merit budget: enter a value from 0% to 20%." */
export function rejectedText(r: RejectedValue, catalog: MetricCatalog): string {
  const def = catalog.byId.get(r.metricId)
  const where = r.sheet ? `${r.sheet} row ${r.row}, ` : ''
  const label = r.field ? fieldLabel(def, r.field as never) : 'row'
  return `${where}${def?.name ?? r.metricId} (${label.charAt(0).toLowerCase()}${label.slice(1)}): ${r.reason}`
}
