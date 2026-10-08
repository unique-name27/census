/**
 * The Level pyramid's definitions on small hand-built companies (docs/ANALYSES.md, 5.2 and 7.1):
 * levels a year ago from job history, a flow that reconciles at every level, the size against
 * the level below, spans per level with the five-manager rule, splits that add up to their
 * level, the company's shape scaled to the scope, what is hidden under the anonymity minimum,
 * drills that hold exactly the number clicked, and the settings each rule reads.
 */
import { describe, expect, it } from 'vitest'
import type { Employee, JobChange } from '@/data/schema'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { metricsWith } from '@/metrics/testing'
import { change, ctxOf, emp, many } from '../../../engine/fixtures'
import {
  changeSpec,
  flowSpec,
  levelsSpec,
  ratioSpec,
  rowSpec,
  segmentSpec,
  spanSpec,
  yearAgoSpec,
} from './drill'
import { pyramidModel } from './index'
import { PYRAMID_METRIC, PYRAMID_SET } from './metrics'
import { type PyramidData, pyramidData } from './model'

const rowsOf = (src: DrillSource) => resolveDrill(src)?.rows.length ?? 0

/** Two levels, a promotion, a demotion, a hire who was promoted and left, contractors, a blank level, five managers. */
function company(): { employees: Employee[]; jobChanges: JobChange[] } {
  const managers = Array.from({ length: 5 }, (_, i) =>
    emp({ employeeId: `M${i}`, level: 'M1', businessUnit: 'Unit B', hireDate: '2019-01-07' }),
  )
  const spans = [2, 3, 4, 5, 6]
  const l2 = spans.flatMap((n, i) => many(n, { level: 'L2', managerId: `M${i}`, hireDate: '2020-01-06' }))
  const employees = [
    ...managers,
    ...many(10, { level: 'L1', hireDate: '2020-01-06', businessUnit: 'Unit A' }),
    ...l2,
    // A: L1 a year ago, promoted to L2 in March.
    emp({ employeeId: 'A', level: 'L2', hireDate: '2020-01-06' }),
    // B: hired at L3 in February.
    emp({ employeeId: 'B', level: 'L3', hireDate: '2026-02-02' }),
    // C: at L2 a year ago, left in May.
    emp({
      employeeId: 'C',
      level: 'L2',
      hireDate: '2020-01-06',
      terminationDate: '2026-05-01',
      terminationType: 'Voluntary',
    }),
    // D: at L4 a year ago, moved down to L3 in April (an other change).
    emp({ employeeId: 'D', level: 'L3', hireDate: '2018-01-08' }),
    // E: hired at L2 in January, promoted to L3 in June, left in August.
    emp({
      employeeId: 'E',
      level: 'L3',
      hireDate: '2026-01-05',
      terminationDate: '2026-08-03',
      terminationType: 'Voluntary',
    }),
    emp({ employeeId: 'F', level: 'L1', employmentType: 'Contractor' }),
    emp({ employeeId: 'G', level: 'L1', employmentType: 'Intern', hireDate: '2026-06-01' }),
    emp({ employeeId: 'H', level: null }),
  ]
  const jobChanges = [
    change({
      employeeId: 'A',
      effectiveDate: '2026-03-02',
      changeType: 'Promotion',
      fromLevel: 'L1',
      toLevel: 'L2',
    }),
    change({
      employeeId: 'D',
      effectiveDate: '2026-04-01',
      changeType: 'Demotion',
      fromLevel: 'L4',
      toLevel: 'L3',
    }),
    change({
      employeeId: 'E',
      effectiveDate: '2026-06-01',
      changeType: 'Promotion',
      fromLevel: 'L2',
      toLevel: 'L3',
    }),
  ]
  return { employees, jobChanges }
}

const at = (d: PyramidData, level: string) => d.main.rows.find((r) => r.level === level)!
const flowAt = (d: PyramidData, level: string) => d.flow.find((r) => r.level === level)!

