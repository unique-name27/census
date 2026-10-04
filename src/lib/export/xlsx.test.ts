import { describe, expect, it } from 'vitest'
import type { Column, ExportMeta } from '@/charts/types'
import { kpiColumns, kpiRows } from '@/components/kpiModel'
import type { Kpi } from '@/components/types'
import {
  buildWorkbook,
  columnWidth,
  excelValue,
  loadExcel,
  numFmtFor,
  sanitizeSheetName,
  uniqueSheetNames,
} from './xlsx'

const meta: ExportMeta = {
  view: 'Recruiting',
  tab: 'Pipeline',
  scope: 'Whole company',
  window: '1 Oct 2025 – 30 Sep 2026',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
}

describe('sheet names', () => {
  it('strips forbidden characters, trims apostrophes and caps at 31', () => {
    expect(sanitizeSheetName('Time to fill: by dept [L5+]?')).toBe('Time to fill by dept L5+')
    expect(sanitizeSheetName("'Quoted'")).toBe('Quoted')
    expect(sanitizeSheetName('a/b\\c*d')).toBe('a b c d')
    expect(sanitizeSheetName('x'.repeat(40))).toHaveLength(31)
    expect(sanitizeSheetName('  ')).toBe('Sheet')
    expect(sanitizeSheetName('History')).toBe('History (1)')
  })
  it('de-duplicates case-insensitively within 31 characters', () => {
    const long = 'Regretted attrition by department and level'
    expect(uniqueSheetNames(['Summary', 'summary', 'Summary'])).toEqual([
      'Summary',
      'summary (2)',
      'Summary (3)',
    ])
    const [a, b] = uniqueSheetNames([long, long])
    expect(a).toHaveLength(31)
    expect(b.endsWith(' (2)')).toBe(true)
    expect(b.length).toBeLessThanOrEqual(31)
  })
})

describe('cell values and formats', () => {
  it('writes real dates, blanks for missing and never NaN', () => {
    expect(excelValue('2026-09-30', 'date')).toEqual(new Date(Date.UTC(2026, 8, 30)))
    expect(excelValue('2026-09-30T14:05', 'date')).toEqual(new Date(Date.UTC(2026, 8, 30, 14, 5)))
    expect(excelValue('2026-09-30', 'text')).toBe('2026-09-30')
    expect(excelValue(null, 'int')).toBeNull()
    expect(excelValue(Number.NaN, 'int')).toBeNull()
    expect(excelValue(false, undefined)).toBe('No')
  })
  it('maps column formats to Excel number formats', () => {
    expect(numFmtFor({ format: 'pct' }, 0.1)).toBe('0.0%')
    expect(numFmtFor({ format: 'moneyFull' }, 1)).toBe('"$"#,##0')
    expect(numFmtFor({ format: 'date' }, '2026-01-01')).toBe('d mmm yyyy')
    expect(numFmtFor({}, 12)).toBe('#,##0')
    expect(numFmtFor({}, 1.25)).toBe('0.00')
    expect(numFmtFor({}, 'text')).toBeUndefined()
  })
  it('fits widths to content within 8 to 48 characters', () => {
    expect(columnWidth('ID', [1, 2], 'int')).toBe(8)
    expect(columnWidth('Department', ['Process engineering'], 'text')).toBe(21)
    expect(columnWidth('Notes', ['x'.repeat(200)], 'text')).toBe(48)
  })
})

