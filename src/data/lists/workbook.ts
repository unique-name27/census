/**
 * The "Official lists" workbook (ExcelJS, loaded on demand): a Read me, one sheet per list with
 * parents, attributes and status, and a hidden "Lists" sheet with one column of active values per
 * list. Each column has a workbook name (BusinessUnits, Departments …), so the same workbook can
 * feed Excel data-validation dropdowns anywhere: Data, Validation, List, source =Departments.
 *
 * Reading it back gives a plan of adds, renames, retires, moves and attribute changes, shown
 * before anything is applied. A row's Census ID says which value it was, so a changed name reads
 * as a rename. Values missing from the file are left as they are.
 */
import type { Worksheet } from 'exceljs'
import { LIST_DEFS, listDef } from './defs'
import { applyEdits, cleanName, type EditOptions } from './edit'
import { addListsSheet, addValidation, columnLetter, LISTS_SHEET } from './sheet'
import type { EffectiveLists, ListDef, ListEdit, ListId, ListsState, ListValue } from './types'

export { LISTS_SHEET } from './sheet'

type ExcelModule = typeof import('exceljs')

export async function loadExcel(): Promise<ExcelModule> {
  const mod = await import('exceljs')
  // The browser bundle arrives as a CommonJS default export; Node also exposes named exports.
  return ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const INK = 'FF1F2933'
const FILL_HEAD = 'FFDDE3EA'
const FILL_READ_ONLY = 'FFF4F6F8'
const RULE = 'FF9AA5B1'
/** Rows below the values that still get dropdowns, so new rows typed in validate too. */
const SPARE_ROWS = 200

export const STATUS_ACTIVE = 'Active'
export const STATUS_RETIRED = 'Retired'
const H_STATUS = 'Status'
const H_REPLACED = 'Replaced by'
const H_ROWS = 'Rows in data'
const H_ID = 'Census ID'

interface Col {
  header: string
  key: string
  width: number
  readOnly?: boolean
}

function columnsOf(def: ListDef, withRows: boolean): Col[] {
  const cols: Col[] = [{ header: def.singular, key: 'value', width: 28 }]
  if (def.parent) cols.push({ header: listDef(def.parent).singular, key: 'parent', width: 26 })
  for (const a of def.attrs)
    cols.push({
      header: a.label,
      key: `attr:${a.key}`,
      width: Math.max(12, a.label.length + 4),
      readOnly: a.derived,
    })
  cols.push({ header: H_STATUS, key: 'status', width: 11 })
  if (def.kind !== 'fixed') cols.push({ header: H_REPLACED, key: 'replacedBy', width: 24 })
  if (withRows) cols.push({ header: H_ROWS, key: 'rows', width: 13, readOnly: true })
  cols.push({ header: H_ID, key: 'id', width: 24, readOnly: true })
  return cols
}

function cellOf(
  v: ListValue,
  key: string,
  rows?: (id: ListId, value: string) => number,
  id?: ListId,
): unknown {
  if (key === 'value') return v.value
  if (key === 'parent') return v.parent ?? null
  if (key === 'status') return v.retired ? STATUS_RETIRED : STATUS_ACTIVE
  if (key === 'replacedBy') return v.replacedBy ?? null
  if (key === 'rows') return rows && id ? rows(id, v.value) : null
  if (key === 'id') return v.value
  if (key.startsWith('attr:')) return v.attrs?.[key.slice(5)] ?? null
  return null
}

const READ_ME = [
  'Each sheet is one official list. Edit names, parents, attributes and status, or add rows for new values, then import the file in Settings, Official lists. Census shows what will change before it applies anything.',
  'Census ID tells Census which value a row was, so a changed name is read as a rename. Leave it as it is, and leave it blank on new rows.',
  'Retired values stay recognized in older rows but are left out of dropdowns. Values missing from a sheet are left as they are.',
  'The hidden Lists sheet holds the active values of each list, one column per list, each with a workbook name. Use a name as the source of an Excel data validation list, for example =Departments.',
  'Rows in data is for reference; Census counts it again when you import.',
]

/** The workbook with every list, in the order Settings shows them. */
export async function buildListsWorkbook(
  lists: EffectiveLists,
  opts: { rows?: (id: ListId, value: string) => number; preparedOn?: string; company?: string } = {},
): Promise<Blob> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Census'
  wb.created = new Date()

  const readMe = wb.addWorksheet('Read me')
  readMe.columns = [{ width: 26 }, { width: 16 }, { width: 22 }, { width: 22 }]
  readMe.addRow(['Census official lists']).font = { bold: true, size: 14, color: { argb: INK } }
  readMe.addRow([
    `Prepared ${opts.preparedOn ?? new Date().toISOString().slice(0, 10)}${opts.company ? ` for ${opts.company}` : ''}.`,
  ])
  for (const line of READ_ME) readMe.addRow([line])
  readMe.addRow([])
  const head = readMe.addRow(['Sheet', 'Values', 'Status', 'Workbook name'])
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: INK } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_HEAD } }
  })
  for (const def of LIST_DEFS) {
    const l = lists[def.id]
    readMe.addRow([
      def.sheet,
      l.values.length,
      l.status === 'official' ? 'Official' : l.source === 'data' ? 'Proposed from your data' : 'Proposed',
      def.name,
    ])
  }
  readMe.addRow([])
  readMe.addRow(['Company confidential.']).font = { italic: true }

  for (const def of LIST_DEFS) {
    const l = lists[def.id]
    const cols = columnsOf(def, !!opts.rows)
    const ws = wb.addWorksheet(def.sheet, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }))
    const header = ws.getRow(1)
    header.height = 20
    header.eachCell((cell, col) => {
      cell.font = { bold: true, color: { argb: INK } }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: cols[col - 1]?.readOnly ? FILL_READ_ONLY : FILL_HEAD },
      }
      cell.border = { bottom: { style: 'thin', color: { argb: RULE } } }
    })
    for (const v of l.values) ws.addRow(cols.map((c) => cellOf(v, c.key, opts.rows, def.id)))
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
    const last = l.values.length + 1 + SPARE_ROWS
    cols.forEach((c, i) => {
      const col = columnLetter(i + 1)
      const range = `${col}2:${col}${last}`
      if (c.key === 'parent' && def.parent)
        addValidation(ws, range, {
          type: 'list',
          allowBlank: true,
          formulae: [listDef(def.parent).name],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: `Check the ${listDef(def.parent).singular.toLowerCase()}`,
          error: `Use a value from the ${listDef(def.parent).label.toLowerCase()} list.`,
        })
      else if (c.key === 'status')
        addValidation(ws, range, {
          type: 'list',
          allowBlank: true,
          formulae: [`"${STATUS_ACTIVE},${STATUS_RETIRED}"`],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Check the status',
          error: `Status is ${STATUS_ACTIVE} or ${STATUS_RETIRED}.`,
        })
      else if (c.key === 'replacedBy')
        addValidation(ws, range, {
          type: 'list',
          allowBlank: true,
          formulae: [def.name],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Check the replacement',
          error: `Use an active value from this list.`,
        })
      else if (c.key.startsWith('attr:')) {
        const a = def.attrs.find((x) => `attr:${x.key}` === c.key)
        if (a?.options)
          addValidation(ws, range, {
            type: 'list',
            allowBlank: true,
            formulae: [`"${a.options.join(',')}"`],
            showErrorMessage: true,
            errorStyle: 'warning',
            errorTitle: `Check the ${a.label.toLowerCase()}`,
            error: `${a.label} is one of ${a.options.join(', ')}.`,
          })
      }
    })
  }

  addListsSheet(
    wb,
    LIST_DEFS.map((def) => ({
      name: def.name,
      label: def.label,
      values: lists[def.id].values.filter((v) => !v.retired).map((v) => v.value),
    })),
  )
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: XLSX_MIME })
}

