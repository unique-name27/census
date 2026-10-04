/**
 * Drill-down consistency: every number on the Talent view opens exactly the records it counts
 * (a rate opens its numerator), and numbers hidden to protect anonymity open nothing.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Kpi } from '@/components/types'
import { buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import type { Datasets, Employee, LearningRecord, Review, SuccessionPlan } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import { buildDrillTable, PERSON_KEY } from '@/drill/records'
import { PERF_BANDS } from './base'
import { specOf, type TalentDrill } from './drills'
import { computeTalent, type TalentModel } from './index'
import { RATINGS } from './performance'
import { RISK_BANDS } from './risk'
import { BENCH_SCOPES, COVERAGE_ORDER } from './succession'
import { course, ctxFor, emp, review, sourcesFor } from './test-fixtures'

/** How many records a drill opens, or null when it opens nothing. */
const count = (d: TalentDrill): number | null => specOf(d)?.rows.length ?? null
const kpi = (m: TalentModel, id: string): Kpi => m.kpis.find((k) => k.id === id)!

let data: Datasets
let m: TalentModel
let scoped: TalentModel

const modelFor = (filters: Partial<Filters> = {}) =>
  computeTalent(
    buildContext({
      data,
      sources: sourcesFor(data, 'sample'),
      filters: { ...DEFAULT_FILTERS, ...filters },
      asOfOverride: null,
      showPay: false,
    }),
  )

beforeAll(() => {
  data = generateSample()
  m = modelFor()
  scoped = modelFor({ businessUnit: ['Operations'] })
})

