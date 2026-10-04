import { describe, expect, it } from 'vitest'
import { generateSample } from '../sample'
import { DATASETS } from '../schema'
import { APPLICABILITY, appliesTo, isFilled, notTopOfOrg } from './applicability'
import { emp } from './test-fixtures'

type Row = Record<string, unknown>
const which = (dataset: Parameters<typeof appliesTo>[0], field: string, rows: Row[]) => {
  const test = appliesTo(dataset, field, rows)
  return rows.map((r) => (test ? test(r) : true))
}

describe('applicability table', () => {
  it('names only fields that exist in the schema', () => {
    for (const [dataset, fields] of Object.entries(APPLICABILITY)) {
      const def = DATASETS.find((d) => d.key === dataset)
      expect(def, dataset).toBeDefined()
      for (const f of Object.keys(fields ?? {}))
        expect(
          def?.fields.some((x) => x.key === f),
          `${dataset}.${f}`,
        ).toBe(true)
    }
  })

  it('applies to every row when a field is not listed', () => {
    expect(appliesTo('employees', 'name', [])).toBeNull()
  })

  it('limits exit fields to leavers and the regretted flag to voluntary leavers', () => {
    const rows = [
      { terminationDate: null, terminationType: null },
      { terminationDate: '2026-01-31', terminationType: 'Voluntary' },
      { terminationDate: '2026-02-28', terminationType: 'Involuntary' },
    ]
    expect(which('employees', 'terminationType', rows)).toEqual([false, true, true])
    expect(which('employees', 'terminationReason', rows)).toEqual([false, true, true])
    expect(which('employees', 'regrettable', rows)).toEqual([false, true, false])
  })

  it('expects a termination date only where a type or reason says someone left', () => {
    const rows = [
      { terminationType: null, terminationReason: null },
      { terminationType: 'Voluntary', terminationReason: null },
      { terminationType: null, terminationReason: 'Base salary' },
    ]
    expect(which('employees', 'terminationDate', rows)).toEqual([false, true, true])
  })

  it('leaves the top of the organization out of the manager field', () => {
    const rows = [
      emp(1),
      emp(2),
      emp(3, { managerId: 'E002' }),
      emp(9, { managerId: null }),
    ] as unknown as Row[]
    const test = notTopOfOrg(rows)
    expect(rows.map(test)).toEqual([false, true, true, true])
  })

  it('applies candidate stage dates from the stage reached, and next events to active interviews only', () => {
    const rows = [
      { currentStage: 'Applied', status: 'Active' },
      { currentStage: 'Onsite', status: 'Active' },
      { currentStage: 'Offer', status: 'Rejected' },
    ]
    expect(which('candidates', 'onsiteDate', rows)).toEqual([false, true, true])
    expect(which('candidates', 'offerDate', rows)).toEqual([false, false, true])
    expect(which('candidates', 'nextEventDate', rows)).toEqual([false, true, false])
    expect(which('candidates', 'rejectionReason', rows)).toEqual([false, false, true])
    expect(APPLICABILITY.candidates?.nextEventDate.blankOk).toBe(true)
  })

  it('applies resolution to resolved cases and the assignee above Tier 0', () => {
    const rows = [
      { status: 'New', tier: 'Tier 1' },
      { status: 'Closed', tier: 'Tier 0' },
      { status: 'Resolved', tier: 'Tier 2' },
    ]
    expect(which('cases', 'resolvedAt', rows)).toEqual([false, true, true])
    expect(which('cases', 'firstResponseAt', rows)).toEqual([false, true, true])
    expect(which('cases', 'assignee', rows)).toEqual([true, false, true])
  })

  it('leaves employee relations out of the case topic, so the privacy redaction is no gap', () => {
    const rows = [
      { category: 'Payroll', subcategory: 'Missing pay' },
      { category: 'Employee relations', subcategory: null },
    ]
    expect(which('cases', 'subcategory', rows)).toEqual([true, false])
    expect(APPLICABILITY.cases?.subcategory.scope).toBe('Cases outside employee relations')
  })

  it('applies potential to cycles that assess it and retro to types that track it', () => {
    const reviews = [
      { cycle: '2025 Annual', potential: 'High' },
      { cycle: '2025 Annual', potential: null },
      { cycle: '2026 Mid-year', potential: null },
    ]
    expect(which('reviews', 'potential', reviews)).toEqual([true, true, false])
    const tx = [
      { type: 'Job change', retro: false },
      { type: 'Job change', retro: null },
      { type: 'New hire', retro: null },
    ]
    expect(which('transactions', 'retro', tx)).toEqual([true, true, false])
  })

  it('applies readiness to roles with a named successor', () => {
    expect(which('succession', 'readiness', [{ successorId: null }, { successorId: 'E002' }])).toEqual([
      false,
      true,
    ])
  })

  it('counts "Unknown", blanks and NaN as not filled', () => {
    expect([null, undefined, '', '  ', 'Unknown', Number.NaN].map(isFilled)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect([0, false, 'L3', '2026-01-01'].map(isFilled)).toEqual([true, true, true, true])
  })

  it('fills every applicable required and recommended field of the clean sample to 95%', () => {
    const data = generateSample()
    for (const def of DATASETS) {
      const rows = data[def.key] as unknown as Row[]
      for (const f of def.fields) {
        if (!f.required && !f.recommended) continue
        const rule = APPLICABILITY[def.key]?.[f.key]
        if (rule?.blankOk) continue
        const test = appliesTo(def.key, f.key, rows)
        const applicable = rows.filter((r) => !test || test(r))
        if (!applicable.length) continue
        const share = applicable.filter((r) => isFilled(r[f.key])).length / applicable.length
        expect(share, `${def.key}.${f.key}`).toBeGreaterThanOrEqual(0.95)
      }
    }
  })
})
