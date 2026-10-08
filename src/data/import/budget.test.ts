/**
 * The headcount and cost budget (docs/ROLES-V2.md, "Decisions made") through the real pipeline:
 * sheet → detect → auto-map → apply, with planning-tool headers.
 */
import { describe, expect, it } from 'vitest'
import { cachedSample } from '../sample'
import { rawExtract } from '../sample/raw'
import { datasetDef } from '../schema'
import { applyMapping } from './apply'
import { autoMap } from './automap'
import { DOCUMENTED_DEFAULTS } from './defaults'
import { guessDataset } from './detect'
import { sheetFromRows } from './sheet'

const def = datasetDef('budget')

function run(aoa: unknown[][], name = 'Sheet1') {
  const sheet = sheetFromRows(name, aoa)!
  const mapping = autoMap(sheet.headers, sheet.rows, def)
  return { sheet, mapping, result: applyMapping<'budget'>({ sheet, def, mapping }) }
}

const sheet = [
  [
    'Version name',
    'Fiscal Period',
    'Business Unit',
    'Dept',
    'Cost Centre',
    'Budgeted HC',
    'Budget Cost',
    'Currency',
  ],
  ['FY27 budget', 'Nov 2026', 'Silicon Engineering', 'Design Verification', '1130-BLR', 69, '305,300', 'US$'],
  ['FY27 budget', '2026-12', 'Silicon Engineering', 'Design Verification', '1130-BLR', 70, 310000, null],
  ['FY27 budget', '2026-12-01', 'Go-to-Market', null, null, 176, 2653300, 'eur'],
  ['FY27 budget', '2026-12-01', 'Corporate', 'Finance', null, -2, 50000, 'USD'],
  ['FY27 budget', '2026-12-01', 'Operations', 'Supply Chain', null, 40, null, null],
  ['FY27 budget', '2026-12-01', 'Corporate', 'Legal', null, 12, -5, 'USD'],
]

describe('the budget sheet', () => {
  it('is recognized by its columns, and the hiring plan stays the hiring plan', () => {
    expect(guessDataset(sheetFromRows('FY27', sheet)!)[0].key).toBe('budget')
    expect(guessDataset(sheetFromRows('Budget', sheet)!)[0].key).toBe('budget')
    const plan = rawExtract('hiringPlan', cachedSample())
    expect(guessDataset(sheetFromRows(plan.sheetName, plan.aoa)!)[0].key).toBe('hiringPlan')
    const budget = rawExtract('budget', cachedSample())
    expect(guessDataset(sheetFromRows(budget.sheetName, budget.aoa)!)[0].key).toBe('budget')
  })

  it('maps planning-tool headers to the budget fields', () => {
    const { mapping } = run(sheet)
    expect(Object.fromEntries(Object.entries(mapping).map(([k, m]) => [k, m.header]))).toEqual({
      period: 'Fiscal Period',
      businessUnit: 'Business Unit',
      department: 'Dept',
      costCenter: 'Cost Centre',
      budgetHeadcount: 'Budgeted HC',
      budgetCost: 'Budget Cost',
      currency: 'Currency',
      planVersion: 'Version name',
    })
  })

  it('keeps months as their first day, reads amounts and currency spellings, and fills a blank currency', () => {
    const { result } = run(sheet)
    const rows = result.rows
    expect(rows.map((r) => r.period)).toEqual([
      '2026-11-01',
      '2026-12-01',
      '2026-12-01',
      '2026-12-01',
      '2026-12-01',
    ])
    expect(rows.map((r) => r.department ?? r.businessUnit)).toEqual([
      'Design Verification',
      'Design Verification',
      'Go-to-Market',
      'Supply Chain',
      'Legal',
    ])
    expect(rows[0]).toMatchObject({
      budgetHeadcount: 69,
      budgetCost: 305_300,
      currency: 'USD',
      costCenter: '1130-BLR',
    })
    // A blank currency beside a cost reads as USD, and the log says so.
    expect(rows[1].currency).toBe('USD')
    expect(result.issues.some((i) => i.field === 'currency' && i.code === 'defaulted')).toBe(true)
    expect(rows[2]).toMatchObject({ department: null, costCenter: null, currency: 'EUR' })
    // A line with no cost gets no currency.
    expect(rows[3]).toMatchObject({ budgetCost: null, currency: null })
  })

  it('leaves a headcount or cost below zero blank, and skips a line with no headcount', () => {
    const { result } = run(sheet)
    const negative = result.issues.filter((i) => i.code === 'out-of-range')
    expect(negative.map((i) => [i.field, i.action])).toEqual([
      ['budgetHeadcount', 'row-skipped'],
      ['budgetCost', 'left-blank'],
    ])
    expect(negative[1].issue).toBe('Budget cost -5 is below zero, so it was left blank.')
    expect(result.rows.some((r) => r.department === 'Finance')).toBe(false)
    expect(result.rows.find((r) => r.department === 'Legal')?.budgetCost).toBeNull()
  })

  it('documents the defaults it applies', () => {
    expect(DOCUMENTED_DEFAULTS.budget.join(' ')).toMatch(/Currency blank: USD/)
    // The cost is a pay amount: exports leave it out unless pay amounts are on.
    expect(def.fields.find((f) => f.key === 'budgetCost')).toMatchObject({ pay: true, type: 'money' })
    expect(def.fields.filter((f) => f.required).map((f) => f.key)).toEqual([
      'period',
      'businessUnit',
      'budgetHeadcount',
    ])
  })
})
