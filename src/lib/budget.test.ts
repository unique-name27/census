import { beforeAll, describe, expect, it } from 'vitest'
import { buildContext } from '@/data/context'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { BUDGET_VERSION, SE_OPEN_SEATS } from '@/data/sample/budget'
import { type BudgetLine, type CompRecord, DATASET_KEYS, type Datasets, type Employee } from '@/data/schema'
import { buildOrgIndex, DEFAULT_FILTERS, type Filters, scopeDatasets } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { BUDGET_BAND_PARAMS, BUDGET_METRIC_DEFS } from '@/metrics/budget'
import { CATALOG } from '@/metrics/catalog'
import { validateCatalog } from '@/metrics/registry'
import {
  BUDGET_METRICS as BUDGET_METRICS_IDS,
  type BudgetInput,
  type BudgetModel,
  type BudgetRow,
  budgetFit,
  budgetIssues,
  budgetStatus,
  budgetVersions,
  comparedMonth,
  computeBudget,
  currencyRates,
  foldGroups,
  measuredAt,
  midpointRates,
  NO_COST_CENTER,
  OTHER_KEY,
} from './budget'

/* ───────── fixtures ───────── */

let n = 0
function person(patch: Partial<Employee> = {}): Employee {
  n++
  return {
    employeeId: `E${String(n).padStart(4, '0')}`,
    name: `Person ${n}`,
    jobTitle: 'Engineer',
    businessUnit: 'Chips',
    department: 'Design',
    location: 'Austin',
    country: 'United States',
    level: 'L3',
    managerId: null,
    hireDate: '2024-01-08',
    terminationDate: null,
    employmentType: 'Employee',
    costCenter: 'CC-1',
    ...patch,
  }
}

function pay(e: Employee, patch: Partial<CompRecord> = {}): CompRecord {
  return {
    employeeId: e.employeeId,
    currency: 'USD',
    baseSalary: 120_000,
    rangeMin: 96_000,
    rangeMid: 120_000,
    rangeMax: 144_000,
    fxToUsd: 1,
    targetBonusPct: 0.1,
    ...patch,
  }
}

const line = (patch: Partial<BudgetLine> & Pick<BudgetLine, 'period'>): BudgetLine => ({
  businessUnit: 'Chips',
  department: 'Design',
  costCenter: 'CC-1',
  budgetHeadcount: 0,
  budgetCost: null,
  currency: 'USD',
  planVersion: 'FY27 budget',
  ...patch,
})

type Parts = { employees: Employee[]; comp: CompRecord[]; budget: BudgetLine[] }
const input = (d: Parts, patch: Partial<BudgetInput> = {}): BudgetInput => ({
  asOf: '2026-09-30',
  data: d,
  all: d,
  ...patch,
})

const filters = (patch: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, modes: {}, ...patch })

/** The rows of a breakdown summed: headcount, budget headcount and the cost columns. */
const sums = (rows: readonly BudgetRow[]) => ({
  headcount: rows.reduce((s, r) => s + r.headcount, 0),
  budgetHeadcount: rows.reduce((s, r) => s + (r.budgetHeadcount ?? 0), 0),
  costUsd: rows.reduce((s, r) => s + (r.costUsd ?? 0), 0),
  budgetCostUsd: rows.reduce((s, r) => s + (r.budgetCostUsd ?? 0), 0),
})

/* ───────── definitions ───────── */

describe('months and versions', () => {
  it('reads the latest version in natural order', () => {
    const lines = [
      line({ period: '2026-09-01', planVersion: 'FY27 v2' }),
      line({ period: '2026-09-01', planVersion: 'FY27 v10' }),
      line({ period: '2026-09-01', planVersion: null }),
    ]
    expect(budgetVersions(lines)).toEqual({ versions: ['FY27 v2', 'FY27 v10'], latest: 'FY27 v10' })
    expect(budgetVersions([line({ period: '2026-09-01', planVersion: null })]).latest).toBeNull()
  })

  it('compares the month of the as-of date, measured on the as-of date', () => {
    const months = ['2026-07', '2026-08', '2026-09', '2026-10']
    expect(comparedMonth(months, '2026-09-30')).toBe('2026-09')
    expect(comparedMonth(months, '2026-10-15')).toBe('2026-10')
    expect(comparedMonth(months, '2027-02-01')).toBe('2026-10')
    expect(comparedMonth(months, '2026-06-30')).toBeNull()
    expect(measuredAt('2026-09', '2026-10-15')).toBe('2026-09-30')
    expect(measuredAt('2026-10', '2026-10-15')).toBe('2026-10-15')
    expect(measuredAt('2026-11', '2026-10-15')).toBeNull()
  })

  it('calls a variance over or under only beyond the band', () => {
    expect(budgetStatus(101, 100, 0.01)).toBe('on')
    expect(budgetStatus(102, 100, 0.01)).toBe('over')
    expect(budgetStatus(98, 100, 0.01)).toBe('under')
    expect(budgetStatus(1, 0, 0.01)).toBe('over')
    expect(budgetStatus(0, 0, 0.01)).toBe('on')
    expect(budgetStatus(null, 100, 0.01)).toBeNull()
    expect(budgetStatus(100, null, 0.01)).toBeNull()
  })
})