/* ───────────── reading it back ───────────── */

export interface ParsedRow {
  /** Spreadsheet row number, for messages. */
  row: number
  value: string
  /** Undefined when the sheet has no parent column. */
  parent?: string | null
  /** Only the attribute columns the sheet has. */
  attrs: Record<string, string | null>
  /** Undefined when the sheet has no status column or the cell is blank. */
  retired?: boolean
  replacedBy?: string | null
  /** The Census ID: which value the row was when exported. */
  id: string | null
}

export interface ParsedLists {
  lists: Partial<Record<ListId, ParsedRow[]>>
  /** Sheets that matched no list (the Read me and the hidden Lists sheet are expected and not listed). */
  ignored: string[]
  /** Sheets left out for a reason the preview states (a workbook saved before a change in shape). */
  notes: string[]
}

/** Shown when a workbook has the layout from before job families contained job functions. */
export const OLD_JOB_LAYOUT =
  'This workbook was saved before job families contained job functions. Its Job families and Job functions sheets were left out; export a new workbook to edit them.'

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*\*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function cellText(ws: Worksheet, row: number, col: number): string {
  const c = ws.getRow(row).getCell(col)
  const v = c.value
  if (v == null) return ''
  if (typeof v === 'number') return String(v)
  return cleanName(c.text ?? String(v))
}

