import { describe, expect, it } from 'vitest'
import { type DatasetVersion, emptyIssueCounts, makeVersion, type RuleResult } from '@/data/quality'
import {
  CONTROL_LABEL,
  certificationText,
  certifyChecklist,
  checkControl,
  controlChoices,
  controlValueText,
  historyRows,
  newControlDraft,
  parseAmount,
  parseTolerance,
  readiness,
  validateControls,
} from './certify'

const rule = (id: RuleResult['id'], gate: RuleResult['gate'], pass: boolean): RuleResult => ({
  id,
  label: id,
  gate,
  pass,
  detail: '',
  count: 0,
  rows: [],
})

const RULES: RuleResult[] = [
  rule('has-rows', 'silver', true),
  rule('mapping-confirmed', 'silver', false),
  rule('no-blocking', 'silver', true),
  rule('issue-rate', 'silver', true),
  rule('references', 'silver', true),
  rule('certified', 'gold', false),
  rule('control-totals', 'gold', true),
  rule('fresh', 'gold', false),
  rule('dates-in-order', null, true),
]

describe('checklist and readiness', () => {
  it('lists the silver gates and freshness', () => {
    expect(certifyChecklist(RULES).map((r) => r.id)).toEqual([
      'mapping-confirmed',
      'no-blocking',
      'issue-rate',
      'references',
      'fresh',
    ])
  })

  it('blocks certifying until every silver check passes', () => {
    const r = readiness(RULES)
    expect(r.canCertify).toBe(false)
    expect(r.blocking.map((x) => x.id)).toEqual(['mapping-confirmed'])
    expect(r.goldAlsoNeeds.map((x) => x.id)).toEqual(['fresh'])
    const ok = readiness(RULES.map((x) => (x.id === 'mapping-confirmed' ? { ...x, pass: true } : x)))
    expect(ok.canCertify).toBe(true)
  })
})

describe('control totals', () => {
  it('parses amounts people type', () => {
    expect(parseAmount('1,452')).toBe(1452)
    expect(parseAmount(' $12,500,000.50 ')).toBe(12_500_000.5)
    expect(parseAmount('USD 900')).toBe(900)
    expect(parseAmount('12 500')).toBe(12_500)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('about 12')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
  })

  it('parses the allowed difference as a percent', () => {
    expect(parseTolerance('')).toBe(0.005)
    expect(parseTolerance('1')).toBe(0.01)
    expect(parseTolerance('0.25%')).toBe(0.0025)
    expect(parseTolerance('11')).toBeNull()
    expect(parseTolerance('-1')).toBeNull()
  })

  it('checks a total against the data', () => {
    expect(checkControl(1000, 1004, 0.005)).toEqual({
      actual: 1004,
      diff: 4,
      diffShare: 0.004,
      reconciles: true,
    })
    expect(checkControl(1000, 990, 0.005).reconciles).toBe(false)
    expect(checkControl(null, 990, 0.005).reconciles).toBeNull()
    expect(checkControl(0, 0, 0.005)).toMatchObject({ diffShare: null, reconciles: true })
  })

  it('validates drafts and fills in labels', () => {
    const a = { ...newControlDraft('activeHeadcount', 'a'), expected: '1,452' }
    const b = { ...newControlDraft('rows', 'b'), expected: 'lots' }
    const c = {
      ...newControlDraft('rows', 'c'),
      label: '  Rows per Workday ',
      expected: '10',
      tolerance: '50',
    }
    const out = validateControls([a, b, c])
    expect(out.totals).toEqual([
      { label: CONTROL_LABEL.activeHeadcount, metric: 'activeHeadcount', expected: 1452, tolerance: 0.005 },
    ])
    expect(Object.keys(out.errors)).toEqual(['b', 'c'])
    expect(out.errors.c).toMatch(/between 0% and 10%/)
  })

  it('offers pay totals only while pay amounts are shown', () => {
    expect(controlChoices('comp', false)).toEqual(['rows'])
    expect(controlChoices('comp', true)).toEqual(['rows', 'totalBaseUsd'])
    expect(controlChoices('employees', false)).toContain('activeHeadcount')
  })

  it('formats values', () => {
    expect(controlValueText('activeHeadcount', 1452)).toBe('1,452')
    expect(controlValueText('rows', null)).toBe('—')
    expect(controlValueText('totalBaseUsd', 1234567)).toBe('$1,234,567')
  })
})

describe('certification and history', () => {
  const base = (id: string, extra: Partial<DatasetVersion> = {}): DatasetVersion => ({
    ...makeVersion({ dataset: 'employees', source: 'upload', rows: [], versionId: id }),
    issues: emptyIssueCounts(3),
    rowCount: 3,
    ...extra,
  })

  it('describes a certification', () => {
    const cert = { by: 'Jamie', at: '2026-10-02T09:00:00Z', versionId: 'v2' }
    expect(certificationText(base('v2', { certification: cert }), '2026')).toBe('Certified 2 Oct by Jamie')
    expect(certificationText(base('v3', { certification: cert }), '2026')).toBe(
      'Certified for an earlier version',
    )
    expect(certificationText(base('v3'))).toBe('Not certified')
  })

  it('lists the current version first, then earlier ones', () => {
    const current = base('v3', {
      fileName: 'roster.xlsx',
      sheetName: 'Active',
      importedAt: '2026-10-03T08:00:00Z',
      mappingConfirmedAt: '2026-10-03T09:00:00Z',
      mappingConfirmedBy: '',
    })
    const older = base('v2', {
      source: 'sample',
      certification: {
        by: 'HRIS team',
        at: '2026-09-30T09:00:00Z',
        versionId: 'v2',
        note: 'Matches Workday',
      },
    })
    const rows = historyRows(current, [older, current], '2026')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      current: true,
      source: 'roster.xlsx › Active',
      loaded: '3 Oct',
      mapping: 'Confirmed 3 Oct by you',
      certification: 'Not certified',
      note: null,
    })
    expect(rows[1]).toMatchObject({
      current: false,
      source: 'Sample',
      loaded: '—',
      certification: 'Certified 30 Sep by HRIS team',
      note: 'Matches Workday',
    })
  })
})
