import { describe, expect, it } from 'vitest'
import type { SuccessionPlan } from '@/data/schema'
import { buildBase } from './base'
import { computeSuccession, criticalCoverage } from './succession'
import { ctxFor, emp, review } from './test-fixtures'

const plan = (
  o: Partial<SuccessionPlan> & Pick<SuccessionPlan, 'roleId' | 'incumbentId'>,
): SuccessionPlan => ({
  roleTitle: `Role ${o.roleId}`,
  criticality: 'Critical',
  successorId: null,
  readiness: null,
  incumbentRiskOfLoss: 'Low',
  ...o,
})

const employees = [
  ...['I1', 'I2', 'I3', 'I4'].map((id) =>
    emp(id, { level: 'M2', businessUnit: id === 'I4' ? 'Ops' : 'Eng' }),
  ),
  ...['S1', 'S2', 'S4'].map((id) => emp(id, { level: 'M1' })),
  emp('S3', { level: 'M1', terminationDate: '2026-05-01', terminationType: 'Voluntary' }),
]
const succession: SuccessionPlan[] = [
  plan({ roleId: 'R1', incumbentId: 'I1', successorId: 'S1', readiness: 'Ready now' }),
  plan({ roleId: 'R1', incumbentId: 'I1', successorId: 'S2', readiness: 'Ready in 1-2 years' }),
  // The only successor left the company, so the role has nobody.
  plan({ roleId: 'R2', incumbentId: 'I2', successorId: 'S3', readiness: 'Ready now' }),
  plan({ roleId: 'R3', incumbentId: 'I3', successorId: 'S4', readiness: 'Ready in 3+ years' }),
  plan({ roleId: 'R4', incumbentId: 'I4', criticality: 'Key', incumbentRiskOfLoss: 'High' }),
]

describe('computeSuccession', () => {
  const ctx = ctxFor({ employees, succession })
  const r = computeSuccession(buildBase(ctx), new Map())
  const role = (id: string) => r.roles.find((x) => x.roleId === id)!

  it('classifies each role by its bench', () => {
    expect(role('R1').status).toBe('Covered')
    expect(role('R1').readiness).toBe('1 ready now, 1 in 1-2 yrs')
    expect(role('R1').successorNames).toBe('Person S1, Person S2')
    expect(role('R2').status).toBe('No successor')
    expect(role('R3').status).toBe('Thin')
    expect(role('R3').coverage).toBe('Ready in 3+ years')
    expect(role('R4').status).toBe('No successor')
    expect(role('R4').readiness).toBe('None named')
    expect(r.departedSuccessors).toBe(1)
  })

  it('measures coverage over critical roles only', () => {
    expect(r.critical).toBe(3)
    expect(r.criticalCovered).toBe(1)
    expect(r.coverage).toBeCloseTo(1 / 3, 9)
  })

  it('sorts critical roles first, gaps before covered roles', () => {
    expect(r.roles.map((x) => x.roleId)).toEqual(['R2', 'R3', 'R1', 'R4'])
  })

  it('counts roles by best readiness per business unit', () => {
    const eng = r.coverageByUnit.filter((c) => c.businessUnit === 'Eng')
    expect(Object.fromEntries(eng.map((c) => [c.coverage, c.roles]))).toEqual({
      'Ready now': 1,
      'Ready in 1-2 years': 0,
      'Ready in 3+ years': 1,
      'No successor': 1,
    })
    expect(r.benchTable.find((b) => b.businessUnit === 'Ops')?.noSuccessor).toBe(1)
    expect(
      r.pipeline.find((p) => p.readiness === 'Ready now' && p.criticality === 'Critical')?.successors,
    ).toBe(1)
  })

  it('gives the cheap headline the same answer', () => {
    // The departed successor does not count, matching the full engine.
    expect(criticalCoverage({ ctx, byId: ctx.org.byId, asOf: ctx.asOf })).toEqual({ covered: 1, critical: 3 })
  })

  it('labels incumbents missing from the roster instead of inventing an org', () => {
    const missing = computeSuccession(
      buildBase(ctxFor({ employees, succession: [plan({ roleId: 'R9', incumbentId: 'NOPE' })] })),
      new Map(),
    )
    expect(missing.roles[0].businessUnit).toBe('Not in roster')
    expect(missing.roles[0].incumbent).toBe('NOPE')
  })

  it('finds high potentials by level among active people', () => {
    const withPotential = computeSuccession(
      buildBase(
        ctxFor({
          employees: [...employees, ...Array.from({ length: 6 }, (_, i) => emp(`H${i}`, { level: 'L4' }))],
          reviews: Array.from({ length: 6 }, (_, i) =>
            review(`H${i}`, '2025 Annual', '2025-12-15', 4, { potential: i < 3 ? 'High' : 'Moderate' }),
          ),
        }),
      ),
      new Map(),
    )
    expect(withPotential.potentialCycle?.cycle).toBe('2025 Annual')
    expect(withPotential.hipoAssessed).toBe(6)
    expect(withPotential.hipoHigh).toBe(3)
    expect(withPotential.hipoShare).toBeCloseTo(0.5, 9)
    expect(withPotential.hipoByLevel).toEqual([{ group: 'L4', assessed: 6, high: 3, share: 0.5 }])
  })

  it('returns empty results without succession data', () => {
    const empty = computeSuccession(buildBase(ctxFor({ employees })), new Map())
    expect(empty.roles).toEqual([])
    expect(empty.coverage).toBeNull()
    expect(empty.hipoShare).toBeNull()
  })
})
