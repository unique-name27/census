import { describe, expect, it } from 'vitest'
import { computeQuality } from '@/data/quality/compute'
import { DEFAULT_QUALITY_RULES } from '@/data/quality/rules'
import { datasetDef } from '@/data/schema'
import { roomMeta } from '../../ui/meta'
import { metricImpact } from './impact'
import { checkExportRows, qualityReportSheets, REPORT_SHEETS } from './report'
import {
  CURRENT_BASIS,
  cellFillText,
  cellProblems,
  checkRows,
  datasetSummary,
  fieldCells,
  problemRows,
  RECORD_BASIS,
  recordTier,
  trendRows,
  versionIssueRate,
  versionText,
} from './summary'
import {
  AS_OF,
  fallbackOf,
  gappyCompany,
  gappyQuality,
  gappyVersions,
  METRICS,
  version,
} from './test-fixtures'

const data = gappyCompany()
const versions = gappyVersions(data)
const quality = gappyQuality(data)

describe('dataset summary', () => {
  it('states tier, version, mapping, certification, freshness and issue rate', () => {
    const r = datasetSummary({
      key: 'employees',
      quality,
      version: versions.employees,
      asOf: AS_OF,
    })
    expect(r).toMatchObject({
      dataset: 'Employees',
      tier: 'gold',
      tierLabel: 'Gold',
      version: 'employees.xlsx',
      loaded: '2026-09-29',
      rows: 40,
      mapping: 'Confirmed 29 Sep by HRIS team',
      certification: 'Certified 29 Sep by HRIS team',
      certified: true,
      freshness: '29 d old, limit 120 d',
      fresh: true,
      issueRate: 0,
      fieldsBelow: 1,
      next: null,
    })
    const reqs = datasetSummary({
      key: 'requisitions',
      quality,
      version: versions.requisitions,
      asOf: AS_OF,
    })
    expect(reqs).toMatchObject({
      tier: 'silver',
      certification: 'Not certified',
      next: 'To reach gold: certified for this version.',
    })
    const comp = datasetSummary({ key: 'comp', quality, version: null, asOf: AS_OF })
    expect(comp).toMatchObject({
      tier: 'none',
      version: 'Nothing loaded',
      rows: 0,
      freshness: 'No dates to judge by',
    })
  })

  it('reads freshness as the tier judges it, so the column never contradicts the checks', () => {
    // A generated pay extract describes the date the sample does, 30 Sep; a later reporting date
    // makes it old, as the Fresh check says.
    const comp = gappyCompany()
    comp.comp = [
      {
        employeeId: 'E001',
        currency: 'USD',
        baseSalary: 100_000,
        rangeMin: 80_000,
        rangeMid: 100_000,
        rangeMax: 120_000,
        fxToUsd: 1,
      },
    ]
    const sample = { ...version('comp', comp), source: 'sample' as const, importedAt: null }
    const late = '2026-12-31'
    const q = computeQuality(comp, { comp: sample }, undefined, { asOf: late })
    const r = datasetSummary({ key: 'comp', quality: q, version: sample, asOf: late })
    const fresh = q.checks('comp').find((c) => c.id === 'fresh')!
    expect(fresh.pass).toBe(r.fresh)
    expect(r.ageDays).toBe(q.dataset('comp').freshness.ageDays)
    expect(r.fresh).toBe(false)
    expect(r.freshness).toMatch(/^\d+ d old, limit 45 d$/)
  })

  it('says when a certification belongs to an earlier version', () => {
    const v = { ...versions.employees!, versionId: 'employees-v3' }
    const r = datasetSummary({ key: 'employees', quality, version: v, asOf: AS_OF })
    expect(r.certification).toBe('Earlier version only')
    expect(versionText({ ...v, source: 'sample' })).toBe('Sample extract')
    expect(versionText({ ...v, sheetName: 'Roster' })).toBe('employees.xlsx › Roster')
  })
})

describe('field matrix', () => {
  it('lists every field with its fill rate and problem rows, required fields first', () => {
    const cells = fieldCells('employees', quality)
    expect(cells).toHaveLength(datasetDef('employees').fields.length)
    expect(cells.map((c) => c.position)).toEqual(cells.map((_, i) => i))
    expect(cells[0].requirement).toBe('required')
    const reason = cells.find((c) => c.ref === 'employees.terminationReason')!
    expect(reason).toMatchObject({ applicable: 10, filled: 7, blank: 3, problems: 3, tier: 'bronze' })
    expect(reason.coverage).toBeCloseTo(0.7)
    expect(reason.why).toMatch(/70% filled/)
    expect(cellProblems(reason)).toEqual([{ kind: 'blank', count: 3 }])
    expect(cellFillText(reason, 0.95)).toBe('70% filled for leavers')
    expect(cellFillText({ coverage: 0.946, scope: null, blankOk: false }, 0.95)).toBe('94.6% filled')
    expect(cellFillText({ coverage: null, scope: null, blankOk: false }, 0.95)).toBe('Applies to no row yet')
  })

  it('counts a value the importer left blank as one row with a gap, as the drill lists it', () => {
    const cell = { blank: 3, invalid: 3, invalidBlank: 3, defaulted: 0, blankOk: false }
    expect(problemRows(cell)).toBe(3)
    expect(problemRows({ ...cell, invalid: 5 })).toBe(5)
    expect(problemRows({ ...cell, invalidBlank: 0 })).toBe(6)
    // Blanks that are normal are no gap, so a blanked value counts once, as not recognized.
    expect(problemRows({ ...cell, blankOk: true })).toBe(3)
  })

  it('does not count normal blanks as problems', () => {
    expect(cellProblems({ blank: 5, invalid: 2, defaulted: 1, blankOk: true })).toEqual([
      { kind: 'invalid', count: 2 },
      { kind: 'defaulted', count: 1 },
    ])
  })
})