/** Read the list sheets of an Official lists workbook. Throws a plain message when it can't be read. */
export async function readListsWorkbook(input: ArrayBuffer | Uint8Array): Promise<ParsedLists> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(input instanceof Uint8Array ? input.slice().buffer : input)
  } catch {
    throw new Error('The file could not be read. Save it as .xlsx and try again.')
  }
  const out: ParsedLists = { lists: {}, ignored: [], notes: [] }
  /** Whether the Job families sheet has a Job function column: the layout before the flip. */
  let oldJobLayout = false
  for (const ws of wb.worksheets) {
    const def = LIST_DEFS.find((d) => norm(d.sheet) === norm(ws.name) || norm(d.label) === norm(ws.name))
    if (!def) {
      if (norm(ws.name) !== norm('Read me') && ws.name !== LISTS_SHEET) out.ignored.push(ws.name)
      continue
    }
    const headers = new Map<string, number>()
    const head = ws.getRow(1)
    for (let c = 1; c <= head.cellCount; c++) {
      const h = norm(cellText(ws, 1, c))
      if (h && !headers.has(h)) headers.set(h, c)
    }
    const at = (label: string) => headers.get(norm(label))
    if (def.id === 'jobFamily' && at(listDef('jobFunction').singular)) oldJobLayout = true
    const valueCol = at(def.singular) ?? at('Name') ?? at('Value') ?? at(def.label)
    if (!valueCol) {
      out.ignored.push(ws.name)
      continue
    }
    const parentCol = def.parent ? at(listDef(def.parent).singular) : undefined
    const statusCol = at(H_STATUS)
    const replacedCol = at(H_REPLACED)
    const idCol = at(H_ID)
    const attrCols = def.attrs
      .filter((a) => !a.derived)
      .flatMap((a) => {
        const c = at(a.label)
        return c ? [[a.key, c] as const] : []
      })
    const rows: ParsedRow[] = []
    for (let r = 2; r <= ws.rowCount; r++) {
      const value = cellText(ws, r, valueCol)
      const id = idCol ? cellText(ws, r, idCol) || null : null
      if (!value && !id) continue
      const status = statusCol ? cellText(ws, r, statusCol).toLowerCase() : ''
      const row: ParsedRow = { row: r, value, attrs: {}, id }
      if (parentCol) row.parent = cellText(ws, r, parentCol) || null
      if (status === 'retired') row.retired = true
      else if (status === 'active') row.retired = false
      if (replacedCol) row.replacedBy = cellText(ws, r, replacedCol) || null
      for (const [key, c] of attrCols) row.attrs[key] = cellText(ws, r, c) || null
      rows.push(row)
    }
    out.lists[def.id] = rows
  }
  if (oldJobLayout) {
    delete out.lists.jobFamily
    delete out.lists.jobFunction
    out.notes.push(OLD_JOB_LAYOUT)
  }
  return out
}

export interface PlanLine {
  kind: 'add' | 'rename' | 'retire' | 'restore' | 'move' | 'attrs'
  text: string
  /** Why it would not apply, when it would not. */
  error?: string
}

export interface ListPlan {
  id: ListId
  edits: ListEdit[]
  lines: PlanLine[]
  /** Values on the list that the sheet does not have (left as they are). */
  notInFile: number
  /** Rows that could not be read as a change. */
  skipped: { row: number; reason: string }[]
}

export interface ListsImportPlan {
  lists: ListPlan[]
  ignored: string[]
  /** Sheets left out, with the reason (`ParsedLists.notes`). */
  notes: string[]
  /** Changes that would apply. */
  total: number
}

const attrText = (v: unknown) => (v == null ? '' : String(v))