describe('the dictionary entries', () => {
  it('are registered, sound, and take the band settings when the comp view adds them', () => {
    for (const d of BUDGET_METRIC_DEFS) expect(CATALOG.byId.has(d.id), d.id).toBe(true)
    const withBands = BUDGET_METRIC_DEFS.map((d) =>
      d.id === BUDGET_METRICS_IDS.headcount
        ? { ...d, params: [BUDGET_BAND_PARAMS.headcount] }
        : d.id === BUDGET_METRICS_IDS.cost
          ? { ...d, params: [BUDGET_BAND_PARAMS.cost] }
          : d,
    )
    expect(validateCatalog(withBands)).toEqual([])
  })
})

describe('headcount against budget', () => {
  const staff = [
    ...Array.from({ length: 6 }, () => person()),
    person({ hireDate: '2026-09-14' }),
    person({ terminationDate: '2026-08-20' }),
    // Starts after the as-of date: a pre-hire, not headcount yet.
    person({ hireDate: '2026-10-05' }),
    person({ employmentType: 'Contractor' }),
    person({ employmentType: 'Intern' }),
  ]
  const budget = [
    line({ period: '2026-08-01', budgetHeadcount: 7 }),
    line({ period: '2026-09-01', budgetHeadcount: 8 }),
    line({ period: '2026-10-01', budgetHeadcount: 9 }),
  ]
  const m = computeBudget(input({ employees: staff, comp: [], budget })) as BudgetModel

  it('counts employees at each month end, never contractors, interns or pre-hires', () => {
    expect(m.months).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(m.month).toBe('2026-09')
    expect(m.date).toBe('2026-09-30')
    expect(m.byMonth.map((r) => [r.month, r.headcount, r.budgetHeadcount, r.headcountVariance])).toEqual([
      ['2026-08', 6, 7, -1],
      ['2026-09', 7, 8, -1],
      ['2026-10', null, 9, null],
    ])
    expect(m.total?.contractors).toBe(1)
    expect(m.total?.interns).toBe(1)
    expect(m.total?.headcountStatus).toBe('under')
    expect(m.byMonth[2].date).toBeNull()
  })

  it('gives the drill the people and lines behind each number', () => {
    expect(m.total?.employees).toHaveLength(7)
    expect(m.total?.lines).toEqual([budget[1]])
    expect(m.byMonth[0].employees).toHaveLength(6)
    expect(m.byMonth[0].lines).toEqual([budget[0]])
  })

  it('returns null with no budget, so callers fall back to the hiring plan', () => {
    expect(computeBudget(input({ employees: staff, comp: [], budget: [] }))).toBeNull()
  })

  it('says when the budget starts after the as-of date', () => {
    const later = computeBudget(input({ employees: staff, comp: [], budget }, { asOf: '2026-07-15' }))
    expect(later?.unavailable).toMatch(/starts in Aug 2026/)
    expect(later?.total).toBeNull()
  })
})

