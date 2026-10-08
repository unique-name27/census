/**
 * Workforce cost and the cost guard (docs/ROLES-V2.md 3.2; test 5 of 8.8, the Compensation part):
 * exact definitions on hand-built rows; every cost total over fewer than 5 people is null; in every
 * breakdown the shown groups plus Other equal the total and Other is 5 or more whenever the total
 * is shown; Finance's drills list employees with no amount; tiles hold no amount while cost
 * totals may not show; and actual against budget on the sample.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AccessInput } from '@/access/context'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type Datasets, type Requisition } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import type { DrillSpec } from '@/drill/types'
import { visibleColumns } from '@/lib/export/columns'
import { ANONYMITY } from '@/metrics/privacy'
import { metricsWith } from '@/metrics/testing'
import {
  BUDGET_CENTER_COLUMNS,
  BUDGET_COST_COLUMNS,
  COST_BY_CENTER_COLUMNS,
  COST_BY_UNIT_COLUMNS,
  OPEN_REQ_COST_COLUMNS,
  SPEND_COLUMNS,
} from '../columns'
import { view } from '../index'
import { compActions } from './actions'
import {
  type CostModel,
  type CostRow,
  costHeadline,
  costPeopleDrill,
  costRowDrill,
  guardGroups,
  OTHER,
  openReqDrill,
  TOP_CENTERS,
  topCostCenters,
} from './cost'
import { compModel, computeComp } from './model'
import { comp, context, dataset, emp, team } from './test-fixtures'

const cost = (d: Datasets, opts: Parameters<typeof context>[1] = {}): CostModel =>
  computeComp(context(d, { showPay: true, ...opts })).cost

/** Shown rows plus Other cover the total exactly, Other holds 5 or more, and nothing shown is under 5. */
function expectGuarded(rows: readonly CostRow[], total: CostRow, min = 5, label = '') {
  expect(
    rows.reduce((a, r) => a + r.people, 0),
    `${label} people`,
  ).toBe(total.people)
  if (total.hidden) {
    for (const r of rows) expect(r.targetCashUsd, `${label} ${r.group}`).toBeNull()
    return
  }
  const sum = (k: keyof CostRow) => rows.reduce((a, r) => a + ((r[k] as number | null) ?? 0), 0)
  for (const k of ['baseUsd', 'bonusUsd', 'targetCashUsd', 'equityUsd'] as const)
    expect(sum(k), `${label} ${k}`).toBeCloseTo(total[k] as number, 2)
  for (const r of rows) {
    expect(r.people, `${label} ${r.group}`).toBeGreaterThanOrEqual(min)
    expect(r.targetCashUsd, `${label} ${r.group}`).not.toBeNull()
  }
  expect(rows.filter((r) => r.isOther).length, `${label} one Other`).toBeLessThanOrEqual(1)
}