/** Compare a parsed workbook with the lists in force: what would change, list by list. */
export function planListsImport(
  parsed: ParsedLists,
  state: ListsState,
  eff: EffectiveLists,
): ListsImportPlan {
  const plans: ListPlan[] = []
  for (const def of LIST_DEFS) {
    const rows = parsed.lists[def.id]
    if (!rows) continue
    const current = state.lists[def.id]?.values ?? eff[def.id].values
    const byValue = new Map(current.map((v) => [v.value, v]))
    const matched = new Set<string>()
    const edits: ListEdit[] = []
    const lines: PlanLine[] = []
    const skipped: ListPlan['skipped'] = []
    const one = def.singular.toLowerCase()
    for (const r of rows) {
      if (!r.value) {
        skipped.push({ row: r.row, reason: `Row ${r.row} has no ${one}.` })
        continue
      }
      const e =
        (r.id ? byValue.get(r.id) : undefined) ??
        byValue.get(r.value) ??
        current.find((v) => v.value.toLowerCase() === r.value.toLowerCase())
      if (e && matched.has(e.value)) {
        skipped.push({ row: r.row, reason: `Row ${r.row} repeats "${e.value}".` })
        continue
      }
      if (!e) {
        if (rows.some((x) => x !== r && x.row < r.row && x.value.toLowerCase() === r.value.toLowerCase())) {
          skipped.push({ row: r.row, reason: `Row ${r.row} repeats "${r.value}".` })
          continue
        }
        const attrs = Object.fromEntries(Object.entries(r.attrs).filter(([, v]) => v != null))
        edits.push({ kind: 'add', list: def.id, value: r.value, parent: r.parent ?? null, attrs })
        lines.push({
          kind: 'add',
          text: `Add "${r.value}"${r.parent ? ` under ${r.parent}` : ''}`,
        })
        if (r.retired) {
          edits.push({ kind: 'retire', list: def.id, value: r.value, replacedBy: r.replacedBy ?? null })
          lines.push({ kind: 'retire', text: `Retire "${r.value}"` })
        }
        continue
      }
      matched.add(e.value)
      let name = e.value
      if (r.value !== e.value) {
        edits.push({ kind: 'rename', list: def.id, from: e.value, to: r.value })
        lines.push({ kind: 'rename', text: `Rename "${e.value}" to "${r.value}"` })
        name = r.value
      }
      if (def.parent && r.parent !== undefined && (r.parent ?? null) !== (e.parent ?? null)) {
        edits.push({ kind: 'move', list: def.id, value: name, parent: r.parent ?? null })
        lines.push({
          kind: 'move',
          text: r.parent
            ? `Move "${name}" to ${r.parent}`
            : `Clear the ${listDef(def.parent).singular.toLowerCase()} of "${name}"`,
        })
      }
      const changed: Record<string, string | null> = {}
      for (const [k, v] of Object.entries(r.attrs)) if (attrText(e.attrs?.[k]) !== (v ?? '')) changed[k] = v
      if (Object.keys(changed).length) {
        edits.push({ kind: 'attrs', list: def.id, value: name, attrs: changed })
        const labels = Object.keys(changed).map(
          (k) => def.attrs.find((a) => a.key === k)?.label.toLowerCase() ?? k,
        )
        lines.push({ kind: 'attrs', text: `Change the ${labels.join(' and ')} of "${name}"` })
      }
      if (r.retired !== undefined && r.retired !== !!e.retired) {
        if (r.retired) {
          edits.push({ kind: 'retire', list: def.id, value: name, replacedBy: r.replacedBy ?? null })
          lines.push({
            kind: 'retire',
            text: `Retire "${name}"${r.replacedBy ? `, replaced by "${r.replacedBy}"` : ''}`,
          })
        } else {
          edits.push({ kind: 'restore', list: def.id, value: name })
          lines.push({ kind: 'restore', text: `Restore "${name}"` })
        }
      }
    }
    if (!edits.length && !skipped.length) continue
    plans.push({
      id: def.id,
      edits,
      lines,
      notInFile: current.filter((v) => !matched.has(v.value)).length,
      skipped,
    })
  }
  // A dry run says which changes would not apply, and why.
  let working = state
  let total = 0
  for (const p of plans) {
    p.edits.forEach((e, i) => {
      const r = applyEdits(working, eff, [e], '')
      if (r.change) {
        working = r.state
        total++
      } else p.lines[i].error = r.rejected[0]?.error
    })
  }
  return { lists: plans, ignored: parsed.ignored, notes: parsed.notes ?? [], total }
}

const COUNT_WORD: Record<PlanLine['kind'], [string, string]> = {
  add: ['added', 'added'],
  rename: ['renamed', 'renamed'],
  retire: ['retired', 'retired'],
  restore: ['restored', 'restored'],
  move: ['moved', 'moved'],
  attrs: ['changed', 'changed'],
}

/** "3 added, 1 renamed" for the lines of a plan that apply. */
export function planSummary(lines: readonly PlanLine[]): string {
  const counts = new Map<PlanLine['kind'], number>()
  for (const l of lines) if (!l.error) counts.set(l.kind, (counts.get(l.kind) ?? 0) + 1)
  return [...counts]
    .map(([k, n]) => `${n.toLocaleString('en-US')} ${COUNT_WORD[k][n === 1 ? 0 : 1]}`)
    .join(', ')
}

/** Apply a plan as one logged change. */
export function applyListsImport(
  state: ListsState,
  eff: EffectiveLists,
  plan: ListsImportPlan,
  opts: EditOptions = {},
) {
  const edits = plan.lists.flatMap((p) => p.edits)
  const lines = plan.lists.flatMap((p) => p.lines)
  const summary = planSummary(lines)
  return applyEdits(
    state,
    eff,
    edits,
    `Imported the Official lists workbook${summary ? `: ${summary}` : ''}.`,
    opts,
  )
}
