/**
 * The Compensation charts added in the design refresh: every number equals a recount from the
 * raw rows, each mark opens exactly the people it counts, groups under the anonymity minimum are
 * left out or hidden, and groups of an org filter offer "Filter to" that reproduces the number.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { expectFilterTo } from '@/drill/testing'
import { attrition } from '@/lib/people'
import { quantile } from '@/lib/stats'
import {
  belowCauseDrill,
  belowMinByCause,
  CAUSE,
  type CompaCell,
  compaCellDrill,
  compaGrid,
  familyMarketPosition,
  familyPositionDrill,
  type PayAttritionRow,
  payGroupDrill,
  payLeaversDrill,
} from './charts'
import { computeComp } from './model'
import { buildPopulation } from './population'
import { AS_OF, comp, context, dataset, emp, promotion, team } from './test-fixtures'

const rowsOf = (src: ReturnType<typeof payGroupDrill>) => src?.rows.length ?? 0

describe('pay position and voluntary attrition', () => {
  // Bengaluru: 6 paid low, 2 resigned this year. San Jose: 10 at the midpoint. Austin: 3, too few.
  const blr = team(6, { location: 'Bengaluru', hireDate: '2021-01-04' }, () => ({ compa: 0.85 }))
  const sj = team(10, { location: 'San Jose', hireDate: '2021-01-04' }, (_, i) => ({
    compa: 0.96 + i * 0.01,
  }))
  const aus = team(3, { location: 'Austin', hireDate: '2021-01-04' }, () => ({ compa: 0.9 }))
  const left = [
    emp({
      location: 'Bengaluru',
      hireDate: '2021-01-04',
      terminationDate: '2026-03-15',
      terminationType: 'Voluntary',
    }),
    emp({
      location: 'Bengaluru',
      hireDate: '2021-01-04',
      terminationDate: '2026-06-15',
      terminationType: 'Voluntary',
    }),
    emp({
      location: 'Bengaluru',
      hireDate: '2021-01-04',
      terminationDate: '2026-05-01',
      terminationType: 'Involuntary',
    }),
  ]
  const data = dataset({
    employees: [...blr.employees, ...sj.employees, ...aus.employees, ...left],
    comp: [...blr.comp, ...sj.comp, ...aus.comp],
  })
  const ctx = context(data)
  const m = computeComp(ctx)
  const pa = m.overview.payAttrition.location

  it('recounts the median compa-ratio and voluntary attrition per location', () => {
    const b = pa.rows.find((r) => r.group === 'Bengaluru')!
    expect(b.people).toBe(6)
    expect(b.compa).toBeCloseTo(0.85, 6)
    expect(b.exits).toBe(2)
    const recount = attrition(
      data.employees.filter((e) => e.location === 'Bengaluru'),
      ctx.window,
      'voluntary',
    )
    expect(b.voluntary).toBeCloseTo(recount.rate!, 10)
    expect(b.avgHeadcount).toBeCloseTo(recount.avgHeadcount, 10)
    const s = pa.rows.find((r) => r.group === 'San Jose')!
    expect(s.compa).toBeCloseTo(
      quantile(
        [...Array(10)].map((_, i) => 0.96 + i * 0.01),
        0.5,
      )!,
      6,
    )
    expect(s.voluntary).toBe(0)
  })

  it('leaves out a location under the anonymity minimum and counts it', () => {
    expect(pa.shown.map((r) => r.group).sort()).toEqual(['Bengaluru', 'San Jose'])
    expect(pa.hidden).toBe(1)
    const a = pa.rows.find((r) => r.group === 'Austin')!
    expect(a.compa).toBeNull()
    expect(a.members).toEqual([])
    expect(a.leavers).toEqual([])
    expect(payGroupDrill(m, a)).toBeNull()
  })

  it('opens exactly the people behind a dot and the leavers behind the rate, with the location as filter', () => {
    const b = pa.rows.find((r) => r.group === 'Bengaluru')!
    const people = payGroupDrill(m, b)!
    expect(people.kind).toBe('comp')
    expect(rowsOf(people)).toBe(b.people)
    expect(people.filter).toEqual({ location: ['Bengaluru'] })
    const leavers = payLeaversDrill(m, pa, b)!
    expect(leavers.rows).toHaveLength(2)
    expect(leavers.rows.every((e) => e.terminationType === 'Voluntary')).toBe(true)
    expect(leavers.filter).toEqual({ location: ['Bengaluru'] })
  })

  it('has no rate without termination dates in the roster', () => {
    const active = dataset({
      employees: [...blr.employees, ...sj.employees],
      comp: [...blr.comp, ...sj.comp],
    })
    const x = computeComp(context(active)).overview.payAttrition.location
    expect(x.shown).toEqual([])
    expect(x.rows.every((r) => r.voluntary == null)).toBe(true)
  })
})

describe('median compa-ratio by location and level group', () => {
  const l3 = team(5, { location: 'Munich', level: 'L3' }, () => ({ compa: 0.9 }))
  const l4 = team(2, { location: 'Munich', level: 'L4' }, () => ({ compa: 1.0 }))
  const m1 = team(3, { location: 'Munich', level: 'M1' }, () => ({ compa: 1.1 }))
  const sj = team(6, { location: 'San Jose', level: 'L5' }, () => ({ compa: 1.05 }))
  const none = team(2, { location: 'San Jose', level: null }, () => ({ compa: 1 }))
  const pop = buildPopulation(
    dataset({
      employees: [...l3.employees, ...l4.employees, ...m1.employees, ...sj.employees, ...none.employees],
      comp: [...l3.comp, ...l4.comp, ...m1.comp, ...sj.comp, ...none.comp],
    }),
    AS_OF,
  )
  const g = compaGrid(pop.people, 5)
  const cell = (loc: string, grp: string) => g.cells.find((c) => c.location === loc && c.levelGroup === grp)

  it('groups levels and recounts each cell', () => {
    const munich = cell('Munich', 'L3-L4')!
    expect(munich.n).toBe(7)
    expect(munich.median).toBeCloseTo(0.9, 6)
    expect(munich.levels).toEqual(['L3', 'L4'])
    expect(cell('San Jose', 'L5-L6')!.median).toBeCloseTo(1.05, 6)
    expect(g.groups).toEqual(['L3-L4', 'L5-L6', 'M1'])
    // Lowest median first, as the location bars.
    expect(g.locations).toEqual(['Munich', 'San Jose'])
    expect(g.noLevel).toBe(2)
  })

  it('hides a cell under the anonymity minimum, with nobody behind it', () => {
    const small = cell('Munich', 'M1')!
    expect(small.n).toBe(3)
    expect(small.median).toBeNull()
    expect(small.members).toEqual([])
    expect(g.hiddenCells).toBe(1)
    expect(compaCellDrill({ scopeLabel: 'Whole company', asOf: AS_OF }, small)).toBeNull()
  })

  it('opens the cell with its location and levels as the filter', () => {
    const c = cell('Munich', 'L3-L4')!
    const d = compaCellDrill({ scopeLabel: 'Whole company', asOf: AS_OF }, c)!
    expect(d.rows).toHaveLength(7)
    expect(d.filter).toEqual({ location: ['Munich'], level: ['L3', 'L4'] })
    expect(d.filterLabel).toBe('Munich, L3-L4')
  })
})

describe('pay or the range by job family', () => {
  const trails = team(6, { jobFamily: 'Analog', department: 'Analog' }, () => ({
    compa: 1,
    marketP50: 110_000,
  }))
  const low = team(5, { jobFamily: 'Firmware', department: 'Firmware' }, () => ({
    compa: 0.88,
    marketP50: 100_000,
  }))
  const small = team(4, { jobFamily: 'Legal', department: 'Legal' }, () => ({ compa: 1, marketP50: 100_000 }))
  const unpriced = team(3, { jobFamily: 'Analog', department: 'Analog' }, () => ({
    compa: 1,
    marketP50: null,
  }))
  const pop = buildPopulation(
    dataset({
      employees: [...trails.employees, ...low.employees, ...small.employees, ...unpriced.employees],
      comp: [...trails.comp, ...low.comp, ...small.comp, ...unpriced.comp],
    }),
    AS_OF,
  )
  const fp = familyMarketPosition(pop.people, 5)

  it('places each family by its range against the market and its pay in the range', () => {
    const a = fp.rows.find((r) => r.family === 'Analog')!
    expect(a.n).toBe(6)
    expect(a.marketVsMid).toBeCloseTo(1.1, 6)
    expect(a.compa).toBeCloseTo(1, 6)
    const f = fp.rows.find((r) => r.family === 'Firmware')!
    expect(f.marketVsMid).toBeCloseTo(1, 6)
    expect(f.compa).toBeCloseTo(0.88, 6)
    expect(fp.rows[0].family).toBe('Analog')
  })

  it('leaves out small families and counts the people without a market median', () => {
    expect(fp.rows.map((r) => r.family)).not.toContain('Legal')
    expect(fp.hidden).toBe(1)
    expect(fp.unpriced).toBe(3)
    expect(fp.total).toBe(18)
  })

  it('opens the family people with a market median, with no filter (job family is not one)', () => {
    const a = fp.rows.find((r) => r.family === 'Analog')!
    const d = familyPositionDrill({ scopeLabel: 'Whole company', asOf: AS_OF }, a)!
    expect(d.rows).toHaveLength(6)
    expect(d.filter).toBeUndefined()
  })
})

describe('below range minimum by location and cause', () => {
  const promotedLow = emp({ location: 'Haifa', hireDate: '2019-02-04' })
  const hiredLow = emp({ location: 'Haifa', hireDate: '2026-02-02' })
  const longLow = team(3, { location: 'Bengaluru', hireDate: '2018-05-07' }, () => ({ compa: 0.7 }))
  const inRange = emp({ location: 'Haifa' })
  const data = dataset({
    employees: [promotedLow, hiredLow, inRange, ...longLow.employees],
    comp: [
      comp(promotedLow, { compa: 0.75 }),
      comp(hiredLow, { compa: 0.78 }),
      comp(inRange),
      ...longLow.comp,
    ],
    jobChanges: [promotion(promotedLow, '2026-04-01')],
  })
  const pop = buildPopulation(data, AS_OF)

  it('splits by promoted, then hired, then neither, largest location first', () => {
    const b = belowMinByCause(pop.people, true)
    expect(b.locations).toEqual(['Bengaluru', 'Haifa'])
    expect(b.causes).toEqual([CAUSE.promoted, CAUSE.hired, CAUSE.neither])
    const n = (loc: string, cause: string) =>
      b.rows.find((r) => r.location === loc && r.cause === cause)?.people
    expect(n('Haifa', CAUSE.promoted)).toBe(1)
    expect(n('Haifa', CAUSE.hired)).toBe(1)
    expect(n('Haifa', CAUSE.neither)).toBe(0)
    expect(n('Bengaluru', CAUSE.neither)).toBe(3)
    expect(b.total).toBe(5)
  })

  it('reads hired or not when promotions are below the data standard', () => {
    const b = belowMinByCause(pop.people, false)
    expect(b.causes).toEqual([CAUSE.hired, CAUSE.notHired])
    expect(b.rows.find((r) => r.location === 'Haifa' && r.cause === CAUSE.notHired)?.people).toBe(1)
  })

  it('opens the segment or the whole bar with the location as the filter', () => {
    const b = belowMinByCause(pop.people, true)
    const scope = { scopeLabel: 'Whole company', asOf: AS_OF }
    expect(belowCauseDrill(scope, b, 'Haifa', CAUSE.promoted)!.rows).toHaveLength(1)
    const bar = belowCauseDrill(scope, b, 'Haifa', null)!
    expect(bar.rows).toHaveLength(2)
    expect(bar.filter).toEqual({ location: ['Haifa'] })
    expect(belowCauseDrill(scope, b, 'Haifa', CAUSE.neither)).toBeNull()
  })
})

describe('on the sample company', () => {
  let data: Datasets
  let ctx: AnalyticsContext
  beforeAll(() => {
    data = generateSample()
    ctx = buildContext({
      data,
      sources: Object.fromEntries(
        DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
      ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>,
      filters: { ...DEFAULT_FILTERS },
      asOfOverride: null,
      showPay: false,
    })
  }, 60_000)

  it('shows Bengaluru alone low in the range and high in voluntary attrition', () => {
    const pa = computeComp(ctx).overview.payAttrition.location
    const b = pa.shown.find((r) => r.group === 'Bengaluru')!
    expect(b.compa).toBeCloseTo(0.88, 2)
    // 18.8% on People stats.
    expect(b.voluntary).toBeCloseTo(0.1875, 4)
    expect(pa.company.compa).toBeCloseTo(0.98, 2)
    expect(pa.company.voluntary).toBeCloseTo(0.094, 3)
    const others = pa.shown.filter((r) => r.group !== 'Bengaluru')
    expect(others.every((r) => r.compa! > b.compa! && r.voluntary! < b.voluntary!)).toBe(true)
  })

  it('recounts every dot from the raw comp and roster rows, and each opens its people', () => {
    const m = computeComp(ctx)
    const active = new Map(
      data.employees
        .filter(
          (e) =>
            e.employmentType === 'Employee' &&
            e.hireDate <= ctx.asOf &&
            (!e.terminationDate || e.terminationDate > ctx.asOf),
        )
        .map((e) => [e.employeeId, e]),
    )
    for (const r of m.overview.payAttrition.location.shown) {
      const compas = data.comp
        .filter((c) => active.get(c.employeeId)?.location === r.group && c.rangeMid)
        .map((c) => c.baseSalary / c.rangeMid!)
      expect(r.people, r.group).toBe(compas.length)
      expect(r.compa!, r.group).toBeCloseTo(quantile(compas, 0.5)!, 10)
      const v = attrition(
        data.employees.filter((e) => e.location === r.group),
        ctx.window,
        'voluntary',
      )
      expect(r.voluntary!, r.group).toBeCloseTo(v.rate!, 10)
      expect(rowsOf(payGroupDrill(m, r)), r.group).toBe(r.people)
      expect(payLeaversDrill(m, m.overview.payAttrition.location, r)?.rows.length ?? 0, r.group).toBe(
        v.events,
      )
    }
    for (const c of m.overview.compaGrid.cells) {
      if (c.median == null) {
        expect(c.n).toBeLessThan(5)
        continue
      }
      expect(compaCellDrill(m, c)?.rows.length, `${c.location} ${c.levelGroup}`).toBe(c.n)
    }
    const b = m.ranges.belowCause
    expect(b.total).toBe(m.ranges.below.length)
    for (const loc of b.locations)
      expect(belowCauseDrill(m, b, loc, null)?.rows.length).toBe(b.totals.get(loc)?.length)
  })

  it('names the sample stories: Analog & Mixed-Signal trails the market, Bengaluru is long below minimum', () => {
    const m = computeComp(ctx)
    const fam = m.market.familyPosition.rows.find((r) => r.family.startsWith('Analog'))
    expect(fam).toBeDefined()
    expect(fam!.marketVsMid).toBeGreaterThan(1.05)
    expect(fam!.compa).toBeGreaterThan(0.95)
    // 41 below minimum in Bengaluru, most of them not promoted; 35 of the 37 elsewhere were promoted.
    const b = m.ranges.belowCause
    expect(b.locations[0]).toBe('Bengaluru')
    expect(b.totals.get('Bengaluru')).toHaveLength(41)
    const promoted = b.rows.find((r) => r.location === 'Bengaluru' && r.cause === CAUSE.promoted)!
    expect(promoted.people).toBeLessThan(41 / 2)
    const promotedElsewhere = b.rows
      .filter((r) => r.location !== 'Bengaluru' && r.cause === CAUSE.promoted)
      .reduce((a, r) => a + r.people, 0)
    const elsewhere = b.rows.filter((r) => r.location !== 'Bengaluru').reduce((a, r) => a + r.people, 0)
    expect([promotedElsewhere, elsewhere]).toEqual([35, 37])
  })

  it('Filter to a location dot keeps its compa-ratio and its attrition', () => {
    const rows = (x: AnalyticsContext) => computeComp(x).overview.payAttrition.location.shown
    expectFilterTo(ctx, {
      name: 'pay and attrition by location (compa-ratio)',
      rows,
      key: (r: PayAttritionRow) => r.group,
      value: (r) => r.compa,
      drill: (r, x) => payGroupDrill(computeComp(x), r),
      kind: 'rate',
    })
    expectFilterTo(ctx, {
      name: 'pay and attrition by location (voluntary attrition)',
      rows,
      key: (r: PayAttritionRow) => r.group,
      value: (r) => r.voluntary,
      drill: (r, x) => payLeaversDrill(computeComp(x), computeComp(x).overview.payAttrition.location, r),
      kind: 'rate',
    })
  })

  it('Filter to a location and level cell keeps its median', () => {
    expectFilterTo(ctx, {
      name: 'compa-ratio by location and level',
      rows: (x) => computeComp(x).overview.compaGrid.cells.filter((c) => c.median != null),
      key: (c: CompaCell) => `${c.location}|${c.levelGroup}`,
      value: (c) => c.median,
      drill: (c, x) => compaCellDrill(computeComp(x), c),
      kind: 'rate',
    })
  })

  it('Filter to a location keeps everyone below its minimum', () => {
    expectFilterTo(ctx, {
      name: 'below range minimum by location',
      rows: (x) => {
        const b = computeComp(x).ranges.belowCause
        return b.locations.map((location) => ({ location, n: b.totals.get(location)!.length }))
      },
      key: (r) => r.location,
      value: (r) => r.n,
      drill: (r, x) => belowCauseDrill(computeComp(x), computeComp(x).ranges.belowCause, r.location, null),
    })
  })

  it('opens nothing from a job family dot but its own people', () => {
    const m = computeComp(ctx)
    for (const r of m.market.familyPosition.rows) {
      const d = resolveDrill(() => familyPositionDrill(m, r))
      expect(d?.rows.length).toBe(r.n)
      expect(d?.filter).toBeUndefined()
    }
  })
})