describe('definitions on hand-built rows', () => {
  it('people costed, base, target cash (no bonus counts as none), equity and per employee', () => {
    const t = team(6, { businessUnit: 'Operations' })
    // Base 100,000 USD, target bonus 10%, equity 10,000 each; one with no bonus, one in EUR at 1.1.
    t.comp[0] = { ...t.comp[0], targetBonusPct: null }
    t.comp[1] = { ...t.comp[1], currency: 'EUR', fxToUsd: 1.1 }
    const noFx = emp({ businessUnit: 'Operations' })
    const d = dataset({
      employees: [...t.employees, noFx],
      comp: [...t.comp, comp(noFx, { fxToUsd: null })],
    })
    const c = cost(d)
    expect(c.total.people).toBe(6)
    expect(c.counts).toMatchObject({ noFx: 1, noBonus: 1 })
    expect(c.total.baseUsd).toBeCloseTo(5 * 100_000 + 110_000, 6)
    expect(c.total.targetCashUsd).toBeCloseTo(4 * 110_000 + 100_000 + 110_000 * 1.1, 6)
    expect(c.total.equityUsd).toBe(60_000)
    expect(c.total.perHeadUsd).toBeCloseTo((c.total.targetCashUsd ?? 0) / 6, 6)
    const tile = (id: string) => c.kpis.find((k) => k.id === id)!
    expect(tile('cost-people').note).toBe('1 person without an exchange rate left out')
    expect(tile('cost-target-cash').note).toBe('1 person without a target bonus at none')
  })

  it('hides every total over fewer than 5 costed people, the scope total included', () => {
    const t = team(4, { businessUnit: 'Operations' })
    const c = cost(dataset({ employees: t.employees, comp: t.comp }))
    expect(c.total).toMatchObject({
      people: 4,
      hidden: true,
      targetCashUsd: null,
      perHeadUsd: null,
      share: null,
    })
    for (const rows of [c.byUnit, c.byCostCenter, c.byLevel, c.bySite]) expectGuarded(rows, c.total)
    const tile = c.kpis.find((k) => k.id === 'cost-target-cash')!
    expect(tile).toMatchObject({ value: null, suppressed: true })
    expect(tile.drill).toBeFalsy()
  })

  it('folds a small group into Other, and the smallest shown group with it until Other reaches 5', () => {
    const a = team(10, { businessUnit: 'Silicon Engineering' })
    const b = team(3, { businessUnit: 'Operations' })
    const c = cost(dataset({ employees: [...a.employees, ...b.employees], comp: [...a.comp, ...b.comp] }))
    expect(c.byUnit.map((r) => [r.group, r.people])).toEqual([['Other (2)', 13]])
    expectGuarded(c.byUnit, c.total)
    const d = team(6, { businessUnit: 'Go-to-Market' })
    const c2 = cost(
      dataset({
        employees: [...a.employees, ...b.employees, ...d.employees],
        comp: [...a.comp, ...b.comp, ...d.comp],
      }),
    )
    // Other takes Go-to-Market (6, the smallest shown) so it holds 9, never just the 3.
    expect(c2.byUnit.map((r) => [r.group, r.people])).toEqual([
      ['Silicon Engineering', 10],
      ['Other (2)', 9],
    ])
    expectGuarded(c2.byUnit, c2.total)
  })

  it('names the largest groups up to the top, the rest in Other', () => {
    const g = (n: number) => ({ key: `g${n}`, label: `G${n}`, rows: Array.from({ length: n }, (_, i) => i) })
    const groups = [g(5), g(9), g(7), g(6)]
    const { shown, folded } = guardGroups(groups, 5, true, { top: 2, rank: (x) => x.rows.length })
    expect(shown.map((x) => x.key)).toEqual(['g9', 'g7'])
    expect(folded.map((x) => x.key).sort()).toEqual(['g5', 'g6'])
  })

  it('estimates open reqs at the range midpoint of their level and location, else their level', () => {
    // Five L3s in San Jose (mid 100,000 USD); a req at L3 in Austin falls back to the level.
    const sj = team(5, { level: 'L3', location: 'San Jose', businessUnit: 'Operations' })
    const req = (id: string, over: Partial<Requisition>): Requisition => ({
      reqId: id,
      jobTitle: 'Engineer',
      businessUnit: 'Operations',
      department: 'Supply chain',
      location: 'San Jose',
      level: 'L3',
      openedDate: '2026-06-01',
      status: 'Open',
      reqType: 'New',
      priority: 'Standard',
      openings: 1,
      ...over,
    })
    const reqs = [
      req('R1', {}),
      req('R2', { location: 'Austin' }),
      req('R3', { openings: 2 }),
      req('R4', {}),
      req('R5', { level: 'E3' }),
      req('R6', { status: 'Filled' }),
    ]
    const c = cost(dataset({ employees: sj.employees, comp: sj.comp, requisitions: reqs }))
    expect(c.openReqs.total).toMatchObject({ reqs: 5, openings: 6, estimated: 5, noEstimate: 1 })
    expect(c.openReqs.total.estimateUsd).toBe(500_000)
    // Five estimated openings in one unit: shown, never fewer.
    expect(c.openReqs.rows.map((r) => [r.group, r.estimated, r.estimateUsd])).toEqual([
      ['Operations', 5, 500_000],
    ])
    expect(openReqDrill(c, c.openReqs.rows[0])?.rows).toHaveLength(5)
    const fewer = cost(dataset({ employees: sj.employees, comp: sj.comp, requisitions: reqs.slice(0, 2) }))
    expect(fewer.openReqs.total.estimateUsd).toBeNull()
  })
})