describe('cost against budget', () => {
  // Six employees at Austin L3 (the contractor rate needs 5), two in Munich paid in EUR.
  const austin = Array.from({ length: 6 }, () => person())
  const munich = Array.from({ length: 2 }, () => person({ location: 'Munich', costCenter: 'CC-2' }))
  const contractor = person({ employmentType: 'Contractor' })
  const unrated = person({ employmentType: 'Contractor', level: null })
  const employees = [...austin, ...munich, contractor, unrated]
  const comp = [
    ...austin.map((e) => pay(e)),
    ...munich.map((e) => pay(e, { currency: 'EUR', baseSalary: 100_000, rangeMid: 100_000, fxToUsd: 1.1 })),
  ]
  const budget = [
    line({ period: '2026-09-01', budgetHeadcount: 6, budgetCost: 70_000 }),
    line({
      period: '2026-09-01',
      costCenter: 'CC-2',
      budgetHeadcount: 2,
      budgetCost: 20_000,
      currency: 'EUR',
    }),
  ]
  const m = computeBudget(input({ employees, comp, budget })) as BudgetModel

  it('is target cash a month plus contractors at the range midpoint', () => {
    const total = m.total as BudgetRow
    // 6 × 120,000 × 1.1 / 12 + 2 × 100,000 × 1.1 × 1.1 / 12
    expect(total.employeeCostUsd).toBeCloseTo(66_000 + 20_166.67, 1)
    // The Austin L3 median midpoint; the contractor with no level has no estimate.
    expect(total.contractorCostUsd).toBeCloseTo(10_000, 6)
    expect(total.costUsd).toBeCloseTo(96_166.67, 1)
    // 70,000 USD + 20,000 EUR at the comp rows' rate.
    expect(total.budgetCostUsd).toBeCloseTo(92_000, 6)
    expect(total.costVarianceUsd).toBeCloseTo(4_166.67, 1)
    expect(total.costStatus).toBe('over')
    expect(m.counts.noEstimate).toBe(1)
    expect(m.notes.join(' ')).toMatch(/1 contractor has no midpoint estimate/)
  })

  it('estimates a contractor at the level company-wide when the site has too few', () => {
    const rate = midpointRates({ employees, comp }, '2026-09-30')
    expect(rate('L3', 'Austin')).toBe(120_000)
    // Munich has 2 people at L3; the level company-wide has 8.
    expect(rate('L3', 'Munich')).toBe(120_000)
    expect(rate('L5', 'Austin')).toBeNull()
    expect(rate(null, 'Austin')).toBeNull()
  })

  it('converts a line with no comp rows in its currency at the reference rate, else leaves it out', () => {
    const rates = currencyRates(comp)
    expect(rates('EUR')).toBeCloseTo(1.1, 6)
    expect(rates(null)).toBe(1)
    expect(rates('usd')).toBe(1)
    expect(rates('CAD')).toBeCloseTo(0.73, 6)
    expect(rates('XYZ')).toBeNull()
    const odd = computeBudget(
      input({
        employees,
        comp,
        budget: [
          ...budget,
          line({ period: '2026-09-01', costCenter: 'CC-3', currency: 'XYZ', budgetCost: 5 }),
        ],
      }),
    ) as BudgetModel
    expect(odd.counts.noRate).toBe(1)
    expect(odd.total?.budgetCostUsd).toBeNull()
    expect(odd.notes.join(' ')).toMatch(/currency with no exchange rate/)
  })

  it('measures cost in the month of the as-of date only', () => {
    const later = computeBudget(input({ employees, comp, budget }, { asOf: '2026-11-15' })) as BudgetModel
    expect(later.month).toBe('2026-09')
    expect(later.total?.costUsd).toBeNull()
    expect(later.total?.headcount).toBe(8)
    expect(later.notes[0]).toBe(
      'Cost is measured in the month of the as-of date only; the budget ends in Sep 2026, before it.',
    )
    // A budget with no line for the as-of month compares the month before it, without cost.
    const gap = computeBudget(
      input(
        { employees, comp, budget: [...budget, line({ period: '2026-11-01', budgetHeadcount: 6 })] },
        { asOf: '2026-10-31' },
      ),
    ) as BudgetModel
    expect(gap.month).toBe('2026-09')
    expect(gap.notes[0]).toMatch(/has no line for Oct 2026/)
    expect(budgetIssues([...budget, line({ period: '2026-11-01' })], '2026-10-31')[0].text).toBe(
      'No budget line is for Oct 2026, the month of the as-of date, so actual against budget compares Sep 2026 instead.',
    )
  })

  it('reads the bands and the anonymity minimum from the dictionary', () => {
    const metrics = {
      paramDef: (id: string) => ({ key: id }) as never,
      num: (id: string) => (id === 'privacy.anonymity' ? 10 : 0.1),
    }
    const loose = computeBudget(input({ employees, comp, budget }, { metrics })) as BudgetModel
    expect(loose.minGroup).toBe(10)
    // Eight costed people is under a minimum of 10: every cost is hidden.
    expect(loose.total?.hidden).toBe(true)
    expect(loose.total?.costUsd).toBeNull()
    expect(loose.total?.headcountStatus).toBe('on')
  })
})