/** Every chart and table number of a model opens as many records as it shows. */
function expectConsistent(model: TalentModel) {
  const d = model.drill
  const perf = model.performance

  // Rating distribution: people per rating.
  for (const row of perf.distribution) expect(count(d.rating(row.rating)), row.label).toBe(row.people || null)

  // Folded breakdowns: rated and rated 4-5 per row; hidden rows open nothing.
  for (const [dim, rows] of [
    ['department', perf.byDepartment],
    ['businessUnit', perf.byBusinessUnit],
    ['level', perf.byLevel],
  ] as const) {
    for (const row of rows) {
      if (row.high == null) {
        expect(d.highShare(dim, row, 'rated'), `${dim} ${row.group}`).toBeNull()
        expect(d.highShare(dim, row, 'high')).toBeNull()
      } else {
        expect(count(d.highShare(dim, row, 'rated')), `${dim} ${row.group}`).toBe(row.rated)
        expect(count(d.highShare(dim, row, 'high'))).toBe(row.high || null)
      }
    }
  }

  // Rating mix: everyone rated, and each rating's share times the people rated.
  for (const row of perf.mix) {
    if (row.rated < 5) {
      expect(d.mix(row.businessUnit, null)).toBeNull()
      continue
    }
    expect(count(d.mix(row.businessUnit, null))).toBe(row.rated)
    RATINGS.forEach((r) => {
      const share = row[`r${r}` as 'r1']
      expect(count(d.mix(row.businessUnit, r)) ?? 0).toBe(Math.round((share ?? 0) * row.rated))
    })
  }

  // Calibration: the people measured, and those moved down and up.
  for (const row of perf.calibration) {
    if (row.shift == null) {
      expect(d.calibration(row.businessUnit, 'all')).toBeNull()
      continue
    }
    expect(count(d.calibration(row.businessUnit, 'all'))).toBe(row.n)
    expect(count(d.calibration(row.businessUnit, 'down')) ?? 0).toBe(Math.round((row.movedDown ?? 0) * row.n))
    expect(count(d.calibration(row.businessUnit, 'up')) ?? 0).toBe(Math.round((row.movedUp ?? 0) * row.n))
  }

  // Average rating by cycle: the ratings averaged, nothing where the average is hidden.
  for (const row of perf.cycles) {
    expect(count(d.cycleUnit(row.cycle, row.businessUnit))).toBe(row.mean == null ? null : row.rated)
  }

  // Exits by rating: everyone rated, who left by type, all leavers.
  perf.exitByRating.forEach((row, i) => {
    const rating = i + 1
    if (row.voluntary == null) {
      expect(d.exitCohort(rating, 'rated')).toBeNull()
      expect(d.exitCohort(rating, 'left')).toBeNull()
      return
    }
    expect(count(d.exitCohort(rating, 'rated'))).toBe(row.rated)
    expect(count(d.exitCohort(rating, 'Voluntary')) ?? 0).toBe(row.voluntary)
    expect(count(d.exitCohort(rating, 'Involuntary')) ?? 0).toBe(row.involuntary)
    expect(count(d.exitCohort(rating, 'left')) ?? 0).toBe(row.voluntary + (row.involuntary ?? 0))
  })

  // 9-box cells.
  for (const cell of model.nineBox.cells) {
    expect(count(d.nineBox(cell.performance, cell.potential, 'all'))).toBe(cell.count || null)
    expect(count(d.nineBox(cell.performance, cell.potential, 'highRisk'))).toBe(cell.highRisk || null)
  }

  // Succession: roles per coverage cell, successors per bench cell, roles per bench table row.
  const succ = model.succession
  for (const row of succ.coverageByUnit) {
    expect(count(d.coverageCell(row.businessUnit, row.coverage))).toBe(row.roles || null)
  }
  for (const scope of BENCH_SCOPES) {
    for (const row of succ.bench[scope]) {
      expect(count(d.bench(scope, row.businessUnit, row.readiness))).toBe(row.successors || null)
    }
    for (const row of succ.benchTable[scope]) {
      expect(count(d.benchRoles(scope, row.businessUnit, 'all'))).toBe(row.roles)
      expect(count(d.bench(scope, row.businessUnit, null))).toBe(row.successors || null)
      expect(count(d.benchRoles(scope, row.businessUnit, 'none'))).toBe(row.noSuccessor || null)
    }
  }
  for (const role of succ.roles) {
    expect(count(d.roleBench(role.roleId, null))).toBe(role.successors || null)
    expect(count(d.roleBench(role.roleId, 'Ready now'))).toBe(role.readyNow || null)
  }
  for (const [dim, rows] of [
    ['level', succ.hipoByLevel],
    ['businessUnit', succ.hipoByUnit],
  ] as const) {
    for (const row of rows) {
      if (row.high == null) {
        expect(d.hipo(dim, row, 'assessed')).toBeNull()
        continue
      }
      expect(count(d.hipo(dim, row, 'assessed'))).toBe(row.assessed)
      expect(count(d.hipo(dim, row, 'high'))).toBe(row.high || null)
    }
  }

  // Retention: people per band, drivers, the back-test.
  const ret = model.retention
  for (const row of ret.bands) {
    expect(count(d.band(row.band, 'scope'))).toBe(row.share == null ? null : row.people || null)
  }
  for (const row of ret.drivers) {
    expect(count(d.driver(row.key, 'any'))).toBe(row.anyReason || null)
    expect(count(d.driver(row.key, 'main'))).toBe(row.topReason || null)
  }
  for (const row of model.risk.backTest.bands) {
    if (row.rate == null) continue
    expect(count(d.backTest(row.band, 'scored'))).toBe(row.people)
    expect(count(d.backTest(row.band, 'left'))).toBe(row.leavers || null)
    expect(count(d.backTest(row.band, 'shareOfLeavers'))).toBe(row.leavers || null)
  }

  // Learning: assignments per course and outcome, completions, overdue cells, hours.
  const l = model.learning
  for (const row of l.byCourse) {
    expect(count(d.onTime(row.course, 'due'))).toBe(row.due)
    expect(count(d.onTime(row.course, 'onTime'))).toBe(row.onTime || null)
    expect(count(d.onTime(row.course, 'late'))).toBe(row.late || null)
    expect(count(d.onTime(row.course, 'open'))).toBe(row.open || null)
  }
  for (const row of l.completions)
    expect(count(d.completions(row.month, row.kind))).toBe(row.completions || null)
  for (const [dim, cells] of [
    ['department', l.overdueByDepartment],
    ['location', l.overdueByLocation],
  ] as const) {
    for (const cell of cells) {
      if (cell.overdue == null) {
        expect(d.overdueCell(dim, cell, 'overdue'), `${cell.course} ${cell.group}`).toBeNull()
        expect(d.overdueCell(dim, cell, 'pastDue')).toBeNull()
        continue
      }
      expect(count(d.overdueCell(dim, cell, 'overdue'))).toBe(cell.overdue || null)
      expect(count(d.overdueCell(dim, cell, 'pastDue'))).toBe(cell.pastDue)
    }
  }
  for (const row of l.hours) {
    const spec = specOf(d.hours(row.businessUnit))
    if (row.perEmployee == null) {
      expect(spec).toBeNull()
      continue
    }
    const rows = (spec?.rows ?? []) as LearningRecord[]
    expect(rows.reduce((s, r) => s + (r.hours ?? 0), 0)).toBeCloseTo(row.hours, 6)
  }
}