describe('Finance: totals without anyone’s pay', () => {
  const t = team(6, { businessUnit: 'Operations', costCenter: '4100' })
  const d = dataset({ employees: t.employees, comp: t.comp })

  it('shows cost totals without the switch, and drills list employees with their cost center', () => {
    const c = cost(d, { showPay: false, access: { mode: 'finance' } })
    expect(c).toMatchObject({ totals: true, shown: true })
    const tile = c.kpis.find((k) => k.id === 'cost-target-cash')!
    expect(tile.value).toBeCloseTo(6 * 110_000, 6)
    const spec = resolveDrill(tile.drill) as DrillSpec<'employees'>
    expect(spec.kind).toBe('employees')
    expect(spec.rows).toHaveLength(6)
    expect(spec.extra).toBeUndefined()
    expect(spec.rows[0].costCenter).toBe('4100')
    expect(resolveDrill(costRowDrill(c, c.byUnit[0]))?.kind).toBe('employees')
    // Filter to is for business units only.
    expect(resolveDrill(costRowDrill(c, c.byUnit[0]))?.filter).toEqual({ businessUnit: ['Operations'] })
    expect(resolveDrill(costRowDrill(c, c.byLevel[0]))?.filter).toBeUndefined()
  })

  it('keeps every cost column and drops every pay column', () => {
    const money = { pay: false, cost: true }
    for (const cols of [
      COST_BY_UNIT_COLUMNS,
      COST_BY_CENTER_COLUMNS,
      OPEN_REQ_COST_COLUMNS,
      SPEND_COLUMNS,
      BUDGET_COST_COLUMNS,
      BUDGET_CENTER_COLUMNS,
    ]) {
      const kept = visibleColumns(cols, money)
      expect(kept.filter((c) => c.cost).length).toBeGreaterThan(0)
      expect(kept.some((c) => c.pay)).toBe(false)
    }
    for (const cols of [COST_BY_UNIT_COLUMNS, SPEND_COLUMNS, BUDGET_COST_COLUMNS])
      expect(visibleColumns(cols, { pay: false, cost: false }).some((c) => c.cost)).toBe(false)
  })

  it('reads the target cash cost on the folder tab, never a ratio', () => {
    const ctx = context(d, { access: { mode: 'finance' } })
    expect(view.headline(ctx).metricId).toBe('comp.cost.targetCash')
    expect(costHeadline(ctx).value).toBe('$660K')
    expect(view.headline(context(d)).metricId).toBe('comp.compa.median')
  })
})

describe('the switch modes', () => {
  const t = team(6, { businessUnit: 'Operations' })
  const d = dataset({ employees: t.employees, comp: t.comp })

  it('hold no amount on a tile while "Show pay amounts" is off, and drill comp rows once it is on', () => {
    const off = cost(d, { showPay: false })
    expect(off.shown).toBe(false)
    for (const id of ['cost-target-cash', 'cost-base', 'cost-equity', 'cost-per-head']) {
      const k = off.kpis.find((x) => x.id === id)!
      expect(k.value, id).toBeNull()
      expect(k.drill, id).toBeFalsy()
      expect(k.note, id).toBe('Turn on Show pay amounts to see cost totals.')
    }
    // Counts are not amounts.
    expect(off.kpis.find((x) => x.id === 'cost-people')!.value).toBe(6)
    const on = cost(d, { showPay: true })
    expect(resolveDrill(on.kpis.find((x) => x.id === 'cost-target-cash')!.drill)?.kind).toBe('comp')
  })

  it('shows cost totals only in the modes and with the switch the contract names', () => {
    const shown = (access: AccessInput, showPay: boolean) => cost(d, { access, showPay }).shown
    expect(shown({ mode: 'hr' }, true)).toBe(true)
    expect(shown({ mode: 'compensation' }, true)).toBe(true)
    expect(shown({ mode: 'compensation' }, false)).toBe(false)
    expect(shown({ mode: 'finance' }, false)).toBe(true)
    expect(shown({ mode: 'talent-management' }, true)).toBe(false)
    expect(shown({ mode: 'hrbp-unit', picks: { unit: 'Operations' } }, true)).toBe(false)
  })
})

