import { describe, expect, it } from 'vitest'
import { generateSample } from '../sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef } from '../schema'
import { applyMapping } from './apply'
import { autoMap } from './automap'
import { guessDataset } from './detect'
import { readWorkbook } from './parse'
import { buildTemplateWorkbook, exportDatasetWorkbook } from './templates'
import { FIXTURE } from './test-fixtures'

type ExcelModule = typeof import('exceljs')
async function excel(): Promise<ExcelModule> {
  const mod = await import('exceljs')
  return ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule
}

/** Records with every schema field present: absent optional fields read back as null. */
function complete(key: DatasetKey, rows: readonly object[]): Record<string, unknown>[] {
  const fields = datasetDef(key).fields
  return rows.map((r) =>
    Object.fromEntries(fields.map((f) => [f.key, (r as Record<string, unknown>)[f.key] ?? null])),
  )
}

/** Build a template from `source`, read it back and import every dataset sheet. */
async function roundTrip(source: Datasets, keys: DatasetKey[]) {
  const blob = await buildTemplateWorkbook({
    sample: source,
    sampleRows: Number.POSITIVE_INFINITY,
    includePay: true,
    datasets: keys,
  })
  const book = readWorkbook(await blob.arrayBuffer(), 'census-template.xlsx')
  const out: Partial<Record<DatasetKey, { rows: unknown[]; issues: unknown[] }>> = {}
  for (const key of keys) {
    const def = datasetDef(key)
    const sheet = book.sheets.find((s) => s.name === def.sheet)
    if (!sheet) throw new Error(`missing sheet ${def.sheet}`)
    const [best] = guessDataset(sheet)
    expect(best.key, def.sheet).toBe(key)
    const mapping = autoMap(sheet.headers, sheet.rows, def)
    const result = applyMapping({
      sheet,
      def,
      mapping,
      roster: key === 'employees' ? undefined : source.employees,
    })
    out[key] = { rows: result.rows, issues: result.issues }
  }
  return { book, out }
}

describe('template round trip', () => {
  it('reads back every dataset of the fixture exactly', async () => {
    const { book, out } = await roundTrip(FIXTURE, DATASET_KEYS)
    expect(book.sheets.map((s) => s.name)).toEqual([
      'Read me',
      ...DATASET_KEYS.map((k) => datasetDef(k).sheet),
      'Fields',
    ])
    for (const key of DATASET_KEYS) {
      expect(out[key]?.issues, key).toEqual([])
      expect(out[key]?.rows, key).toEqual(complete(key, FIXTURE[key]))
    }
  })

  it('reads back the whole generated sample company exactly, with nothing to report', async () => {
    const sample = generateSample()
    const keys = DATASET_KEYS.filter((k) => sample[k].length > 0)
    // Without sample data (a stubbed generator) the fixture test above still covers the logic.
    if (!keys.length) return
    const { out } = await roundTrip(sample, keys)
    for (const key of keys) {
      expect(out[key]?.issues, key).toEqual([])
      expect(out[key]?.rows, key).toEqual(complete(key, sample[key]))
    }
  }, 120_000)
})

describe('template layout', () => {
  it('marks required headers, freezes them and adds dropdowns for list fields', async () => {
    const ExcelJS = await excel()
    const blob = await buildTemplateWorkbook({
      datasets: ['employees', 'comp'],
      sample: FIXTURE,
      sampleRows: 2,
    })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Read me', 'Employees', 'Compensation', 'Fields'])

    const ws = wb.getWorksheet('Employees')!
    const header = ws.getRow(1).values as unknown[]
    expect(header.slice(1, 4)).toEqual(['Employee ID *', 'Name', 'Job title'])
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true)
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(ws.rowCount).toBe(3)
    expect(ws.getCell('K2').value).toEqual(new Date(Date.UTC(2012, 2, 1)))
    const typeCol = datasetDef('employees').fields.findIndex((f) => f.key === 'employmentType') + 1
    const dv = ws.getRow(2).getCell(typeCol).dataValidation
    expect(dv).toMatchObject({ type: 'list', formulae: ['"Employee,Contractor,Intern"'] })
    expect(ws.getRow(400).getCell(typeCol).dataValidation).toMatchObject({ type: 'list' })

    // Pay amounts in example rows stay blank unless asked for.
    const comp = wb.getWorksheet('Compensation')!
    expect(comp.getRow(2).getCell(1).value).toBe('E0002')
    expect(comp.getRow(2).getCell(3).value).toBe(null)

    const fields = wb.getWorksheet('Fields')!
    expect(fields.getRow(1).values).toEqual([
      undefined,
      'Sheet',
      'Column',
      'Requirement',
      'Type',
      'Allowed values',
      'Description',
      'Pay amount',
    ])
    expect(fields.getRow(2).values).toEqual([
      undefined,
      'Employees',
      'Employee ID *',
      'Required',
      'ID',
      '',
      'Unique worker identifier.',
      '',
    ])
  })

  it('exports a dataset without pay amounts unless they are switched on', async () => {
    const ExcelJS = await excel()
    const load = async (blob: Blob) => {
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await blob.arrayBuffer())
      return wb
    }
    const without = await load(await exportDatasetWorkbook('comp', FIXTURE.comp, { includePay: false }))
    expect(without.worksheets.map((w) => w.name)).toEqual(['Compensation', 'Fields', 'Read me'])
    const headers = (without.getWorksheet('Compensation')!.getRow(1).values as unknown[]).filter(Boolean)
    expect(headers).toEqual([
      'Employee ID *',
      'Currency',
      'FX to USD',
      'Target bonus %',
      'Bonus payout % of target',
      'Last increase date',
      'Last increase %',
      'Merit %',
      'Promotion %',
    ])

    const withPay = await exportDatasetWorkbook('comp', FIXTURE.comp, { includePay: true })
    const book = readWorkbook(await withPay.arrayBuffer(), 'comp.xlsx')
    const sheet = book.sheets.find((s) => s.name === 'Compensation')!
    const def = datasetDef('comp')
    const r = applyMapping({ sheet, def, mapping: autoMap(sheet.headers, sheet.rows, def) })
    expect(r.rows).toEqual(complete('comp', FIXTURE.comp))
  })
})
