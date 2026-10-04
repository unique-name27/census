import { describe, expect, it } from 'vitest'
import { buildTemplateWorkbook, exportDatasetWorkbook } from '../import/templates'
import { emp, emptyDatasets } from '../quality/test-fixtures'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '../schema'
import { LIST_DEFS } from './defs'
import { applyEdit, EMPTY_LISTS } from './edit'
import { effectiveLists, officialLists, type SourceKinds, templateLists } from './effective'
import { LISTS_SHEET } from './sheet'
import type { ListsState } from './types'
import {
  applyListsImport,
  buildListsWorkbook,
  planListsImport,
  planSummary,
  readListsWorkbook,
} from './workbook'

type ExcelModule = typeof import('exceljs')
async function excel(): Promise<ExcelModule> {
  const mod = await import('exceljs')
  return ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule
}
async function load(blob: Blob) {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await blob.arrayBuffer())
  return wb
}

const kinds = (uploads: DatasetKey[] = []): SourceKinds =>
  Object.fromEntries(
    DATASET_KEYS.map((k) => [k, { kind: uploads.includes(k) ? 'upload' : 'sample' }]),
  ) as SourceKinds
const SAMPLE = kinds()

function sampleEff() {
  return effectiveLists(EMPTY_LISTS, emptyDatasets(), SAMPLE)
}