describe('levels today and a year ago', () => {
  const d = pyramidData(ctxOf(company()))

  it('counts employees at the level they hold, people with no level apart', () => {
    expect(d.yearAgoDate).toBe('2025-09-30')
    expect(at(d, 'L1').today).toBe(10)
    expect(at(d, 'L2').today).toBe(21)
    expect(at(d, 'L3').today).toBe(2)
    expect(at(d, 'L4').today).toBe(0)
    expect(at(d, 'M1').today).toBe(5)
    expect(d.main.total).toBe(38)
    expect(d.main.noLevel.map((e) => e.employeeId)).toEqual(['H'])
  })

  it('rebuilds the level held a year ago from job history', () => {
    expect(at(d, 'L1').yearAgo).toBe(11)
    expect(at(d, 'L2').yearAgo).toBe(21)
    expect(at(d, 'L3').yearAgo).toBe(0)
    expect(at(d, 'L4').yearAgo).toBe(1)
    expect(at(d, 'L1').yearAgoRecords.some((e) => e.employeeId === 'A')).toBe(true)
    expect(at(d, 'L4').yearAgoRecords.map((e) => e.employeeId)).toEqual(['D'])
  })

  it('hides growth on a base under the anonymity minimum, never the counts', () => {
    expect(at(d, 'L1').growth).toBeCloseTo(-1 / 11, 12)
    expect(at(d, 'L4').growth).toBeNull()
    expect(at(d, 'L4').change).toBe(-1)
    expect(at(d, 'L3').share).toBeCloseTo(2 / 38, 12)
    // A scope under the minimum shows its counts and no shares.
    const tiny = pyramidData(ctxOf({ employees: many(3, { level: 'L2' }) }))
    expect(tiny.main.rows.find((r) => r.level === 'L2')).toMatchObject({ today: 3, share: null })
  })

  it('has no year ago without Job changes or without leavers, and says why', () => {
    const noChanges = pyramidData(ctxOf({ employees: company().employees }))
    expect(noChanges.hasHistory).toBe(false)
    expect(noChanges.noHistory).toBe('Add Job changes to compare with a year ago.')
    expect(noChanges.main.rows.every((r) => r.yearAgo == null && r.change == null)).toBe(true)
    expect(noChanges.flow).toEqual([])
    const activeOnly = pyramidData(
      ctxOf({
        employees: company().employees.filter((e) => !e.terminationDate),
        jobChanges: company().jobChanges,
      }),
    )
    expect(activeOnly.noHistory).toBe(
      'Add leavers (Termination date) to Employees to compare with past headcount.',
    )
    expect(pyramidModel(ctxOf({ employees: company().employees })).kpis[0].delta).toBeNull()
  })
})

describe('how each level changed', () => {
  const d = pyramidData(ctxOf(company()))

  it('reconciles at every level: a year ago + hired + promoted in − promoted out − left + other = today', () => {
    for (const r of d.flow) {
      expect(r.yearAgo + r.hired + r.promotedIn - r.promotedOut - r.left + r.other, r.level).toBe(r.today)
      expect(r.today, r.level).toBe(at(d, r.level).today)
      expect(r.yearAgo, r.level).toBe(at(d, r.level).yearAgo)
    }
  })

  it('places hires, promotions and exits at the level held on the day', () => {
    expect(flowAt(d, 'L1')).toMatchObject({
      yearAgo: 11,
      hired: 0,
      promotedOut: 1,
      left: 0,
      other: 0,
      today: 10,
    })
    expect(flowAt(d, 'L2')).toMatchObject({
      yearAgo: 21,
      hired: 1,
      promotedIn: 1,
      promotedOut: 1,
      left: 1,
      today: 21,
    })
    expect(flowAt(d, 'L3')).toMatchObject({
      yearAgo: 0,
      hired: 1,
      promotedIn: 1,
      left: 1,
      other: 1,
      today: 2,
    })
    expect(flowAt(d, 'L4')).toMatchObject({ yearAgo: 1, other: -1, today: 0 })
    expect(flowAt(d, 'L2').records.hired.map((e) => e.employeeId)).toEqual(['E'])
    expect(flowAt(d, 'L3').records.left.map((e) => e.employeeId)).toEqual(['E'])
    expect(flowAt(d, 'L3').records.other.map((e) => e.employeeId)).toEqual(['D'])
  })

  it('opens exactly the people or changes behind each cell', () => {
    for (const r of d.flow) {
      for (const cell of ['yearAgo', 'hired', 'promotedIn', 'promotedOut', 'left', 'today'] as const) {
        const n = r[cell]
        expect(rowsOf(flowSpec(d, r, cell)), `${r.level} ${cell}`).toBe(n)
      }
      expect(rowsOf(flowSpec(d, r, 'other')), r.level).toBe(r.records.other.length)
    }
    expect(resolveDrill(flowSpec(d, flowAt(d, 'L3'), 'promotedIn'))?.kind).toBe('jobChanges')
    // Today sets Filter to the level; a year ago, hires and exits set none.
    expect(resolveDrill(flowSpec(d, flowAt(d, 'L2'), 'today'))?.filter).toEqual({ level: ['L2'] })
    expect(resolveDrill(flowSpec(d, flowAt(d, 'L2'), 'yearAgo'))?.filter).toBeUndefined()
  })
})

