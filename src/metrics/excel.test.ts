import type { Workbook, Worksheet } from 'exceljs'
import { describe, expect, it } from 'vitest'
import { loadExcel } from '@/lib/export/xlsx'
import { metricsApi } from './api'
import {
  buildDictionaryWorkbook,
  dictionaryFileName,
  importDictionary,
  METRICS_SHEET,
  rejectedText,
  SETTINGS_SHEET,
} from './excel'
import { applyEdits, EMPTY_METRICS } from './overrides'
import { FIXTURE } from './test-fixtures'
import type { MetricsState } from './types'

const VOL = 'hrbp.attrition.voluntary'
const SPEND = 'comp.merit.spend'
const ANON = 'privacy.anonymity'
const now = new Date('2026-10-03T12:00:00Z')

const changed: MetricsState = applyEdits(
  EMPTY_METRICS,
  FIXTURE,
  [
    {
      metricId: VOL,
      field: 'definition',
      value: 'Resignations as a share of average headcount, annualized.',
    },
    { metricId: VOL, field: 'target', value: { value: 0.075, comparator: '<=' } },
    { metricId: VOL, field: 'params.firstYearDays', value: 180 },
    { metricId: VOL, field: 'params.regretted', value: 'allVoluntary' },
    { metricId: SPEND, field: 'params.guideline', value: { 5: 0.065, 4: 0.05, 3: 0.03, 2: 0.0125, 1: 0 } },
    { metricId: SPEND, field: 'params.healthyBand', value: [0.85, 1.15] },
    // Merit spend has no formula, so clearing it changes nothing.
    { metricId: SPEND, field: 'formula', value: '' },
    { metricId: ANON, field: 'params.minGroup', value: 8 },
  ],
  { at: '2026-10-01T00:00:00.000Z' },
).state