describe('checks and trend', () => {
  it('lists every rule result with its gate and rows', () => {
    const rows = checkRows('requisitions', quality.checks('requisitions'))
    expect(rows[0]).toMatchObject({
      dataset: 'Requisitions',
      check: 'Rows loaded',
      needed: 'Silver',
      result: 'Pass',
    })
    expect(rows.find((r) => r.id === 'certified')).toMatchObject({
      needed: 'Gold',
      pass: false,
      result: 'Fail',
    })
    expect(rows.find((r) => r.id === 'dates-in-order')?.needed).toBe('Information')
    const exported = checkExportRows(rows)
    expect(exported.find((r) => r.id === 'certified')?.count).toBeNull()
    expect(exported.find((r) => r.id === 'references')?.count).toBe(0)
  })

  it('judges earlier versions by what their record keeps', () => {
    const v = version('employees', data)
    expect(recordTier(v, DEFAULT_QUALITY_RULES)).toBe('bronze')
    expect(recordTier({ ...v, mappingConfirmedAt: '2026-09-01' }, DEFAULT_QUALITY_RULES)).toBe('silver')
    expect(recordTier(versions.employees!, DEFAULT_QUALITY_RULES)).toBe('gold')
    const messy = {
      ...v,
      mappingConfirmedAt: '2026-09-01',
      issues: { ...v.issues, rowsIn: 100, rowsWithErrors: 5 },
    }
    expect(versionIssueRate(messy)).toBe(0.05)
    expect(recordTier(messy, DEFAULT_QUALITY_RULES)).toBe('bronze')
    expect(recordTier({ ...v, rowCount: 0 }, DEFAULT_QUALITY_RULES)).toBe('none')
  })

  it('puts earlier versions first, oldest first, and the current one last', () => {
    const older = {
      ...version('employees', data),
      versionId: 'employees-v0',
      importedAt: '2026-07-01T09:00:00Z',
    }
    const old = {
      ...version('employees', data),
      versionId: 'employees-v1',
      importedAt: '2026-08-01T09:00:00Z',
    }
    const rows = trendRows({
      key: 'employees',
      current: versions.employees,
      history: [old, older],
      currentTier: 'gold',
      currentIssueRate: 0,
      rules: DEFAULT_QUALITY_RULES,
    })
    expect(rows.map((r) => r.versionId)).toEqual(['employees-v0', 'employees-v1', 'employees-v2'])
    expect(rows.map((r) => r.basis)).toEqual([RECORD_BASIS, RECORD_BASIS, CURRENT_BASIS])
    expect(rows.map((r) => r.tierLabel)).toEqual(['Bronze', 'Bronze', 'Gold'])
    expect(rows[0].loaded).toBe('2026-07-01')
  })
})

describe('the Data quality report', () => {
  it('puts every section on its own sheet', () => {
    const impact = metricImpact({ metrics: METRICS, quality, fallbackOf })
    const sheets = qualityReportSheets({
      datasets: [
        datasetSummary({
          key: 'employees',
          quality,
          version: versions.employees,
          asOf: AS_OF,
        }),
      ],
      fields: fieldCells('employees', quality),
      fixes: impact.fixes,
      metrics: impact.metrics,
      checks: checkRows('employees', quality.checks('employees')),
      trend: [],
    })
    expect(sheets.map((s) => s.name)).toEqual([...REPORT_SHEETS])
    expect(sheets[1].rows).toHaveLength(datasetDef('employees').fields.length)
    expect(sheets[2].rows[0]).toMatchObject({
      rank: 1,
      fix: 'Filling termination reason for 3 leavers would lift 2 metrics to Gold.',
      lifted: 2,
      toGold: 2,
      field: 'Termination reason',
    })
    for (const s of sheets) {
      expect(s.title).toBeTruthy()
      for (const c of s.columns) expect(c.label).not.toMatch(/—/)
    }
  })

  it('writes a styled workbook with one sheet per section', async () => {
    const { buildWorkbook } = await import('@/lib/export/xlsx')
    const impact = metricImpact({ metrics: METRICS, quality, fallbackOf })
    const sheets = qualityReportSheets({
      datasets: [
        datasetSummary({
          key: 'employees',
          quality,
          version: versions.employees,
          asOf: AS_OF,
        }),
      ],
      fields: fieldCells('employees', quality),
      fixes: impact.fixes,
      metrics: impact.metrics,
      checks: checkRows('employees', quality.checks('employees')),
      trend: [],
    })
    const wb = await buildWorkbook(sheets, roomMeta({ asOf: AS_OF, isSample: false }, 'Data quality'), {
      showPay: false,
    })
    expect(wb.worksheets.map((w) => w.name)).toEqual([...REPORT_SHEETS])
    const text = JSON.stringify(wb.getWorksheet('Metric impact')?.getSheetValues())
    expect(text).toContain('Filling termination reason for 3 leavers would lift 2 metrics to Gold.')
  })
})