describe('the totals rules', () => {
  // Five cost centers: 12, 7, 3, 1 and 1 employees.
  const sizes: [string, number][] = [
    ['CC-1', 12],
    ['CC-2', 7],
    ['CC-3', 3],
    ['CC-4', 1],
    ['CC-5', 1],
  ]
  const employees = sizes.flatMap(([cc, k]) => Array.from({ length: k }, () => person({ costCenter: cc })))
  const comp = employees.map((e, i) => pay(e, { baseSalary: 100_000 + i * 1_000 }))
  const budget = sizes.map(([cc, k]) =>
    line({ period: '2026-09-01', costCenter: cc, budgetHeadcount: k, budgetCost: k * 10_000 }),
  )
  const m = computeBudget(input({ employees, comp, budget })) as BudgetModel

  it('folds groups under the minimum into Other, and the smallest shown group while Other is under it', () => {
    expect(m.byCostCenter.map((r) => r.label)).toEqual(['CC-1', 'CC-2', 'Other (3)'])
    const other = m.byCostCenter.find((r) => r.isOther) as BudgetRow
    expect(other.key).toBe(`${OTHER_KEY}:Chips`)
    expect(other.businessUnit).toBe('Chips')
    expect(other.costed).toBe(5)
    expect(other.hidden).toBe(false)
    expect(other.lines).toHaveLength(3)
  })

  it('never lets a hidden group be the total minus the shown ones', () => {
    const s = sums(m.byCostCenter)
    expect(s.headcount).toBe(m.total?.headcount)
    expect(s.budgetHeadcount).toBe(m.total?.budgetHeadcount)
    expect(s.costUsd).toBeCloseTo(m.total?.costUsd as number, 6)
    expect(s.budgetCostUsd).toBeCloseTo(m.total?.budgetCostUsd as number, 6)
    for (const r of m.byCostCenter) expect(r.costed).toBeGreaterThanOrEqual(5)
  })

  it('folds the cost centers of units folded by unit into one Other, so no unit can be subtracted out', () => {
    const team = (bu: string, cc: string, k: number) =>
      Array.from({ length: k }, () => person({ businessUnit: bu, costCenter: cc }))
    const people = [
      ...team('Chips', 'CC-1', 12),
      ...team('Chips', 'CC-2', 7),
      ...team('Ops', 'CC-7', 4),
      ...team('Sales', 'CC-8', 6),
    ]
    const lines = [
      line({ period: '2026-09-01', costCenter: 'CC-1', budgetHeadcount: 12, budgetCost: 1 }),
      line({ period: '2026-09-01', costCenter: 'CC-2', budgetHeadcount: 7, budgetCost: 1 }),
      line({
        period: '2026-09-01',
        businessUnit: 'Ops',
        costCenter: 'CC-7',
        budgetHeadcount: 4,
        budgetCost: 1,
      }),
      line({
        period: '2026-09-01',
        businessUnit: 'Sales',
        costCenter: 'CC-8',
        budgetHeadcount: 6,
        budgetCost: 1,
      }),
    ]
    const r = computeBudget(
      input({ employees: people, comp: people.map((e) => pay(e)), budget: lines }),
    ) as BudgetModel
    // Ops (4) folds, and Sales, the smallest shown unit, joins it.
    expect(r.byUnit.map((x) => [x.label, x.costed])).toEqual([
      ['Chips', 19],
      ['Other (2)', 10],
    ])
    expect(r.byCostCenter.map((x) => [x.label, x.businessUnit, x.costed])).toEqual([
      ['CC-1', 'Chips', 12],
      ['CC-2', 'Chips', 7],
      ['Other (2)', null, 10],
    ])
  })

  it('pulls the smallest shown group into Other until it reaches the minimum', () => {
    const { shown, folded } = foldGroups([9, 6, 2, 1], (x) => x, 5, true)
    expect(shown).toEqual([9])
    expect(folded).toEqual([2, 1, 6])
    // With the total hidden there is nothing to subtract from.
    expect(foldGroups([9, 6, 2, 1], (x) => x, 5, false).folded).toEqual([2, 1])
  })

  it('hides every cost when the scope itself is under the minimum', () => {
    const few = employees.slice(-4)
    const small = computeBudget(
      input({ employees: few, comp: comp.slice(-4), budget: budget.slice(-3) }),
    ) as BudgetModel
    expect(small.total?.hidden).toBe(true)
    expect(small.total?.costUsd).toBeNull()
    expect(small.total?.budgetCostUsd).toBeNull()
    expect(small.byCostCenter.every((r) => r.costUsd == null && r.budgetCostUsd == null)).toBe(true)
    expect(small.byMonth.every((r) => r.budgetCostUsd == null && r.costUsd == null)).toBe(true)
    // Headcount is a count: it still shows.
    expect(small.total?.headcount).toBe(4)
  })

  it('folds a group whose budget is for fewer than the minimum, even with enough people', () => {
    const lines = [
      line({ period: '2026-09-01', costCenter: 'CC-1', budgetHeadcount: 3, budgetCost: 30_000 }),
      ...budget.slice(1),
    ]
    const r = computeBudget(input({ employees, comp, budget: lines })) as BudgetModel
    expect(r.byCostCenter.some((x) => x.costCenter === 'CC-1')).toBe(false)
  })

  it('lists cost centers the budget does not name, and people with none, apart', () => {
    const unnamed = Array.from({ length: 5 }, () => person({ costCenter: 'CC-9' }))
    const none = Array.from({ length: 5 }, () => person({ costCenter: null }))
    const extra = [...employees, ...unnamed, ...none]
    const paid = [...comp, ...unnamed.map((e) => pay(e)), ...none.map((e) => pay(e))]
    const r = computeBudget(input({ employees: extra, comp: paid, budget })) as BudgetModel
    const keys = r.byCostCenter.map((x) => x.key)
    expect(keys).toEqual([
      'Chips:CC-1',
      'Chips:CC-2',
      'Chips:CC-9',
      `Chips:${NO_COST_CENTER}`,
      `${OTHER_KEY}:Chips`,
    ])
    expect(r.byCostCenter.map((x) => x.label)).toEqual([
      'CC-1',
      'CC-2',
      'CC-9',
      'No cost center',
      'Other (3)',
    ])
    const cc9 = r.byCostCenter.find((x) => x.costCenter === 'CC-9') as BudgetRow
    expect(cc9.budgetHeadcount).toBeNull()
    expect(cc9.headcountStatus).toBeNull()
    expect(cc9.budgetCostUsd).toBeNull()
    expect(cc9.costUsd).toBeCloseTo(5 * 11_000, 6)
    // Without comp rows the same people are not costed, so their group folds into Other.
    const unpaid = computeBudget(input({ employees: extra, comp, budget })) as BudgetModel
    expect(unpaid.byCostCenter.map((x) => x.label)).toEqual(['CC-1', 'CC-2', 'Other (5)'])
    expect(unpaid.counts.notCosted).toBe(10)
  })
})