describe('on the sample company', () => {
  let data: Datasets
  const sampleContext = (
    filters: Partial<Filters> = {},
    access?: AccessInput,
    showPay = true,
  ): AnalyticsContext =>
    buildContext({
      data,
      sources: Object.fromEntries(
        DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
      ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>,
      filters: { ...DEFAULT_FILTERS, ...filters },
      asOfOverride: null,
      showPay,
      access,
    })
  let c: CostModel
  beforeAll(() => {
    data = generateSample()
    c = compModel(sampleContext()).cost
  })

  it('costs the 1,450 employees and counts 108 contractors and interns beside them', () => {
    expect(c.total.people).toBe(1450)
    expect(c.total.targetCashUsd).toBeGreaterThan(c.total.baseUsd!)
    expect(c.contingent.contractors.length + c.contingent.interns.length).toBe(108)
    expect(c.byCostCenter.filter((r) => !r.isOther)).toHaveLength(TOP_CENTERS)
    expect(topCostCenters(c, 8).filter((r) => !r.isOther)).toHaveLength(8)
  })

  it('every breakdown is guarded, in many scopes and with a raised minimum', () => {
    const scopes: [string, AnalyticsContext][] = [
      ['company', sampleContext()],
      ['Go-to-Market', sampleContext({ businessUnit: ['Go-to-Market'] })],
      ['Executive Office', sampleContext({ businessUnit: ['Executive Office'] })],
      ['Munich', sampleContext({ location: ['Munich'] })],
      ['E1-E3', sampleContext({ level: ['E1', 'E2', 'E3'] })],
      ['Finance mode', sampleContext({ businessUnit: ['Operations'] }, { mode: 'finance' }, false)],
    ]
    for (const [label, ctx] of scopes) {
      const m = computeComp(ctx).cost
      for (const [name, rows] of [
        ['unit', m.byUnit],
        ['center', m.byCostCenter],
        ['center top 8', topCostCenters(m, 8)],
        ['level', m.byLevel],
        ['site', m.bySite],
      ] as const)
        expectGuarded(rows, m.total, 5, `${label} ${name}`)
      // Merit spend and open reqs fold the same way.
      if (m.merit.total.priced >= 5) {
        const shown = m.merit.rows.filter((r) => r.eligibleBaseUsd != null)
        expect(
          shown.reduce((a, r) => a + (r.eligibleBaseUsd ?? 0), 0),
          label,
        ).toBeCloseTo(m.merit.total.eligibleBaseUsd, 2)
        for (const r of m.merit.rows)
          expect(r.members.length >= 5 || r.eligibleBaseUsd == null, label).toBe(true)
      }
      for (const r of m.openReqs.rows)
        expect(r.estimated >= 5 || r.estimateUsd == null, `${label} ${r.group}`).toBe(true)
    }
    const raised = computeComp(
      buildContext({
        data,
        sources: Object.fromEntries(
          DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
        ) as never,
        filters: DEFAULT_FILTERS,
        asOfOverride: null,
        showPay: true,
        metrics: metricsWith({ [ANONYMITY.metricId]: { [ANONYMITY.key]: 40 } }),
      }),
    ).cost
    for (const rows of [raised.byUnit, raised.byCostCenter, raised.byLevel, raised.bySite])
      expectGuarded(rows, raised.total, 40, 'min 40')
  })

  it('in Finance, every drill behind a number lists employees or reqs, never comp rows or amounts', () => {
    const ctx = sampleContext({}, { mode: 'finance' }, false)
    const m = computeComp(ctx).cost
    const specs = [
      ...m.kpis.map((k) => resolveDrill(k.drill)),
      ...[...m.byUnit, ...m.byCostCenter, ...m.byLevel, ...m.bySite].map((r) => costRowDrill(m, r)),
      ...m.openReqs.rows.map((r) => openReqDrill(m, r)),
      costPeopleDrill(m, 'Everyone', m.total.members),
    ].filter((s): s is DrillSpec => !!s)
    expect(specs.length).toBeGreaterThan(20)
    for (const s of specs) {
      expect(['employees', 'requisitions'], s.title).toContain(s.kind)
      for (const col of s.extra?.columns ?? [])
        expect(col.pay || col.cost, `${s.title} ${col.key}`).toBeFalsy()
    }
    // Items: none about one person, every drill a kind Finance lists.
    for (const i of compActions(ctx)) {
      expect(i.subject.kind, i.id).toBe('none')
      expect(resolveDrill(i.drill)?.kind, i.id).toBe('employees')
    }
  })

  it('actual against budget: Silicon Engineering under on headcount and over on cost, Go-to-Market over on headcount', () => {
    const b = c.budget!
    expect(b).not.toBeNull()
    const se = b.byUnit.find((r) => r.key === 'Silicon Engineering')!
    expect(se.headcountStatus).toBe('under')
    expect(se.costStatus).toBe('over')
    expect(b.byUnit.find((r) => r.key === 'Go-to-Market')!.headcountStatus).toBe('over')
    // A location filter cannot be compared with a budget set by business unit.
    expect(computeComp(sampleContext({ location: ['Munich'] })).cost.budget?.unavailable).toMatch(
      /not by location/,
    )
  })

  it('falls back to no budget model when none is loaded', () => {
    const none = { ...data, budget: [] }
    const ctx = buildContext({
      data: none,
      sources: Object.fromEntries(
        DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: none[k].length }]),
      ) as never,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay: true,
    })
    expect(computeComp(ctx).cost.budget).toBeNull()
  })

  it('Other is a real fold, never an empty row', () => {
    for (const rows of [c.byUnit, c.byCostCenter, c.byLevel, c.bySite])
      for (const r of rows) if (r.key === OTHER) expect(r.folded).toBeGreaterThan(0)
  })
})
