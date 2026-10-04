/**
 * Lineage: every KPI, figure and finding in the Talent view names the dataset fields it is
 * computed from, every name is a real schema field, and every Figure in the UI passes its fields.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { type FieldRef, invalidRefs } from '@/data/quality'
import { generateSample } from '@/data/sample'
import type { Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { computeTalent, type TalentModel } from './index'
import {
  buildLineage,
  FACTOR_USES,
  hasValues,
  type Refs,
  riskUses,
  TALENT_FIGURE_IDS,
  type TalentLineage,
} from './lineage'
import type { FACTORS, RiskModel } from './risk'
import { AS_OF, ctxFor, emp, review, sourcesFor } from './test-fixtures'

/** The view's UI source, to check that every Figure passes its fields. */
const UI_SOURCES = import.meta.glob<string>('../ui/*.tsx', { query: '?raw', import: 'default', eager: true })

let data: Datasets
let ctx: AnalyticsContext
let m: TalentModel

beforeAll(() => {
  data = generateSample()
  ctx = buildContext({
    data,
    sources: sourcesFor(data, 'sample'),
    filters: DEFAULT_FILTERS,
    asOfOverride: null,
    showPay: false,
  })
  m = computeTalent(ctx)
})

const allRefs = (l: TalentLineage): string[] =>
  [...Object.values(l.kpi), ...Object.values(l.finding), ...Object.values(l.figure)].flat()

const model = (off: RiskModel['off'], exitKind: RiskModel['exitKind'] = 'voluntary') => ({ off, exitKind })

describe('Talent lineage on the sample company', () => {
  it('names only fields that exist in the schema', () => {
    expect(invalidRefs(Object.values(FACTOR_USES).flat())).toEqual([])
    expect(invalidRefs(Object.values(m.uses).flat())).toEqual([])
    for (const k of m.kpis) expect(invalidRefs(k.uses ?? []), k.id).toEqual([])
    for (const f of m.findings) expect(invalidRefs(f.uses ?? []), f.id).toEqual([])
    for (const has of [true, false]) {
      const l = buildLineage({ has: { successionRisk: has }, risk: ['employees.hireDate'], riskHistory: [] })
      expect(invalidRefs(allRefs(l))).toEqual([])
    }
  })

  it('gives every KPI at least one field', () => {
    expect(m.kpis.length).toBeGreaterThanOrEqual(5)
    for (const k of m.kpis) expect(k.uses?.length ?? 0, k.id).toBeGreaterThan(0)
  })

  it('gives every finding at least one field', () => {
    expect(m.findings.length).toBeGreaterThan(3)
    for (const f of m.findings) expect(f.uses?.length ?? 0, f.id).toBeGreaterThan(0)
  })

  it('gives every figure at least one field', () => {
    for (const id of TALENT_FIGURE_IDS) expect(m.uses[id].length, id).toBeGreaterThan(0)
  })

  it('names no field that is blank in every row of the sample', () => {
    const refs = new Set<FieldRef>([
      ...Object.values(m.uses).flat(),
      ...m.kpis.flatMap((k) => k.uses ?? []),
      ...m.findings.flatMap((f) => f.uses ?? []),
    ])
    const blank = [...refs].filter((r) => ctx.quality.fieldTier(r) === 'none')
    expect(blank).toEqual([])
    for (const k of m.kpis) expect(ctx.quality.tierOf(k.uses, []), k.id).toBe('bronze')
  })

  it('lists each field once per number', () => {
    for (const [id, refs] of Object.entries(m.uses)) expect(new Set(refs).size, id).toBe(refs.length)
    for (const k of m.kpis) expect(new Set(k.uses).size, k.id).toBe(k.uses?.length)
  })
})

describe('Talent lineage definitions', () => {
  const l = buildLineage({ has: { successionRisk: true }, risk: ['comp.baseSalary'], riskHistory: [] })

  it('counts the fields that only pick the population', () => {
    // Rated in the latest cycle: active employees at the as-of date, then their reviews.
    expect(l.kpi['talent-rated']).toEqual(
      expect.arrayContaining([
        'employees.hireDate',
        'employees.terminationDate',
        'employees.employmentType',
        'reviews.cycle',
        'reviews.cycleDate',
      ]),
    )
    // Regretted exits of high performers: employees only, voluntary, regrettable, rated 4-5.
    expect(l.kpi['talent-regretted-high']).toEqual(
      expect.arrayContaining([
        'employees.employmentType',
        'employees.terminationDate',
        'employees.terminationType',
        'employees.regrettable',
        'reviews.rating',
      ]),
    )
    // Training on time: required assignments due, to employees employed on the due date.
    expect(l.kpi['talent-training-on-time']).toEqual(
      expect.arrayContaining([
        'learning.required',
        'learning.dueDate',
        'learning.completedDate',
        'employees.employmentType',
      ]),
    )
  })

  it('names the dimension each breakdown is grouped by', () => {
    expect(l.figure['talent-high-share-by-department']).toContain('employees.department')
    expect(l.figure['talent-high-share-by-level']).toContain('employees.level')
    expect(l.figure['talent-rating-mix']).toContain('employees.businessUnit')
    expect(l.figure['talent-calibration-shift']).toContain('reviews.preCalibrationRating')
    expect(l.figure['talent-high-potentials-by-unit']).toContain('reviews.potential')
    expect(l.finding['talent-training-overdue']).toEqual(
      expect.arrayContaining([
        'employees.businessUnit',
        'employees.department',
        'employees.location',
        'employees.level',
      ]),
    )
  })

  it('reads the flight-risk model only where a number depends on it', () => {
    expect(l.kpi['talent-key-talent-risk']).toContain('comp.baseSalary')
    expect(l.figure['talent-nine-box']).toContain('comp.baseSalary')
    expect(l.figure['talent-rating-distribution']).not.toContain('comp.baseSalary')
    expect(l.figure['talent-high-potentials-by-level']).not.toContain('comp.baseSalary')
  })

  it("uses the plan's own risk of loss when the plans record one, the model's band otherwise", () => {
    expect(l.finding['talent-succession-exposed']).toContain('succession.incumbentRiskOfLoss')
    expect(l.finding['talent-succession-exposed']).not.toContain('comp.baseSalary')
    const noRisk = buildLineage({
      has: { successionRisk: false },
      risk: ['comp.baseSalary'],
      riskHistory: [],
    })
    expect(noRisk.finding['talent-succession-exposed']).not.toContain('succession.incumbentRiskOfLoss')
    expect(noRisk.finding['talent-succession-exposed']).toContain('comp.baseSalary')
    expect(noRisk.figure['talent-critical-roles']).not.toContain('succession.incumbentRiskOfLoss')
  })
})