describe('the Official lists workbook', () => {
  it('has a sheet per list and a hidden Lists sheet whose names resolve to the active values', async () => {
    const eff = sampleEff()
    const wb = await load(await buildListsWorkbook(eff, { rows: () => 3, preparedOn: '2026-10-04' }))
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Read me',
      ...LIST_DEFS.map((d) => d.sheet),
      LISTS_SHEET,
    ])
    const lists = wb.getWorksheet(LISTS_SHEET)!
    expect(lists.state).toBe('hidden')
    for (const def of LIST_DEFS) {
      const { ranges } = wb.definedNames.getRanges(def.name)
      expect(ranges, def.name).toHaveLength(1)
      const [sheet, cells] = ranges[0].split('!')
      expect(sheet.replace(/'/g, '')).toBe(LISTS_SHEET)
      const [from, to] = cells.replace(/\$/g, '').split(':')
      const col = from.replace(/\d+/g, '')
      const first = Number(from.replace(/\D+/g, ''))
      const last = Number(to.replace(/\D+/g, ''))
      const values: unknown[] = []
      for (let r = first; r <= last; r++) values.push(lists.getCell(`${col}${r}`).value)
      const active = eff[def.id].values.filter((v) => !v.retired).map((v) => v.value)
      expect(values, def.name).toEqual(active)
    }
    // Retired values stay on their sheet, with status and replacement, but out of the dropdowns.
    const depts = wb.getWorksheet('Departments')!
    const header = (depts.getRow(1).values as unknown[]).slice(1)
    expect(header).toEqual([
      'Department',
      'Business unit',
      'Code',
      'Status',
      'Replaced by',
      'Rows in data',
      'Census ID',
    ])
    let dvRow = 0
    depts.eachRow((row, n) => {
      if (row.getCell(1).value === 'DV') dvRow = n
    })
    expect(depts.getRow(dvRow).getCell(4).value).toBe('Retired')
    expect(depts.getRow(dvRow).getCell(5).value).toBe('Design Verification')
    expect(depts.getCell('B2').dataValidation).toMatchObject({ type: 'list', formulae: ['BusinessUnits'] })
    expect(depts.getCell('D2').dataValidation).toMatchObject({ type: 'list', formulae: ['"Active,Retired"'] })
  })

  it('reads back exactly: no changes when nothing was edited', async () => {
    const eff = sampleEff()
    const parsed = await readListsWorkbook(await (await buildListsWorkbook(eff)).arrayBuffer())
    expect(Object.keys(parsed.lists).sort()).toEqual(LIST_DEFS.map((d) => d.id).sort())
    expect(parsed.ignored).toEqual([])
    const plan = planListsImport(parsed, EMPTY_LISTS, eff)
    expect(plan.lists).toEqual([])
    expect(plan.total).toBe(0)
  })

  it('plans adds, renames, retires, moves and attribute changes from an edited file, and applies them as one change', async () => {
    const eff = sampleEff()
    const wb = await load(await buildListsWorkbook(eff))
    const depts = wb.getWorksheet('Departments')!
    const rowOf = (value: string) => {
      let at = 0
      depts.eachRow((row, n) => {
        if (row.getCell(1).value === value) at = n
      })
      return depts.getRow(at)
    }
    rowOf('Architecture').getCell(1).value = 'System architecture' // rename (Census ID stays)
    rowOf('Firmware').getCell(2).value = 'Silicon Engineering' // move
    rowOf('Legal').getCell(4).value = 'Retired' // retire
    rowOf('Legal').getCell(5).value = 'Finance'
    rowOf('Firmware').getCell(3).value = '9999' // code
    depts.addRow(['Photonics', 'Silicon Engineering', '1190', 'Active', null, null, null]) // add
    depts.addRow(['photonics', 'Silicon Engineering', null, 'Active', null, null, null]) // repeat
    const levels = wb.getWorksheet('Levels')!
    levels.addRow(['L7', 'Distinguished', null, 'Active', null]) // fixed list: refused
    const buf = await wb.xlsx.writeBuffer()
    const parsed = await readListsWorkbook(buf as ArrayBuffer)
    const plan = planListsImport(parsed, EMPTY_LISTS, eff)
    const dp = plan.lists.find((p) => p.id === 'department')!
    expect(dp.lines.map((l) => l.text)).toEqual([
      'Rename "Architecture" to "System architecture"',
      'Move "Firmware" to Silicon Engineering',
      'Change the code of "Firmware"',
      'Retire "Legal", replaced by "Finance"',
      'Add "Photonics" under Silicon Engineering',
    ])
    expect(dp.skipped.map((s) => s.reason)).toEqual([`Row ${depts.rowCount} repeats "photonics".`])
    expect(planSummary(dp.lines)).toBe('1 renamed, 1 moved, 1 changed, 1 retired, 1 added')
    const lp = plan.lists.find((p) => p.id === 'level')!
    expect(lp.lines[0].error).toBe('Levels are fixed by Census. You can retire values but not add them.')
    expect(plan.total).toBe(5)

    const r = applyListsImport(EMPTY_LISTS, eff, plan, { by: 'Jamie', now: 1_000 })
    expect(r.change?.what).toBe(
      'Imported the Official lists workbook: 1 renamed, 1 moved, 1 changed, 1 retired, 1 added.',
    )
    const saved = r.state.lists.department!.values
    expect(saved.find((v) => v.value === 'System architecture')).toBeDefined()
    expect(saved.find((v) => v.value === 'Firmware')).toMatchObject({
      parent: 'Silicon Engineering',
      attrs: { code: '9999' },
    })
    expect(saved.find((v) => v.value === 'Legal')).toMatchObject({ retired: true, replacedBy: 'Finance' })
    expect(saved.find((v) => v.value === 'Photonics')).toMatchObject({ added: true, attrs: { code: '1190' } })
    // The renamed department's cost centers follow it.
    const ccs = r.state.lists.costCenter!.values
    expect(ccs.find((v) => v.value === '1110-SJC')?.parent).toBe('System architecture')
    expect(ccs.some((v) => v.parent === 'Architecture')).toBe(false)
    expect(r.change?.lists).toEqual(['department', 'costCenter'])
  })

  it('refuses a file it cannot read, in plain words', async () => {
    await expect(readListsWorkbook(new Uint8Array([1, 2, 3]))).rejects.toThrow('could not be read')
  })
})