describe('size against the level below', () => {
  const d = pyramidData(ctxOf(company()))
  const ratio = (key: string) => d.ratios.find((r) => r.key === key)!

  it('divides each level by the one below, hiding it over a small level below', () => {
    expect(d.ratios.map((r) => r.key)).toEqual([
      'L2/L1',
      'L3/L2',
      'L4/L3',
      'L5/L4',
      'L6/L5',
      'M2/M1',
      'E1-E3/M2',
    ])
    expect(ratio('L2/L1').ratio).toBeCloseTo(2.1, 12)
    expect(ratio('L3/L2').ratio).toBeCloseTo(2 / 21, 12)
    expect(ratio('L4/L3')).toMatchObject({ ratio: null, upperCount: 0, lowerCount: 2 })
    expect(ratio('M2/M1').ratio).toBe(0)
    expect(ratio('E1-E3/M2').ratio).toBeNull()
  })

  it('marks an individual level over 1 + tolerance, and follows the tolerance setting', () => {
    expect(ratio('L2/L1').inverted).toBe(true)
    expect(ratio('L3/L2').inverted).toBe(false)
    const loose = pyramidData(
      ctxOf(company(), {}, undefined, metricsWith({ [PYRAMID_METRIC.ratioBelow]: { tolerance: 1.5 } })),
    )
    expect(loose.ratios.find((r) => r.key === 'L2/L1')!.inverted).toBe(false)
  })

  it('opens both levels with Filter to the two', () => {
    const spec = resolveDrill(ratioSpec(d, ratio('L2/L1')))!
    expect(spec.rows).toHaveLength(31)
    expect(spec.filter).toEqual({ level: ['L2', 'L1'] })
    expect(spec.filterLabel).toBe('L2 and L1')
  })
})

describe('spans at each management level', () => {
  it('takes the quartiles of direct reports per manager at each level', () => {
    const d = pyramidData(ctxOf(company()))
    const m1 = d.spans.find((r) => r.key === 'M1')!
    expect(m1).toMatchObject({ managers: 5, min: 2, q1: 3, median: 4, q3: 5, max: 6, flag: null })
    expect(rowsOf(spanSpec(d, m1))).toBe(5)
    expect(d.spanByLevel.get('M1')).toEqual({ managers: 5, median: 4 })
    // Fewer than five managers: the count shows, no span.
    expect(d.spans.find((r) => r.key === 'M2')).toMatchObject({ managers: 0, median: null })
  })

  it('hides a level with fewer than five managers and combines the executive levels when each is small', () => {
    const { employees } = company()
    const execs = ['E1', 'E2', 'E3'].flatMap((l, i) =>
      Array.from({ length: 2 }, (_, k) => emp({ employeeId: `X${i}${k}`, level: l as 'E1' })),
    )
    const reports = execs.map((x) => emp({ level: 'L5', managerId: x.employeeId }))
    const d = pyramidData(
      ctxOf({ employees: [...employees.filter((e) => e.employeeId !== 'M4'), ...execs, ...reports] }),
    )
    expect(d.spans.map((r) => r.key)).toEqual(['M1', 'M2', 'E1-E3'])
    expect(d.spans[0]).toMatchObject({ managers: 4, median: null, min: null })
    expect(d.spans[2]).toMatchObject({ managers: 6, median: 1 })
    expect(spanSpec(d, d.spans[0])).toBeNull()
  })

  it('flags a median at the Org chart narrow span', () => {
    const d = pyramidData(
      ctxOf(company(), {}, undefined, metricsWith({ 'org.flags.narrowSpan': { maxDirects: 4 } })),
    )
    expect(d.spans.find((r) => r.key === 'M1')!.flag).toBe('narrow')
    const f = pyramidModel(
      ctxOf(company(), {}, undefined, metricsWith({ 'org.flags.narrowSpan': { maxDirects: 4 } })),
    ).findings.find((x) => x.id === 'hrbp-pyramid-span-M1')
    expect(f?.title).toBe("M1 managers have a median span of 4, at or below the Org chart's narrow span (4).")
  })
})

