/**
 * The catalog as an Excel workbook, and back. Writing uses ExcelJS (loaded on demand, as the
 * export library does); reading uses the importer's SheetJS parser. The UI loads this module with
 * `import()`, so neither library weighs on first paint.
 *
 * The workbook has the "AI agents" sheet (header in row 1, one agent per row, lists one item per
 * line) and a short "How to fill" sheet. Import reads the "AI agents" sheet, or the first sheet
 * that has the catalog's columns (so the catalog figure's own Excel export works too).
 */
import { readWorkbook } from '@/data/import/parse'
import { todayISO } from '@/lib/dates'
import { downloadBlob, MIME } from '@/lib/export/download'
import { loadExcel, XL } from '@/lib/export/xlsx'
import { catalogRows, isAgentSheet, readAgentRows, SHEET_COLUMNS, SHEET_NAME, type SheetRead } from './sheet'
import { AGENT_AREAS, AGENT_AUDIENCES, AGENT_STATUSES, type Agent, AREA_LABEL, AUDIENCE_LABEL } from './types'

const HOW_TO: [string, string][] = [
  ['One agent per row', 'Keep the column names in row 1. Rows without a name are skipped.'],
  [
    'Lists',
    "Audience, Use it for, Don't use it for, Example prompts and Data sources: one item per line (Alt+Enter in a cell).",
  ],
  ['HR area', AGENT_AREAS.map((a) => AREA_LABEL[a]).join(', ')],
  ['Audience', AGENT_AUDIENCES.map((a) => AUDIENCE_LABEL[a]).join(', ')],
  ['Status', AGENT_STATUSES.join(', ')],
  ['Glean link', 'A web link that starts with https://. Other links are removed on import.'],
  ['Guardrails', `Every agent needs at least one "Don't use it for" line. Agents assist and people decide.`],
]

/** The workbook as bytes (an .xlsx file). */
export async function agentsWorkbook(agents: readonly Agent[]): Promise<Uint8Array<ArrayBuffer>> {
  const Excel = await loadExcel()
  const wb = new Excel.Workbook()
  wb.creator = 'Census'
  wb.created = new Date()

  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = SHEET_COLUMNS.map((c) => ({ header: c.label, key: c.key, width: c.width }))
  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: XL.ink } }
  header.alignment = { vertical: 'bottom', wrapText: true }
  header.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin', color: { argb: XL.ruleStrong } } }
  })
  for (const row of catalogRows(agents, '\n')) {
    const r = ws.addRow(row)
    r.alignment = { vertical: 'top', wrapText: true }
    r.font = { color: { argb: XL.ink } }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: SHEET_COLUMNS.length } }

  const help = wb.addWorksheet('How to fill')
  help.columns = [
    { header: 'Column', key: 'k', width: 22 },
    { header: 'What to enter', key: 'v', width: 96 },
  ]
  help.getRow(1).font = { bold: true, color: { argb: XL.ink } }
  for (const [k, v] of HOW_TO) help.addRow({ k, v }).alignment = { vertical: 'top', wrapText: true }

  // A Buffer in Node, an ArrayBuffer in browsers: copy into plain bytes either way.
  const out: ArrayBuffer | ArrayLike<number> = await wb.xlsx.writeBuffer()
  return out instanceof ArrayBuffer ? new Uint8Array(out) : Uint8Array.from(out)
}

export const agentsFileName = (): string => `census-ai-agents-${todayISO()}.xlsx`

/** Save the catalog as an Excel file. */
export async function downloadAgentsWorkbook(agents: readonly Agent[]): Promise<void> {
  const bytes = await agentsWorkbook(agents)
  downloadBlob(new Blob([bytes], { type: MIME.xlsx }), agentsFileName())
}

export interface AgentFileRead extends SheetRead {
  fileName: string
  /** The sheet the agents came from; null when none had the catalog's columns. */
  sheetName: string | null
}

/**
 * Agents from an .xlsx, .xls or .csv file. Throws a `WorkbookReadError` with a plain message
 * when the file cannot be read at all.
 */
export function readAgentsFile(input: ArrayBuffer | Uint8Array, fileName: string): AgentFileRead {
  const book = readWorkbook(input, fileName)
  const sheet =
    book.sheets.find((s) => s.name.trim().toLowerCase() === SHEET_NAME.toLowerCase()) ??
    book.sheets.find((s) => isAgentSheet(s.headers)) ??
    null
  if (!sheet) {
    return {
      fileName,
      sheetName: null,
      agents: [],
      skipped: 0,
      issues: [
        {
          row: null,
          message: `No sheet in "${fileName}" has the catalog's columns (Name, HR area, Description). Export the catalog to see the layout.`,
        },
      ],
    }
  }
  return { fileName, sheetName: sheet.name, ...readAgentRows(sheet.headers, sheet.rows, sheet.rowNumbers) }
}
