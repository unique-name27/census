/**
 * The hidden "Lists" sheet that drives Excel dropdowns: one column of values per list, each with
 * a workbook name (Departments, CostCenters …) that a data validation list can use as its source.
 * Shared by the Official lists workbook and the Data room templates; needs nothing but ExcelJS.
 */
import type { DataValidation, Workbook, Worksheet } from 'exceljs'

/** The hidden sheet of dropdown values. */
export const LISTS_SHEET = 'Lists'

export function columnLetter(n: number): string {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}

/** "Lists!$B$2:$B$23": the cells a list's values fill (at least one, so the name always resolves). */
export const listRange = (col: number, count: number): string =>
  `${LISTS_SHEET}!$${columnLetter(col)}$2:$${columnLetter(col)}$${Math.max(2, count + 1)}`

/** ExcelJS supports range validations through `worksheet.dataValidations`, which its typings omit. */
interface RangeValidations {
  dataValidations: { add(range: string, validation: DataValidation): void }
}
export const addValidation = (ws: Worksheet, range: string, v: DataValidation): void =>
  (ws as unknown as RangeValidations).dataValidations.add(range, v)

export interface SheetList {
  /** Workbook name, e.g. "Departments". */
  name: string
  /** Column header, e.g. "Departments". */
  label: string
  values: readonly string[]
}

/** Write the hidden Lists sheet and a workbook name per list. Returns the names written. */
export function addListsSheet(wb: Workbook, lists: readonly SheetList[]): string[] {
  const ws = wb.addWorksheet(LISTS_SHEET)
  ws.state = 'hidden'
  const names: string[] = []
  lists.forEach((l, i) => {
    const col = i + 1
    const head = ws.getRow(1).getCell(col)
    head.value = l.label
    head.font = { bold: true }
    l.values.forEach((v, r) => {
      ws.getRow(r + 2).getCell(col).value = v
    })
    ws.getColumn(col).width = Math.min(
      40,
      Math.max(14, l.label.length + 2, ...l.values.map((v) => v.length + 2)),
    )
    wb.definedNames.add(listRange(col, l.values.length), l.name)
    names.push(l.name)
  })
  return names
}