describe('splits', () => {
  const d = pyramidData(ctxOf(company()))

  it('add up to their level, for every split', () => {
    for (const split of ['businessUnit', 'tenure'] as const)
      for (const r of d.main.rows) {
        const segs = d.segments[split].filter((s) => s.level === r.level)
        expect(
          segs.reduce((a, s) => a + s.today, 0),
          `${split} ${r.level}`,
        ).toBe(r.today)
        expect(
          segs.reduce((a, s) => a + (s.yearAgo ?? 0), 0),
          `${split} ${r.level} a year ago`,
        ).toBe(r.yearAgo)
      }
    for (const r of d.workers.rows) {
      const segs = d.segments.workerType.filter((s) => s.level === r.level)
      expect(segs.reduce((a, s) => a + s.today, 0)).toBe(r.today)
    }
  })

  it('adds contractors and interns only in the worker type split', () => {
    expect(d.workers.rows.find((r) => r.level === 'L1')!.today).toBe(12)
    expect(d.segments.workerType.filter((s) => s.level === 'L1').map((s) => [s.segment, s.today])).toEqual([
      ['Employees', 10],
      ['Contractors', 1],
      ['Interns', 1],
    ])
  })

  it('opens a segment, with Filter to the level and unit for a named business unit only', () => {
    const unitA = d.segments.businessUnit.find((s) => s.level === 'L1' && s.segment === 'Unit A')!
    const spec = resolveDrill(segmentSpec(d, unitA))!
    expect(spec.rows).toHaveLength(unitA.today)
    expect(spec.filter).toEqual({ level: ['L1'], businessUnit: ['Unit A'] })
    expect(spec.filterLabel).toBe('L1 in Unit A')
    const band = d.segments.tenure.find((s) => s.level === 'L2')!
    expect(resolveDrill(segmentSpec(d, band))?.filter).toBeUndefined()
  })
})

describe("the company's shape", () => {
  const units = {
    employees: [
      ...many(10, { level: 'L1', businessUnit: 'Unit A' }),
      ...many(10, { level: 'L2', businessUnit: 'Unit A' }),
      ...many(30, { level: 'L3', businessUnit: 'Unit B' }),
    ],
  }

  it('is offered only under a filter, scaled to the scope total', () => {
    expect(pyramidData(ctxOf(units)).main.rows.every((r) => r.company == null)).toBe(true)
    const d = pyramidData(ctxOf(units, { businessUnit: ['Unit A'] }))
    expect(d.scoped).toBe(true)
    const company = Object.fromEntries(d.main.rows.map((r) => [r.level, r.company]))
    expect(company.L1).toBeCloseTo(4, 12)
    expect(company.L2).toBeCloseTo(4, 12)
    expect(company.L3).toBeCloseTo(12, 12)
    expect(d.main.rows.reduce((a, r) => a + (r.company ?? 0), 0)).toBeCloseTo(d.main.total, 9)
  })
})

describe('drills hold exactly the number clicked', () => {
  const d = pyramidData(ctxOf(company()))

  it('rows, outlines and changes', () => {
    for (const r of d.main.rows) {
      expect(rowsOf(rowSpec(d, r)), r.level).toBe(r.today)
      expect(rowsOf(yearAgoSpec(d, r)), r.level).toBe(r.yearAgo ?? 0)
      if (r.today) expect(resolveDrill(rowSpec(d, r))?.filter).toEqual({ level: [r.level] })
    }
    const l3 = resolveDrill(changeSpec(d, at(d, 'L3')))!
    // B and D joined L3 (E joined and left inside the year, so is in neither list).
    expect(l3.rows.map((e) => (e as Employee).employeeId).sort()).toEqual(['B', 'D'])
    expect(levelsSpec(d, ['L4'], [])).toBeNull()
  })

  it('carry the level a year ago, tenure band and direct reports', () => {
    const spec = resolveDrill(rowSpec(d, at(d, 'L2')))!
    expect(spec.extra?.columns.map((c) => c.label)).toEqual([
      'Level a year ago',
      'Tenure band',
      'Direct reports',
    ])
    const a = spec.rows.find((e) => (e as Employee).employeeId === 'A') as Employee
    expect(spec.extra?.values(a)).toMatchObject({ pyramidYearAgoLevel: 'L1', pyramidTenureBand: '5-10 yrs' })
    const m = resolveDrill(rowSpec(d, at(d, 'M1')))!
    expect(m.extra?.values(m.rows[0] as Employee)).toMatchObject({ pyramidDirects: 2 })
  })
})