describe('Data room templates', () => {
  it('add dropdowns of the official lists’ active values on the matching columns', async () => {
    const lists = templateLists(EMPTY_LISTS, SAMPLE)
    const wb = await load(await buildTemplateWorkbook({ datasets: ['employees', 'requisitions'], lists }))
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Read me',
      'Employees',
      'Requisitions',
      'Fields',
      LISTS_SHEET,
    ])
    expect(wb.getWorksheet(LISTS_SHEET)!.state).toBe('hidden')
    const emps = wb.getWorksheet('Employees')!
    const col = (key: string, ds: DatasetKey = 'employees') =>
      datasetDef(ds).fields.findIndex((f) => f.key === key) + 1
    expect(emps.getRow(2).getCell(col('department')).dataValidation).toMatchObject({
      type: 'list',
      formulae: ['Departments'],
    })
    expect(emps.getRow(300).getCell(col('costCenter')).dataValidation).toMatchObject({
      formulae: ['CostCenters'],
    })
    expect(emps.getRow(2).getCell(col('terminationReason')).dataValidation).toMatchObject({
      formulae: ['TerminationReasons'],
    })
    expect(emps.getRow(2).getCell(col('level')).dataValidation).toMatchObject({ formulae: ['Levels'] })
    // Fields without a list keep their inline dropdowns.
    expect(emps.getRow(2).getCell(col('employmentType')).dataValidation).toMatchObject({
      formulae: ['"Employee,Contractor,Intern"'],
    })
    const reqs = wb.getWorksheet('Requisitions')!
    expect(reqs.getRow(2).getCell(col('department', 'requisitions')).dataValidation).toMatchObject({
      formulae: ['Departments'],
    })
    // Every name used resolves, and a retired value is not offered.
    const lists2 = wb.getWorksheet(LISTS_SHEET)!
    const header = (lists2.getRow(1).values as unknown[]).slice(1)
    expect(header).toContain('Departments')
    const { ranges } = wb.definedNames.getRanges('Departments')
    expect(ranges).toHaveLength(1)
    const deptCol = header.indexOf('Departments') + 1
    const offered: unknown[] = []
    lists2.getColumn(deptCol).eachCell((c, r) => {
      if (r > 1) offered.push(c.value)
    })
    expect(offered).toContain('Design Verification')
    expect(offered).not.toContain('DV')
    const fields = wb.getWorksheet('Fields')!
    let allowed = ''
    let level = ''
    fields.eachRow((row) => {
      if (row.getCell(1).value === 'Employees' && row.getCell(2).value === 'Department')
        allowed = String(row.getCell(5).value)
      if (row.getCell(1).value === 'Employees' && row.getCell(2).value === 'Level')
        level = String(row.getCell(5).value)
    })
    expect(allowed).toBe('A value from the official departments list (Departments in this workbook).')
    // The field's own guidance stays after the list's.
    expect(level).toBe(
      'A value from the official levels list (Levels in this workbook). Titles such as Senior, Staff, Director or VP are converted.',
    )
  })

  it('offer nothing from a proposed list, and leave templates without lists as they were', async () => {
    const own = kinds(['employees'])
    const d = emptyDatasets()
    d.employees = [emp(1)]
    const eff = effectiveLists(EMPTY_LISTS, d, own)
    expect(eff.department.status).toBe('proposed')
    expect(templateLists(EMPTY_LISTS, own)['employees.department']).toBeUndefined()
    const plain = await load(await buildTemplateWorkbook({ datasets: ['employees'] }))
    expect(plain.worksheets.map((w) => w.name)).toEqual(['Read me', 'Employees', 'Fields'])
    // Once official, its values are offered.
    const made = applyEdit(EMPTY_LISTS, eff, { kind: 'make-official', list: 'department' })
    if (!made.ok) throw new Error(made.error)
    const state: ListsState = made.state
    expect(templateLists(state, own)['employees.department']?.values).toEqual(['Design Verification'])
    const exported = await load(
      await exportDatasetWorkbook('employees', d.employees, {
        includePay: false,
        lists: templateLists(state, own),
      }),
    )
    expect(exported.worksheets.map((w) => w.name)).toEqual(['Employees', 'Fields', 'Read me', LISTS_SHEET])
    const col = datasetDef('employees').fields.findIndex((f) => f.key === 'department') + 1
    expect(exported.getWorksheet('Employees')!.getRow(2).getCell(col).dataValidation).toMatchObject({
      formulae: ['Departments'],
    })
    expect(officialLists(state, own).department?.source).toBe('saved')
  })
})