describe('buildWorkbook', () => {
  const columns: Column[] = [
    { key: 'dept', label: 'Department' },
    { key: 'rate', label: 'Attrition', format: 'pct' },
    { key: 'opened', label: 'Opened', format: 'date' },
    { key: 'salary', label: 'Salary', format: 'moneyFull', pay: true },
  ]
  const rows = [
    { dept: 'Process engineering', rate: 0.142, opened: '2026-03-02', salary: 151000 },
    { dept: 'Test', rate: null, opened: '2026-05-10', salary: 98000 },
  ]

  it('round-trips through xlsx with title block, header, formats, frozen panes and autofilter', async () => {
    const wb = await buildWorkbook(
      [
        {
          name: 'Attrition: by dept',
          title: 'Attrition by department',
          subtitle: 'Annualized',
          columns,
          rows,
        },
      ],
      meta,
      { showPay: false },
    )
    const buffer = await wb.xlsx.writeBuffer()
    const ExcelJS = await loadExcel()
    const back = new ExcelJS.Workbook()
    await back.xlsx.load(buffer as ArrayBuffer)
    const ws = back.worksheets[0]
    expect(ws.name).toBe('Attrition by dept')
    expect(ws.getCell('A1').value).toBe('Attrition by department')
    expect(ws.getCell('A1').font?.bold).toBe(true)
    expect(ws.getCell('A2').value).toBe('Annualized')
    expect(String(ws.getCell('A3').value)).toContain('As of 30 Sep 2026')
    expect(ws.getCell('A4').value).toBe('Company confidential · Sample data')

    const headerRow = 6
    const header = ws.getRow(headerRow)
    expect([1, 2, 3, 4].map((i) => header.getCell(i).value)).toEqual([
      'Department',
      'Attrition',
      'Opened',
      null,
    ])
    expect(header.getCell(1).font?.bold).toBe(true)

    const first = ws.getRow(headerRow + 1)
    expect(first.getCell(2).value).toBeCloseTo(0.142)
    expect(first.getCell(2).numFmt).toBe('0.0%')
    expect(first.getCell(3).value).toEqual(new Date(Date.UTC(2026, 2, 2)))
    expect(first.getCell(3).numFmt).toBe('d mmm yyyy')
    expect(ws.getRow(headerRow + 2).getCell(2).value).toBeNull()

    const view = ws.views[0] as { state?: string; ySplit?: number }
    expect(view.state).toBe('frozen')
    expect(view.ySplit).toBe(headerRow)
    expect(ws.autoFilter).toBeTruthy()
  })

  it('writes a per-cell number format for per-row column formats', async () => {
    const metricRows = [
      { metric: 'Offer acceptance', unit: 'rate', value: 0.854 },
      { metric: 'Time to fill', unit: 'days', value: 41 },
      { metric: 'Pipeline coverage', unit: 'multiple', value: 1.58 },
      { metric: 'Precise rate', unit: 'rate2', value: 0.0354 },
    ]
    type MetricRow = (typeof metricRows)[number]
    const metricColumns: Column<MetricRow>[] = [
      { key: 'metric', label: 'Metric' },
      {
        key: 'value',
        label: 'Value',
        format: (r) =>
          r.unit === 'rate' ? 'pct' : r.unit === 'days' ? 'days' : r.unit === 'rate2' ? 'pct2' : 'times',
      },
    ]
    const wb = await buildWorkbook([{ name: 'Metrics', columns: metricColumns, rows: metricRows }], meta, {
      showPay: false,
    })
    const ws = wb.worksheets[0]
    const first = 5 + 1
    expect([0, 1, 2, 3].map((i) => ws.getRow(first + i).getCell(2).numFmt)).toEqual([
      '0.0%',
      '#,##0',
      '0.00"×"',
      '0.00%',
    ])
    expect(ws.getRow(first + 1).getCell(2).value).toBe(41)
    expect(ws.getRow(5).getCell(2).alignment?.horizontal).toBe('right')
    expect(columnWidth('Value', [0.854, 41], ['pct', 'days'])).toBe(8)
  })

  it('writes the key figures as numbers with their units and trend, never the slide text', async () => {
    const kpis: Kpi[] = [
      { id: 'a', label: 'Attrition', value: 0.12, format: 'pct', delta: 0.008, spark: [0.1, 0.11, 0.12] },
      { id: 'b', label: 'Time to fill', value: 41, format: 'days', delta: -3 },
    ]
    const wb = await buildWorkbook(
      [{ name: 'Key figures', columns: kpiColumns(kpis), rows: kpiRows(kpis) }],
      meta,
      { showPay: false },
    )
    const ws = wb.worksheets[0]
    const header = ws.getRow(5).values as unknown[]
    expect(header.slice(1)).toEqual([
      'Measure',
      'Value',
      'Unit',
      'Change',
      'Change unit',
      'Compared with',
      'Note',
      'Trend, 2 periods back',
      'Trend, 1 period back',
      'Trend, latest',
    ])
    const att = ws.getRow(6)
    expect(att.getCell(2).value).toBe(0.12)
    expect(att.getCell(2).numFmt).toBe('0.0%')
    expect(att.getCell(3).value).toBe('%')
    expect(att.getCell(4).value).toBe(0.8)
    expect(att.getCell(5).value).toBe('pts')
    expect([8, 9, 10].map((c) => att.getCell(c).value)).toEqual([0.1, 0.11, 0.12])
    expect(att.getCell(10).numFmt).toBe('0.0%')
    const ttf = ws.getRow(7)
    expect(ttf.getCell(2).value).toBe(41)
    expect(ttf.getCell(3).value).toBe('d')
    expect(ttf.getCell(4).value).toBe(-3)
    expect(ttf.getCell(10).value).toBeNull()
  })

  it('keeps pay columns when pay amounts are on', async () => {
    const wb = await buildWorkbook([{ name: 'Pay', columns, rows }], meta, { showPay: true })
    const ws = wb.worksheets[0]
    const header = ws.getRow(5)
    expect(header.getCell(4).value).toBe('Salary')
    expect(ws.getRow(6).getCell(4).value).toBe(151000)
  })
})

describe('data standard in the title block', () => {
  it('adds a line with the standard and the tier above the stamp', async () => {
    const wb = await buildWorkbook(
      [
        {
          name: 'Attrition',
          title: 'Attrition by department',
          columns: [{ key: 'dept', label: 'Department' }],
          rows: [{ dept: 'Test' }],
          tier: 'silver',
        },
      ],
      { ...meta, standard: 'bronze' },
      { showPay: false },
    )
    const ws = wb.worksheets[0]
    expect(ws.getCell('A3').value).toBe('Data standard: Everything (bronze and up) · Tier: Silver')
    expect(ws.getCell('A4').value).toBe('Company confidential · Sample data')
    expect(ws.getRow(6).getCell(1).value).toBe('Department')
  })
})