async function toBuffer(wb: Workbook): Promise<ArrayBuffer> {
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

async function reload(buffer: ArrayBuffer): Promise<Workbook> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

/** The cell in the row whose Metric ID (and setting key) match, under the column labelled `label`. */
function cellOf(ws: Worksheet, id: string, label: string, key?: string) {
  let header = 0
  ws.eachRow((row, n) => {
    if (!header && row.getCell(1).value === 'Metric ID') header = n
  })
  const headers = ws.getRow(header).values as unknown[]
  const col = headers.indexOf(label)
  const keyCol = headers.indexOf('Setting key')
  for (let r = header + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    if (row.getCell(1).value === id && (key == null || row.getCell(keyCol).value === key))
      return row.getCell(col)
  }
  throw new Error(`No row for ${id} ${key ?? ''}`)
}

describe('the Metric dictionary workbook', () => {
  it('has a Metrics sheet with every text field and target, and a Settings sheet with defaults and current values', async () => {
    const wb = await reload(
      await toBuffer(await buildDictionaryWorkbook(metricsApi(changed, FIXTURE), { now })),
    )
    expect(wb.worksheets.map((w) => w.name)).toEqual([METRICS_SHEET, SETTINGS_SHEET])
    const ms = wb.getWorksheet(METRICS_SHEET)!
    expect(ms.getCell('A1').value).toBe('Metric dictionary')
    expect(String(ms.getCell('A2').value)).toContain('Definitions changed from defaults: 3')
    expect(cellOf(ms, VOL, 'Definition').value).toBe(
      'Resignations as a share of average headcount, annualized.',
    )
    expect(cellOf(ms, VOL, 'Target rule').value).toBe('At most')
    expect(cellOf(ms, VOL, 'Target value').value).toBe(0.075)
    expect(cellOf(ms, VOL, 'Views').value).toBe('People stats, Compensation, Talent')
    expect(cellOf(ms, VOL, 'Data used').value).toBe(
      'employees.hireDate, employees.terminationDate, employees.terminationType',
    )
    expect(cellOf(ms, VOL, 'Changed from default').value).toBe(
      'Definition, Target, First-year window, What counts as regretted',
    )
    expect(cellOf(ms, SPEND, 'Formula').value).toBeNull()
    const ss = wb.getWorksheet(SETTINGS_SHEET)!
    expect(cellOf(ss, SPEND, 'Default', 'meritBudget').value).toBe(0.035)
    expect(cellOf(ss, SPEND, 'Current value', 'meritBudget').numFmt).toBe('0.0#%')
    expect(cellOf(ss, SPEND, 'Current value', 'guideline').value).toBe(
      '5: 6.5%, 4: 5%, 3: 3%, 2: 1.25%, 1: 0%',
    )
    expect(cellOf(ss, SPEND, 'Current value', 'healthyBand').value).toBe('0.85 to 1.15')
    expect(cellOf(ss, VOL, 'Current value', 'regretted').value).toBe('Every voluntary exit')
    expect(cellOf(ss, VOL, 'Current value', 'annualize').value).toBe('On')
    expect(cellOf(ss, ANON, 'Allowed values', 'minGroup').value).toBe('5 to 50, raise only')
    expect(cellOf(ss, ANON, 'Changed', 'minGroup').value).toBe('Yes')
  })

  it('round-trips: importing the export changes nothing, and into a fresh browser restores every value', async () => {
    const buffer = await toBuffer(await buildDictionaryWorkbook(metricsApi(changed, FIXTURE), { now }))
    const same = await importDictionary(buffer, changed, FIXTURE)
    expect(same.ok).toBe(true)
    if (!same.ok) return
    expect(same.report.changed).toEqual([])
    expect(same.report.rejected).toEqual([])
    expect(same.report.summary).toBe('Nothing changed: every value in the file matches what is in force.')
    expect(same.state).toBe(changed)

    const fresh = await importDictionary(buffer, EMPTY_METRICS, FIXTURE, { by: 'Jamie' })
    expect(fresh.ok).toBe(true)
    if (!fresh.ok) return
    expect(fresh.state.overrides).toEqual(changed.overrides)
    expect(fresh.report.changed).toHaveLength(changed.log.length)
    expect(fresh.report.changed.every((c) => c.kind === 'import' && c.by === 'Jamie')).toBe(true)
    expect(fresh.report.summary).toBe('Changed 7 values in 3 metrics.')
  })

  it('imports edits field by field and reports what it refused', async () => {
    const wb = await reload(
      await toBuffer(await buildDictionaryWorkbook(metricsApi(changed, FIXTURE), { now })),
    )
    const ms = wb.getWorksheet(METRICS_SHEET)!
    const ss = wb.getWorksheet(SETTINGS_SHEET)!
    cellOf(ms, VOL, 'Population').value = 'Employees only.'
    cellOf(ms, VOL, 'Target rule').value = ''
    cellOf(ms, VOL, 'Target value').value = null
    cellOf(ms, SPEND, 'Target rule').value = 'At least'
    cellOf(ms, SPEND, 'Target value').value = null
    cellOf(ms, ANON, 'Definition').value = 'Smaller groups are fine.'
    cellOf(ss, SPEND, 'Current value', 'meritBudget').value = 0.04
    cellOf(ss, SPEND, 'Current value', 'healthyBand').value = '1.2 to 0.8'
    cellOf(ss, VOL, 'Current value', 'annualize').value = 'Off'
    cellOf(ss, ANON, 'Current value', 'minGroup').value = 3
    cellOf(ss, ANON, 'Current value', 'payOptIn').value = 'Off'
    const extra = ms.addRow(['talent.unknown.metric', 'Gone'])
    extra.commit()

    const r = await importDictionary(await toBuffer(wb), changed, FIXTURE)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.report.changed.map((c) => [c.metricId, c.field, c.to])).toEqual([
      [VOL, 'population', 'Employees only.'],
      [VOL, 'target', null],
      [VOL, 'params.annualize', false],
      [SPEND, 'params.meritBudget', 0.04],
    ])
    expect(r.report.rejected.map((x) => [x.metricId, x.field, x.sheet, x.reason])).toEqual([
      [SPEND, 'target', METRICS_SHEET, 'Give both a target rule and a target value, or leave both blank.'],
      [ANON, 'definition', METRICS_SHEET, 'The wording of anonymity minimum is locked.'],
      [
        SPEND,
        'params.healthyBand',
        SETTINGS_SHEET,
        'Healthy compa-ratio band: the low end must be below the high end.',
      ],
      [
        ANON,
        'params.minGroup',
        SETTINGS_SHEET,
        'Smallest group shown can be raised, never lowered: enter 5 or more.',
      ],
      [ANON, 'params.payOptIn', SETTINGS_SHEET, "Pay amounts are opt-in is locked and can't be changed."],
    ])
    expect(r.report.unknown).toEqual(['talent.unknown.metric'])
    expect(r.report.summary).toBe(
      'Changed 4 values in 2 metrics. 5 values were not applied. 1 metric ID in the file is not in Census and was skipped.',
    )
    const minRow = r.report.rejected.find((x) => x.field === 'params.minGroup')!
    expect(rejectedText(minRow, FIXTURE)).toBe(
      `Settings row ${minRow.row}, Anonymity minimum (smallest group shown): Smallest group shown can be raised, never lowered: enter 5 or more.`,
    )
    // Refused values keep what was in force.
    const m = metricsApi(r.state, FIXTURE)
    expect(m.range(SPEND, 'healthyBand')).toEqual([0.85, 1.15])
    expect(m.num(ANON, 'minGroup')).toBe(8)
  })

  it('refuses a file that is not a dictionary', async () => {
    const ExcelJS = await loadExcel()
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Data').addRow(['Employee ID', 'Name'])
    const r = await importDictionary(await toBuffer(wb), EMPTY_METRICS, FIXTURE)
    expect(r).toEqual({
      ok: false,
      error:
        'This is not a Census metric dictionary: it has no Metrics or Settings sheet with a Metric ID column.',
    })
    const junk = await importDictionary(new Uint8Array([1, 2, 3]), EMPTY_METRICS, FIXTURE)
    expect(junk).toEqual({ ok: false, error: 'The file is not an Excel workbook Census can read.' })
  })
})

describe('dictionaryFileName', () => {
  it('follows the slug style of every other Census export', () => {
    expect(dictionaryFileName('2026-10-04')).toBe('census-metric-dictionary-2026-10-04')
  })
})