describe('the readout follows its settings', () => {
  /** L2 doubled in a year while the workforce grew 40%. */
  const growing = () => ({
    employees: [
      ...many(30, { level: 'L1', hireDate: '2019-01-07' }),
      ...many(20, { level: 'L2', hireDate: '2019-01-07' }),
      ...many(20, { level: 'L2', hireDate: '2026-03-02' }),
      ...many(30, { level: 'L3', hireDate: '2019-01-07', businessUnit: 'Unit B' }),
    ],
    jobChanges: [] as JobChange[],
  })
  // Keep job history loaded so there is a year ago.
  const withHistory = () => {
    const c = growing()
    const someone = c.employees[0]
    return {
      employees: [
        ...c.employees,
        emp({ level: 'L1', hireDate: '2019-01-07', terminationDate: '2024-01-08' }),
      ],
      jobChanges: [
        change({ employeeId: someone.employeeId, effectiveDate: '2018-01-08', changeType: 'Transfer' }),
      ],
    }
  }
  const findings = (m?: Parameters<typeof metricsWith>[0]) =>
    pyramidModel(ctxOf(withHistory(), {}, undefined, m ? metricsWith(m) : undefined)).findings

  it('a bulge needs the gap and the level size', () => {
    const bulge = findings().find((f) => f.id === 'hrbp-pyramid-bulge-L2')
    expect(bulge?.title).toBe('L2 grew 100% in 12 months, from 20 to 40, while the workforce grew 25%.')
    expect(bulge?.filter).toEqual({ level: ['L2'] })
    expect(
      findings({ [PYRAMID_METRIC.findings]: { bulgeGap: 0.8 } }).some((f) => f.id.includes('bulge')),
    ).toBe(false)
    expect(
      findings({ [PYRAMID_METRIC.findings]: { minLevel: 41 } }).some((f) => f.id.includes('bulge')),
    ).toBe(false)
  })

  it('a thin level needs the ratio, and a top-heavy unit the gap and the unit size', () => {
    const tiny = {
      employees: [
        ...many(8, { level: 'L1' }),
        ...many(30, { level: 'L2' }),
        ...many(25, { level: 'L5', businessUnit: 'Unit B' }),
      ],
    }
    const run = (m?: Parameters<typeof metricsWith>[0]) =>
      pyramidModel(ctxOf(tiny, {}, undefined, m ? metricsWith(m) : undefined)).findings
    expect(run().find((f) => f.id === 'hrbp-pyramid-thin')?.title).toBe(
      'L1 is the thinnest individual level: 8 people, 27% of L2 (30).',
    )
    expect(
      run({ [PYRAMID_METRIC.findings]: { thinRatio: 0.25 } }).some((f) => f.id === 'hrbp-pyramid-thin'),
    ).toBe(false)
    // Unit B: 25 of 25 at senior levels, against 40% company-wide; too small at the default 50.
    expect(run().some((f) => f.id.startsWith('hrbp-pyramid-top-heavy'))).toBe(false)
    const heavy = run({ [PYRAMID_METRIC.findings]: { minUnit: 20 } }).find((f) =>
      f.id.startsWith('hrbp-pyramid-top-heavy'),
    )
    expect(heavy?.title).toBe(
      '100.0% of Unit B is at senior, management or executive levels, 60.3 pts above the company (39.7%).',
    )
    expect(heavy?.filter).toEqual({ businessUnit: ['Unit B'] })
    expect(
      run({ [PYRAMID_METRIC.findings]: { minUnit: 20, topHeavyGap: 0.7 } }).some((f) =>
        f.id.startsWith('hrbp-pyramid-top-heavy'),
      ),
    ).toBe(false)
  })

  it('reads every setting it registers', () => {
    const keys = Object.values(PYRAMID_SET).map((s) => s.key)
    expect(keys).toEqual(['tolerance', 'bulgeGap', 'minLevel', 'thinRatio', 'topHeavyGap', 'minUnit'])
  })
})