describe('riskUses', () => {
  it('reads every factor on the sample, and pay only for today', () => {
    const today = riskUses(m.risk, data, { today: true })
    const past = riskUses(m.risk, data, { today: false })
    expect(invalidRefs(today)).toEqual([])
    expect(today).toEqual(
      expect.arrayContaining(['comp.baseSalary', 'comp.rangeMid', 'jobChanges.changeType']),
    )
    expect(past).not.toContain('comp.baseSalary')
    expect(past).toEqual(expect.arrayContaining(['employees.terminationType', 'reviews.rating']))
    expect(m.uses['talent-risk-bands']).toEqual(today)
    expect(m.uses['talent-risk-back-test']).toEqual(past)
  })

  it('leaves out the factors that are switched off', () => {
    const off = (keys: readonly (typeof FACTORS)[number]['key'][]) =>
      model(keys.map((key) => ({ key, why: 'test' })))
    const all = riskUses(off([]), data, { today: true })
    const noJobs = riskUses(off(['promotionGap', 'highNoPromo', 'newManager']), data, { today: true })
    expect(all).toContain('jobChanges.toManagerId')
    expect(noJobs).not.toContain('jobChanges.toManagerId')
    expect(noJobs).not.toContain('jobChanges.changeType')
    // Department attrition still reads the job history back for the department at past dates.
    expect(noJobs).toContain('jobChanges.fromDepartment')
    const noComp = riskUses(off(['lowCompa']), data, { today: true })
    expect(noComp.some((r) => r.startsWith('comp.'))).toBe(false)
  })

  it('counts every exit when termination type is missing', () => {
    const typed = riskUses(model([]), data, { today: false })
    const untyped = riskUses(
      model(
        [
          { key: 'deptAttrition', why: 'Termination type is missing' },
          { key: 'siteAttrition', why: 'Termination type is missing' },
        ],
        'all',
      ),
      { ...data, employees: data.employees.map((e) => ({ ...e, terminationType: null })) },
      { today: false },
    )
    expect(typed).toContain('employees.terminationType')
    expect(untyped).not.toContain('employees.terminationType')
  })

  it('leaves out fields with no value in any row, and datasets that are not loaded', () => {
    const small = ctxFor(
      {
        employees: [emp('A'), emp('B', { managerId: 'A' })],
        reviews: [review('A', '2025 Annual', '2025-12-15', 4)],
      },
      { asOf: AS_OF },
    )
    const t = computeTalent(small)
    const refs = riskUses(t.risk, small.all, { today: true })
    expect(refs.some((r) => r.startsWith('jobChanges.') || r.startsWith('comp.'))).toBe(false)
    expect(refs).toContain('employees.hireDate')
    expect(hasValues(small.all, 'employees.terminationDate')).toBe(false)
    expect(refs).not.toContain('employees.terminationDate')
    expect(t.uses['talent-risk-bands']).toEqual(refs)
  })
})

describe('Talent UI', () => {
  const sources = Object.entries(UI_SOURCES)

  it('passes its fields to every Figure', () => {
    const seen: string[] = []
    for (const [file, src] of sources) {
      const opened = src.match(/<Figure\s/g)?.length ?? 0
      const wired = [...src.matchAll(/<Figure\s+id="([^"]+)"\s+uses=\{m\.uses\['([^']+)'\]\}/g)]
      expect(wired.length, `${file}: every <Figure> passes uses right after its id`).toBe(opened)
      for (const [, id, key] of wired) {
        expect(key, file).toBe(id)
        seen.push(id)
      }
    }
    expect([...seen].sort()).toEqual([...TALENT_FIGURE_IDS].sort())
  })

  it('declares lineage for each figure exactly once', () => {
    expect(new Set(TALENT_FIGURE_IDS).size).toBe(TALENT_FIGURE_IDS.length)
    const declared: Refs[] = TALENT_FIGURE_IDS.map((id) => m.uses[id])
    expect(declared.every((r) => r.length > 0)).toBe(true)
  })
})