describe('scopes the budget can be compared for', () => {
  const unitLines = [line({ period: '2026-09-01', department: null, costCenter: null, budgetHeadcount: 5 })]
  const deptLines = [line({ period: '2026-09-01', costCenter: null, budgetHeadcount: 5 })]
  const units = new Set(['Chips'])

  it('is whole business units, or departments where every line names one', () => {
    expect(budgetFit(undefined, unitLines, units)).toBeNull()
    expect(budgetFit(filters({ businessUnit: ['Chips'] }), unitLines, units)).toBeNull()
    expect(budgetFit(filters({ department: ['Design'] }), deptLines, units)).toBeNull()
    expect(budgetFit(filters({ department: ['Design'] }), unitLines, units)).toMatch(
      /budget for Chips is set for the whole business unit/,
    )
    expect(budgetFit(filters({ location: ['Austin'] }), deptLines, units)).toMatch(/not by location or level/)
    expect(budgetFit(filters({ level: ['L3'], modes: { level: 'exclude' } }), deptLines, units)).toMatch(
      /not by location or level/,
    )
    expect(budgetFit(filters({ leaderId: 'E0001' }), deptLines, units)).toMatch(/not by reporting line/)
  })

  it('keeps lines by business unit and department in scopeDatasets', () => {
    const data = {
      employees: [
        person({ employeeId: 'X1', businessUnit: 'Chips' }),
        person({ employeeId: 'X2', businessUnit: 'Sales' }),
      ],
      budget: [
        line({ period: '2026-09-01', businessUnit: 'Chips', department: null, costCenter: null }),
        line({ period: '2026-09-01', businessUnit: 'Chips', department: 'Design' }),
        line({ period: '2026-09-01', businessUnit: 'Sales', department: 'Field' }),
      ],
    } as Partial<Datasets> as Datasets
    const index = buildOrgIndex(data.employees)
    const keep = (f: Partial<Filters>) => scopeDatasets(data, filters(f), index).budget.length
    expect(keep({ businessUnit: ['Chips'] })).toBe(2)
    expect(keep({ businessUnit: ['Chips'], modes: { businessUnit: 'exclude' } })).toBe(1)
    expect(keep({ department: ['Design'] })).toBe(1)
    // A line for the whole unit is not one of the excluded departments.
    expect(keep({ department: ['Design'], modes: { department: 'exclude' } })).toBe(2)
    expect(keep({ location: ['Austin'] })).toBe(0)
    expect(keep({ location: ['Austin'], modes: { location: 'exclude' } })).toBe(3)
    expect(keep({ leaderId: 'X1' })).toBe(0)
  })
})