describe('Talent drill-down on the sample company', () => {
  it('opens the records behind every KPI, numerator for rates', () => {
    const perf = m.performance
    const rated = kpi(m, 'talent-rated')
    expect(resolveDrill(rated.drill)?.rows).toHaveLength(perf.ratedActive)
    expect(resolveDrill(rated.drill)?.note).toContain(`÷ ${perf.activeCount.toLocaleString('en-US')}`)
    expect(resolveDrill(kpi(m, 'talent-high-performers').drill)?.rows).toHaveLength(
      perf.distribution[3].people + perf.distribution[4].people,
    )
    expect(resolveDrill(kpi(m, 'talent-high-potentials').drill)?.rows).toHaveLength(m.succession.hipoHigh)
    expect(resolveDrill(kpi(m, 'talent-succession-coverage').drill)?.rows).toHaveLength(
      m.succession.criticalCovered,
    )
    for (const id of ['talent-regretted-high', 'talent-key-talent-risk']) {
      const k = kpi(m, id)
      expect(k.value, id).toBeGreaterThan(0)
      expect(resolveDrill(k.drill)?.rows, id).toHaveLength(k.value!)
    }
    expect(resolveDrill(kpi(m, 'talent-training-on-time').drill)?.rows).toHaveLength(
      m.learning.current.onTime,
    )
  })

  it('every chart and table number opens as many records as it shows', () => {
    expectConsistent(m)
  })

  it('stays consistent in a scoped view, with records from that scope only', () => {
    expectConsistent(scoped)
    const units = new Set(
      ((specOf(scoped.drill.highPerformers())?.rows ?? []) as Review[]).map(
        (r) => data.employees.find((e) => e.employeeId === r.employeeId)?.businessUnit,
      ),
    )
    expect([...units]).toEqual(['Operations'])
  })

  it('opens the records behind each finding', () => {
    for (const f of m.findings) expect(resolveDrill(f.drill), f.id).not.toBeNull()
    const find = (id: string) => m.findings.find((f) => f.id === id)!
    const conc = m.learning.concentration!
    expect(resolveDrill(find('talent-training-overdue').drill)?.rows).toHaveLength(conc.top!.affected)
    expect(resolveDrill(find('talent-promotion-overdue').drill)?.rows).toHaveLength(m.overdue.rows.length)
    expect(resolveDrill(find('talent-key-talent-risk').drill)?.rows).toHaveLength(
      m.retention.keyTalent.length,
    )
    const inflation = m.performance.inflation[0]
    expect(resolveDrill(find(`talent-inflation-${inflation.businessUnit}`).drill)?.rows).toHaveLength(
      inflation.high,
    )
    const cal = m.performance.calibrationFlags[0].row
    expect(resolveDrill(find(`talent-calibration-${cal.businessUnit}`).drill)?.rows).toHaveLength(cal.n)
    const exposed = find('talent-succession-exposed')
    expect(resolveDrill(exposed.drill)?.rows).toHaveLength(exposed.people!.length)
  })

  it('lists people the panel can open, with the extra columns that matter', () => {
    const ctx = buildContext({
      data,
      sources: sourcesFor(data, 'sample'),
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay: false,
    })
    const spec = specOf(m.drill.keyTalent())!
    const table = buildDrillTable(spec, ctx)
    expect(table.rows.every((r) => typeof r[PERSON_KEY] === 'string')).toBe(true)
    const keys = table.columns.map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(['riskScore', 'mainReason', 'latestRating']))
    expect(keys).not.toContain('status')
    expect(table.rows.every((r) => (r.riskScore as number) > 0 && !!r.mainReason)).toBe(true)
    // A role list counts roles, so its rows hide the per-row successor.
    const roles = buildDrillTable(specOf(m.drill.coverage())!, ctx)
    expect(roles.columns.map((c) => c.key)).not.toContain('successor')
    expect(new Set(roles.rows.map((r) => r.roleId)).size).toBe(roles.rows.length)
    // No pay amount is ever added as an extra column.
    for (const s of [spec, specOf(m.drill.promotionOverdue())!, specOf(m.drill.band('High', 'company'))!]) {
      for (const c of s.extra?.columns ?? []) expect(c.pay).toBeUndefined()
    }
  })

  it('combines the rows a chart folds into its own "Other" row', () => {
    const rows = m.performance.byDepartment
    const rest = rows.slice(rows.length - 3)
    const other = { group: 'Other (9)', rated: 0, high: 0, share: 0, other: true, groups: 9 }
    expect(count(m.drill.highShare('department', other, 'rated', rest))).toBe(
      rest.reduce((s, r) => s + r.rated, 0),
    )
    expect(count(m.drill.highShare('department', other, 'high', rest))).toBe(
      rest.reduce((s, r) => s + (r.high ?? 0), 0),
    )
  })
})

