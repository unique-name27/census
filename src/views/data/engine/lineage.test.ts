import { describe, expect, it } from 'vitest'
import type { Mapping } from '@/data/import'
import type { DatasetVersion } from '@/data/quality'
import { emptyIssueCounts } from '@/data/quality'
import { datasetDef } from '@/data/schema'
import {
  conversionsOf,
  draftMapping,
  hasLineage,
  lineageExportRows,
  lineageRows,
  lineageSummary,
  mappingStatusText,
} from './lineage'

type V = Pick<DatasetVersion, 'mapping' | 'applyOptions' | 'issues'>

const comp = datasetDef('comp')
const employees = datasetDef('employees')

describe('conversionsOf', () => {
  it('names date order, percent scale, hourly pay and corrections', () => {
    const opts = {
      dateOrders: { Start: 'DMY' as const },
      percentWhole: { targetBonusPct: true },
      hourlyToAnnual: { hours: 2080, basisHeader: 'Pay basis' },
      valueMaps: { currency: { usd: 'USD', eur: 'EUR', xx: null } },
    }
    const hire = employees.fields.find((f) => f.key === 'hireDate')!
    expect(conversionsOf(employees, hire, 'Start', opts)).toEqual(['Dates read day first (DD/MM/YYYY)'])
    const bonus = comp.fields.find((f) => f.key === 'targetBonusPct')!
    expect(conversionsOf(comp, bonus, 'Bonus', opts)).toEqual([
      'Whole numbers read as percent (3.5 means 3.5%)',
    ])
    const base = comp.fields.find((f) => f.key === 'baseSalary')!
    expect(conversionsOf(comp, base, 'Base', opts)).toEqual([
      'Hourly rates annualized at 2,080 h a year, where Pay basis says hourly',
    ])
    const currency = comp.fields.find((f) => f.key === 'currency')!
    expect(conversionsOf(comp, currency, 'Ccy', opts)).toEqual([
      '2 values corrected by hand',
      '1 value left blank on purpose',
    ])
  })

  it('says nothing without options or a column', () => {
    const hire = employees.fields.find((f) => f.key === 'hireDate')!
    expect(conversionsOf(employees, hire, 'Start', null)).toEqual([])
    expect(conversionsOf(employees, hire, null, { dateOrders: { Start: 'MDY' } })).toEqual([])
  })
})

describe('lineageRows', () => {
  const version: V = {
    mapping: {
      employeeId: { header: 'Emp #', confidence: 'high', confirmed: true },
      baseSalary: { header: 'Annual pay', confidence: 'low', confirmed: false },
      currency: { header: null, confidence: 'low', confirmed: false },
      fxToUsd: { header: null, confidence: 'low', confirmed: false },
    },
    applyOptions: null,
    issues: { ...emptyIssueCounts(10), defaultedByField: { fxToUsd: 4 } },
  }

  it('lists every field, required first, with where its values came from', () => {
    const rows = lineageRows(comp, version, { currency: 10 })
    expect(rows).toHaveLength(comp.fields.length)
    expect(rows[0].requirement).toBe('required')
    const by = Object.fromEntries(rows.map((r) => [r.field, r]))
    expect(by.employeeId).toMatchObject({
      header: 'Emp #',
      source: 'column',
      confidence: 'high',
      confirmed: true,
    })
    expect(by.baseSalary).toMatchObject({ source: 'column', confidence: 'low', confirmed: false, pay: true })
    expect(by.currency).toMatchObject({ header: null, source: 'derived', confidence: null })
    expect(by.fxToUsd.source).toBe('defaulted')
    expect(by.fxToUsd.conversions[0]).toBe('4 rows filled by a default')
    expect(by.rangeMin.source).toBe('none')
  })

  it('summarizes and exports', () => {
    const rows = lineageRows(comp, version)
    const s = lineageSummary(rows)
    expect(s.fromFile).toBe(2)
    expect(s.lowUnreviewed).toBe(1)
    expect(s.missingNeeded).toBeGreaterThan(0)
    const out = lineageExportRows(rows)
    expect(out.find((r) => r.field === 'Employee ID')).toMatchObject({
      header: 'Emp #',
      source: 'From the file',
      confidence: 'High',
      confirmed: 'Yes',
    })
  })

  it('knows when a version has no lineage', () => {
    expect(hasLineage(version)).toBe(true)
    expect(hasLineage({ mapping: {} })).toBe(false)
  })
})

describe('mappingStatusText', () => {
  it('says who confirmed and when', () => {
    expect(
      mappingStatusText({ mappingConfirmedAt: '2026-10-02T10:00:00Z', mappingConfirmedBy: 'Jamie' }, '2026'),
    ).toBe('Confirmed 2 Oct by Jamie')
    expect(
      mappingStatusText({ mappingConfirmedAt: '2026-10-02T10:00:00Z', mappingConfirmedBy: '' }, '2026'),
    ).toBe('Confirmed 2 Oct by you')
    expect(mappingStatusText({ mappingConfirmedAt: null, mappingConfirmedBy: null })).toBe(
      'Not confirmed yet',
    )
  })
})

describe('draftMapping', () => {
  const auto: Mapping = {
    employeeId: { header: 'ID', confidence: 'high', score: 1, reason: 'Exact name' },
    baseSalary: { header: 'Salary', confidence: 'high', score: 1, reason: 'Exact name' },
    currency: { header: 'Currency', confidence: 'high', score: 1, reason: 'Exact name' },
  }

  it('keeps stored columns the sheet still has and falls back to the automatic match', () => {
    const out = draftMapping(
      comp,
      {
        employeeId: { header: 'Emp #', confidence: 'medium', confirmed: true },
        baseSalary: { header: 'Gone', confidence: 'high', confirmed: false },
        currency: { header: null, confidence: 'low', confirmed: false },
      },
      ['Emp #', 'Salary', 'Currency', 'ID'],
      auto,
    )
    expect(out.employeeId).toMatchObject({ header: 'Emp #', confidence: 'high', score: 1 })
    expect(out.baseSalary.header).toBe('Salary')
    expect(out.currency.header).toBeNull()
    expect(Object.keys(out).sort()).toEqual(comp.fields.map((f) => f.key).sort())
  })

  it('never maps one column to two fields', () => {
    const out = draftMapping(
      comp,
      { currency: { header: 'Salary', confidence: 'high', confirmed: true } },
      ['Salary', 'ID'],
      auto,
    )
    expect(out.currency.header).toBe('Salary')
    expect(out.baseSalary.header).toBeNull()
  })
})