describe('data checks', () => {
  it('finds lines at two levels, a missing as-of month and a currency with no rate', () => {
    const lines = [
      line({ period: '2026-08-01', department: null, costCenter: null, budgetHeadcount: 10 }),
      line({ period: '2026-08-01', budgetHeadcount: 4 }),
      line({ period: '2026-10-01', budgetHeadcount: 4, budgetCost: 1, currency: 'XYZ' }),
    ]
    const issues = budgetIssues(lines, '2026-09-30')
    expect(issues.map((i) => [i.kind, i.rows])).toEqual([
      ['two-levels', [0, 1]],
      ['as-of-month', []],
      ['no-rate', [2]],
    ])
    expect(issues[0].text).toBe(
      '1 business unit month has lines at two levels, such as a business unit total beside its cost centers, so its totals count the budget twice.',
    )
    expect(budgetIssues([], '2026-09-30')).toEqual([])
    expect(budgetIssues([line({ period: '2026-09-01' })], '2026-09-30')).toEqual([])
  })
})

/* ───────── the sample company ───────── */

describe('the sample company’s budget', () => {
  let data: Datasets
  let m: BudgetModel
  const unit = (bu: string) => m.byUnit.find((r) => r.key === bu) as BudgetRow
  beforeAll(() => {
    data = generateSample()
    m = computeBudget({ asOf: SAMPLE_AS_OF, data, all: data }) as BudgetModel
  })

  it('is one line per cost center and month, April 2026 to March 2027', () => {
    expect(m.version).toBe(BUDGET_VERSION)
    expect(m.months).toHaveLength(12)
    expect(m.months[0]).toBe('2026-04')
    expect(m.months[11]).toBe('2027-03')
    expect(m.month).toBe('2026-09')
    expect(m.unavailable).toBeNull()
    expect(data.budget.length % 12).toBe(0)
    expect(budgetIssues(data.budget, SAMPLE_AS_OF, data.comp)).toEqual([])
    // Every employee's cost center is in the budget, and every line's cost is in USD.
    const centers = new Set(data.budget.map((l) => l.costCenter))
    expect(m.byCostCenter.filter((r) => !r.isOther).every((r) => centers.has(r.costCenter))).toBe(true)
    expect(data.budget.every((l) => l.currency === 'USD' && l.budgetCost != null)).toBe(true)
  })

  it('has Silicon Engineering under budget on headcount but over on cost, from its contractors', () => {
    const se = unit('Silicon Engineering')
    const seats = Object.values(SE_OPEN_SEATS).reduce((s, k) => s + k, 0)
    expect(se.headcountVariance).toBe(-seats)
    expect(se.headcountStatus).toBe('under')
    expect(se.costStatus).toBe('over')
    // Its employees alone are under the cost budget; the contractors put it over.
    expect(se.employeeCostUsd as number).toBeLessThan(se.budgetCostUsd as number)
    expect(se.contractors).toBe(29)
    expect(se.contractorCostUsd as number).toBeGreaterThan((se.costVarianceUsd as number) + 0)
    // Under on headcount in every month so far.
    const months = m.unitMonths.filter((u) => u.businessUnit === 'Silicon Engineering' && u.headcount != null)
    expect(months).toHaveLength(6)
    expect(months.every((u) => (u.headcountVariance as number) < 0)).toBe(true)
    // The overrun sits in the cost centers where the contractors work.
    for (const cc of ['1130-BLR', '1130-SGN', '1140-BLR'])
      expect(m.byCostCenter.find((r) => r.costCenter === cc)?.costStatus, cc).toBe('over')
  })

  it('has Go-to-Market over budget on headcount in every month', () => {
    const gtm = unit('Go-to-Market')
    expect(gtm.headcountVariance).toBe(8)
    expect(gtm.headcountStatus).toBe('over')
    expect(gtm.costStatus).toBe('over')
    const months = m.unitMonths.filter((u) => u.businessUnit === 'Go-to-Market' && u.headcount != null)
    expect(months.every((u) => u.headcountStatus === 'over')).toBe(true)
  })

  it('has everyone else on budget', () => {
    for (const bu of ['Systems & Software', 'Operations', 'Corporate', 'Executive Office']) {
      expect(unit(bu).headcountStatus, bu).toBe('on')
      expect(unit(bu).costStatus, bu).toBe('on')
    }
  })

  it('keeps every number finite or null and every breakdown under the totals rules', () => {
    const finite = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v))
    for (const r of [m.total as BudgetRow, ...m.byUnit, ...m.byCostCenter])
      for (const k of [
        'budgetHeadcount',
        'headcount',
        'budgetCostUsd',
        'costUsd',
        'costVarianceUsd',
        'costVariancePct',
      ] as const)
        expect(finite(r[k]), `${r.key} ${k}`).toBe(true)
    for (const rows of [m.byUnit, m.byCostCenter]) {
      const s = sums(rows)
      expect(s.headcount).toBe(m.total?.headcount)
      expect(s.costUsd).toBeCloseTo(m.total?.costUsd as number, 2)
      expect(s.budgetCostUsd).toBeCloseTo(m.total?.budgetCostUsd as number, 2)
      for (const r of rows) {
        expect(r.hidden, r.key).toBe(false)
        expect(Math.min(r.costed, r.budgetHeadcount ?? r.costed), r.key).toBeGreaterThanOrEqual(5)
      }
    }
    expect(m.byCostCenter.some((r) => r.isOther)).toBe(true)
    // No subtraction across the two breakdowns: a unit less its shown cost centers is its Other.
    for (const u of m.byUnit.filter((r) => !r.isOther)) {
      const inUnit = m.byCostCenter.filter((r) => r.businessUnit === u.businessUnit)
      const shown = inUnit.filter((r) => !r.isOther).reduce((s, r) => s + (r.costUsd ?? 0), 0)
      const other = inUnit.find((r) => r.isOther)
      expect((u.costUsd as number) - shown, u.key).toBeCloseTo(other?.costUsd ?? 0, 2)
      if (other) expect(other.costed, u.key).toBeGreaterThanOrEqual(5)
    }
  })

  it('reads an analytics context as it is, with the dictionary in force', () => {
    const sources = Object.fromEntries(
      DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
    ) as unknown as Record<(typeof DATASET_KEYS)[number], SourceMeta>
    const ctx = buildContext({ data, sources, filters: DEFAULT_FILTERS, asOfOverride: null, showPay: false })
    const fromCtx = computeBudget(ctx) as BudgetModel
    expect(fromCtx.minGroup).toBe(5)
    expect(fromCtx.total?.headcountVariance).toBe(m.total?.headcountVariance)
    expect(fromCtx.total?.costUsd).toBeCloseTo(m.total?.costUsd as number, 2)
  })

  it('compares a business unit scope on its own lines', () => {
    const f = filters({ businessUnit: ['Go-to-Market'] })
    const scoped = scopeDatasets(data, f, buildOrgIndex(data.employees))
    const gtm = computeBudget({ asOf: SAMPLE_AS_OF, filters: f, data: scoped, all: data }) as BudgetModel
    expect(gtm.unavailable).toBeNull()
    expect(gtm.byUnit.map((r) => r.key)).toEqual(['Go-to-Market'])
    expect(gtm.total?.headcountVariance).toBe(8)
    expect(gtm.total?.budgetCostUsd).toBeCloseTo(unit('Go-to-Market').budgetCostUsd as number, 2)
    const byLocation = filters({ location: ['Bengaluru'] })
    const blr = scopeDatasets(data, byLocation, buildOrgIndex(data.employees))
    expect(
      computeBudget({ asOf: SAMPLE_AS_OF, filters: byLocation, data: blr, all: data })?.unavailable,
    ).toMatch(/not by location/)
  })
})