describe('Talent drill-down and anonymity', () => {
  // 3 people in Sales, 7 in Design; 2 people at L5, 8 at L3.
  const employees: Employee[] = [
    ...Array.from({ length: 3 }, (_, i) =>
      emp(`S${i}`, { businessUnit: 'Go', department: 'Sales', level: 'L5' }),
    ),
    ...Array.from({ length: 7 }, (_, i) => emp(`D${i}`, { businessUnit: 'Core', department: 'Design' })),
  ]
  const reviews: Review[] = [
    ...employees.map((e, i) =>
      review(e.employeeId, '2026 Mid-year', '2026-06-30', i % 2 ? 4 : 3, {
        preCalibrationRating: 4,
        potential: i % 3 ? 'Moderate' : 'High',
      }),
    ),
    // A year of follow-up: 3 people rated 2 (hidden), 7 rated 3.
    ...employees.map((e, i) => review(e.employeeId, '2025 Mid-year', '2025-06-30', i < 3 ? 2 : 3)),
  ]
  const learning: LearningRecord[] = employees.map((e, i) =>
    course(e.employeeId, 'Code of conduct', { completedDate: i < 2 ? '2026-08-01' : null }),
  )
  const succession: SuccessionPlan[] = [
    {
      roleId: 'R1',
      roleTitle: 'Lead',
      incumbentId: 'D0',
      criticality: 'Critical',
      successorId: 'S0',
      readiness: 'Ready now',
    },
  ]
  const model = computeTalent(ctxFor({ employees, reviews, learning, succession }))
  const d = model.drill

  it('opens nothing for groups under 5 people, including folded rows still under 5', () => {
    // Business units: Go has 3 rated (hidden), Core 7 (shown).
    const go = model.performance.mix.find((r) => r.businessUnit === 'Go')!
    expect(go.r4).toBeNull()
    expect(d.mix('Go', null)).toBeNull()
    expect(d.mix('Go', 4)).toBeNull()
    expect(d.calibration('Go', 'all')).toBeNull()
    expect(d.cycleUnit('2026 Mid-year', 'Go')).toBeNull()
    expect(count(d.mix('Core', null))).toBe(7)
    expect(count(d.calibration('Core', 'all'))).toBe(7)
    // Departments: Sales (3) folds with Design (7) so the Other row reaches 5; no hidden numbers.
    for (const row of model.performance.byDepartment) {
      if (row.high == null) expect(d.highShare('department', row, 'rated')).toBeNull()
      else expect(count(d.highShare('department', row, 'rated'))).toBe(row.rated)
    }
    expect(model.performance.records.byDepartment.size).toBe(
      model.performance.byDepartment.filter((r) => r.high != null).length,
    )
  })

  it('carries no records for hidden buckets', () => {
    for (const [label, list] of model.performance.records.byLevel) {
      const row = model.performance.byLevel.find((r) => r.group === label)!
      expect(row.high, label).not.toBeNull()
      expect(list).toHaveLength(row.rated)
    }
    for (const row of model.succession.hipoByLevel) {
      expect(model.succession.records.hipoByLevel.has(row.group)).toBe(row.high != null)
    }
    // Overdue grid: 10 past due in one cell is shown; split by location below 5 it is not.
    for (const cell of model.learning.overdueByDepartment) {
      if (cell.pastDue < 5) expect(d.overdueCell('department', cell, 'pastDue')).toBeNull()
    }
    // Exits by rating: a rating held by 3 people opens nothing, one held by 7 does.
    expect(model.performance.exitCycle?.cycle).toBe('2025 Mid-year')
    expect(model.performance.records.exitCohort[1]).toBeNull()
    expect(d.exitCohort(2, 'rated')).toBeNull()
    expect(d.exitCohort(2, 'left')).toBeNull()
    expect(count(d.exitCohort(3, 'rated'))).toBe(7)
  })

  it('opens nothing for an empty number', () => {
    const none = computeTalent(ctxFor({}))
    expect(none.kpis.every((k) => resolveDrill(k.drill) == null)).toBe(true)
    expect(none.drill.keyTalent()).toBeNull()
    expect(none.drill.coverage()).toBeNull()
    for (const p of PERF_BANDS) expect(none.drill.nineBox(p, 'High', 'all')).toBeNull()
    for (const b of RISK_BANDS) expect(none.drill.band(b, 'scope')).toBeNull()
    for (const c of COVERAGE_ORDER) expect(none.drill.coverageCell('Core', c)).toBeNull()
  })
})
