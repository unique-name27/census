/**
 * Compensation for the Scorecard and the Action center (docs/ROLES-V2.md 5.6 and 5.14): the
 * summary's measures and the items for Total rewards. Below range minimum is one roll-up (one per
 * business unit in an HRBP scope), merit over budget, high performers paid low and missing
 * proposals are per business unit, guideline exceptions per person; every item is due on the
 * cycle's close date or says it has none, and no item's text holds a money amount.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AccessInput } from '@/access/context'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type Datasets, type Employee } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { metricsWith } from '@/metrics/testing'
import { ACTION_OWNER_ROLES, type ActionItem } from '../../types'
import { M } from '../metrics'
import {
  COMP_KIND,
  compActions,
  compSummary,
  fingerprintOf,
  NO_CLOSE_DATE,
  NO_CLOSE_REASON,
  SUMMARY_KPIS,
  TOTAL_REWARDS,
} from './actions'
import { ruleExceptions } from './drill'
import { compModel } from './model'
import { comp, context, dataset, emp, review, team } from './test-fixtures'

const NAGGING = /\b(chas\w*|push\w*|nag\w*|ping\w*|hound\w*|remind\w*)\b/i
/** A currency amount in any form: "$5,000", "5,000 USD", "$1.2M", "€3,000", "₹2.4L". */
const AMOUNT = /[$€£¥₹]|\b(USD|EUR|GBP|INR|TWD|CNY|ILS|CAD|VND)\b|\b\d[\d,.]*\s?(K|M|bn)\b/

const byId = (items: readonly ActionItem[], id: string) => {
  const x = items.find((i) => i.id === id)
  if (!x) throw new Error(`no item ${id}: ${items.map((i) => i.id).join(', ')}`)
  return x
}
const rows = (x: ActionItem) => resolveDrill(x.drill)?.rows ?? []
const closeOn = (date: string, more: Record<string, unknown> = {}) =>
  metricsWith({ [M.proposals]: { closeDate: date, ...more } })

describe('action items on hand-built data', () => {
  const boss = emp({ employeeId: 'B1', name: 'Bea Boss', level: 'M1' })
  const low = emp({ employeeId: 'LOW', name: 'Lee Low', managerId: 'B1' })
  const top = emp({ employeeId: 'TOP', name: 'Tia Top', managerId: 'B1' })
  const weak = emp({ employeeId: 'WEAK', name: 'Wes Weak', managerId: 'B1' })
  const fine = emp({ employeeId: 'FINE', name: 'Fay Fine', managerId: 'B1' })
  const employees = [boss, low, top, weak, fine]
  const data = dataset({
    employees,
    comp: [
      comp(boss),
      // Base 75,000 against a minimum of 80,000: an increase of 6.7% reaches it.
      comp(low, { compa: 0.75 }),
      comp(top, { meritPct: 0.01 }),
      comp(weak, { meritPct: 0.05 }),
      comp(fine),
    ],
    reviews: [review(boss, 3), review(low, 3), review(top, 5), review(weak, 2), review(fine, 3)],
  })

  it('rolls everyone below range minimum into one item for Total rewards, with no amount in its text', () => {
    const items = compActions(context(data))
    const x = byId(items, 'comp:below-minimum:all')
    expect(x).toMatchObject({
      ownerRole: 'total-rewards',
      ownerName: TOTAL_REWARDS,
      ownerId: null,
      severity: 'warning',
      view: 'comp',
      tab: 'ranges',
      kind: COMP_KIND.belowMinimum,
      due: null,
      subject: { kind: 'none' },
    })
    expect(x.what).toBe('1 person is paid below their range minimum; plan moves before the cycle closes')
    expect(x.note).toBe(
      'Could we plan these moves to the range minimum in this cycle, or confirm why they wait?',
    )
    expect(x.fingerprint).toBe(fingerprintOf(['LOW']))
    // One person's gap is never an item amount: a total needs 5 or more people.
    expect(x.amount).toBeUndefined()
    expect(x.uses).not.toContain('comp.fxToUsd')
    expect(items.some((i) => i.id === 'comp:below-minimum:LOW')).toBe(false)
    for (const i of items) expect(`${i.what} ${i.note}`, i.id).not.toMatch(AMOUNT)
    expect(rows(x)).toHaveLength(1)
  })

  it('holds the cost to minimum in `amount` over 5 or more people, never in the text, switch on or off', () => {
    const below = team(6, { businessUnit: 'Operations' }, () => ({ compa: 0.75 }))
    const d = dataset({ employees: below.employees, comp: below.comp })
    for (const showPay of [false, true]) {
      const x = byId(compActions(context(d, { showPay })), 'comp:below-minimum:all')
      expect(x.amount).toEqual({ usd: 6 * 5_000, label: 'Cost to bring to minimum, a year' })
      // The amount reads the FX rate only while it is shown.
      expect(x.uses?.includes('comp.fxToUsd')).toBe(showPay)
      expect(`${x.what} ${x.note}`).not.toMatch(AMOUNT)
    }
    // Ratios only in an HRBP scope: no amount at all, one item per business unit.
    const hrbp = compActions(context(d, { access: { mode: 'hrbp-unit', picks: { unit: 'Operations' } } }))
    const u = byId(hrbp, 'comp:below-minimum:Operations')
    expect(u.amount).toBeUndefined()
    expect(u.place).toEqual({ businessUnit: 'Operations' })
    expect(u.what).toContain('6 people are paid below their range minimum in Operations')
  })

  it('is due on the cycle close date when one is set; without one it says why once, never in every item', () => {
    const items = compActions(context(data, { metrics: closeOn('2026-10-30') }))
    for (const i of items) {
      expect(i.due, i.id).toBe('2026-10-30')
      expect(i.what, i.id).not.toContain(NO_CLOSE_DATE)
      expect(i.closesWhen, i.id).toBeUndefined()
    }
    for (const i of compActions(context(data))) {
      expect(i.due, i.id).toBeNull()
      expect(i.what, i.id).not.toContain(NO_CLOSE_DATE)
      expect(i.closesWhen, i.id).toBe(NO_CLOSE_REASON)
    }
  })

  it('rolls guideline exceptions up per business unit, the people in its drill', () => {
    const items = compActions(context(data, { metrics: closeOn('2026-10-30') }))
    const t = byId(items, 'comp:guideline-exception:Silicon Engineering')
    expect(t).toMatchObject({
      ownerRole: 'total-rewards',
      tab: 'cycle',
      kind: COMP_KIND.exception,
      subject: { kind: 'none' },
      place: { businessUnit: 'Silicon Engineering' },
    })
    expect(t.what).toMatch(/^\d+ merit proposals? in Silicon Engineering (is|are) outside the guideline: /)
    expect(t.what).toContain('rated 5 below the 2.0% floor')
    expect(t.what).toContain('rated 1 or 2 above the 3.0% cap')
    expect(t.note).toBe('Could we confirm these merit proposals with their managers before the cycle closes?')
    expect(t.fingerprint).toBeTruthy()
    const people = resolveDrill(t.drill)?.rows.map((r) => (r as { employeeId: string }).employeeId) ?? []
    expect(people).toEqual(expect.arrayContaining(['TOP', 'WEAK']))
    expect(people).not.toContain('FINE')
    expect(items.some((i) => i.id.endsWith(':TOP') || i.id.endsWith(':WEAK'))).toBe(false)
  })

  it('is empty without comp data', () => {
    expect(compActions(context(dataset({ employees })))).toEqual([])
  })
})

describe('merit spend over budget, by business unit', () => {
  const hot = team(6, { businessUnit: 'Go-to-Market', department: 'Sales' }, () => ({ meritPct: 0.06 }))
  const calm = team(6, { businessUnit: 'Operations', department: 'Supply chain' }, () => ({ meritPct: 0.03 }))
  const d = dataset({ employees: [...hot.employees, ...calm.employees], comp: [...hot.comp, ...calm.comp] })

  it('raises the units the readout raises, with the overrun in `amount` and spend in % in the text', () => {
    const items = compActions(context(d))
    const x = byId(items, 'comp:over-budget:Go-to-Market')
    expect(x).toMatchObject({
      kind: COMP_KIND.overBudget,
      tab: 'cost',
      severity: 'warning',
      subject: { kind: 'none' },
      place: { businessUnit: 'Go-to-Market' },
    })
    expect(x.what).toBe(
      'Merit proposals in Go-to-Market cost 6.00% of eligible base, 2.50 pts over the 3.50% budget',
    )
    expect(x.amount?.usd).toBeCloseTo(6 * 100_000 * 0.025, 6)
    expect(items.some((i) => i.id === 'comp:over-budget:Operations')).toBe(false)
    // The finding names the same unit.
    expect(compModel(context(d)).findings.some((f) => f.id === 'comp-over-budget-Go-to-Market')).toBe(true)
    // Outside Finance it opens the proposals as comp rows.
    expect(resolveDrill(x.drill)?.kind).toBe('comp')
  })

  it('in Finance: no item about one person, and drills that list employees only', () => {
    // Finance rounds to $100,000, so the teams are paid enough for the overrun to show.
    const big = (n: number, bu: string, merit: number) =>
      team(n, { businessUnit: bu, department: 'Sales' }, () => ({ baseSalary: 400_000, meritPct: merit }))
    const hotF = big(6, 'Go-to-Market', 0.06)
    const calmF = big(6, 'Operations', 0.03)
    const fin = dataset({
      employees: [...hotF.employees, ...calmF.employees],
      comp: [...hotF.comp, ...calmF.comp],
    })
    const items = compActions(context(fin, { access: { mode: 'finance' } }))
    expect(items.map((i) => i.id)).toEqual(['comp:over-budget:Go-to-Market'])
    for (const i of items) {
      expect(i.subject.kind, i.id).toBe('none')
      expect(resolveDrill(i.drill)?.kind, i.id).toBe('employees')
    }
    // Base $2.4M, spend $144,000 → $0.1M, budget $84,000 → under $0.1M: the text and the amount
    // come from the rounded amounts, never the exact ones.
    const x = items[0]
    expect(x.what).toBe(
      'Merit proposals in Go-to-Market cost 4.17% of eligible base, 0.67 pts over the 3.50% budget',
    )
    expect(x.amount).toEqual({ usd: 100_000, label: 'Over merit budget', rounded: true })
  })
})

describe('high performers paid low in range, by business unit', () => {
  const annual = (ps: readonly Employee[], rating: number) =>
    ps.map((e) => review(e, rating, { cycle: '2025 Annual', cycleDate: '2025-12-15' }))

  it('raises 5 or more rated 4 or 5 in the latest annual cycle with a compa-ratio under the band', () => {
    const lowPaid = team(5, { businessUnit: 'Corporate', department: 'Finance' }, () => ({ compa: 0.85 }))
    const fewer = team(4, { businessUnit: 'Operations', department: 'Supply chain' }, () => ({ compa: 0.85 }))
    const d = dataset({
      employees: [...lowPaid.employees, ...fewer.employees],
      comp: [...lowPaid.comp, ...fewer.comp],
      reviews: [...annual(lowPaid.employees, 4), ...annual(fewer.employees, 5)],
    })
    const items = compActions(context(d))
    const x = byId(items, 'comp:high-rated-low-compa:Corporate')
    expect(x).toMatchObject({ kind: COMP_KIND.highRatedLow, tab: 'performance', severity: 'warning' })
    expect(x.what).toBe(
      '5 people in Corporate rated 4 or 5 in the 2025 Annual cycle have a compa-ratio under 0.90',
    )
    expect(rows(x)).toHaveLength(5)
    expect(x.fingerprint).toBe(fingerprintOf(lowPaid.employees.map((e) => e.employeeId)))
    expect(items.some((i) => i.id === 'comp:high-rated-low-compa:Operations')).toBe(false)
  })
})

describe('merit proposals missing, while the cycle is open', () => {
  // Six eligible with no proposal in Corporate, hired long before the cutoff; one recent hire in it too.
  const missing = team(6, { businessUnit: 'Corporate', hireDate: '2021-03-01' }, () => ({ meritPct: null }))
  const done = team(6, { businessUnit: 'Operations', hireDate: '2025-02-01' })
  const recent = team(1, { businessUnit: 'Corporate', hireDate: '2026-08-01' }, () => ({ meritPct: null }))
  const d = dataset({
    employees: [...missing.employees, ...done.employees, ...recent.employees],
    comp: [...missing.comp, ...done.comp, ...recent.comp],
  })

  it('counts eligible people only: hired by the latest hire with a proposal, without a setting', () => {
    const m = compModel(context(d))
    expect(m.cycle.calendar).toMatchObject({ state: 'open', cutoff: '2025-02-01', cutoffInferred: true })
    const corp = m.cycle.progress.rows.find((r) => r.group === 'Corporate')!
    expect(corp).toMatchObject({ eligible: 6, proposed: 0, missing: 6, share: 0 })
    const x = byId(compActions(context(d)), 'comp:no-proposal:Corporate')
    expect(x).toMatchObject({ kind: COMP_KIND.noProposal, tab: 'cycle', severity: 'info' })
    expect(x.what).toBe('6 eligible people in Corporate have no merit proposal')
    expect(rows(x)).toHaveLength(6)
  })

  it('turns into a watch item within the warning days of the close date, and stops once it closes', () => {
    const soon = compActions(context(d, { metrics: closeOn('2026-10-10') }))
    expect(byId(soon, 'comp:no-proposal:Corporate')).toMatchObject({ severity: 'warning', due: '2026-10-10' })
    expect(byId(soon, 'comp:no-proposal:Corporate').what).toContain('the cycle closes 10 Oct')
    const later = compActions(context(d, { metrics: closeOn('2026-12-15') }))
    expect(byId(later, 'comp:no-proposal:Corporate').severity).toBe('info')
    const closed = compActions(context(d, { metrics: closeOn('2026-09-15') }))
    expect(closed.some((i) => i.id.startsWith('comp:no-proposal:'))).toBe(false)
    const notOpen = compActions(
      context(d, { metrics: metricsWith({ [M.proposals]: { openDate: '2026-11-01' } }) }),
    )
    expect(notOpen.some((i) => i.id.startsWith('comp:no-proposal:'))).toBe(false)
  })

  it('follows the eligibility date when it is set', () => {
    const m = compModel(
      context(d, { metrics: metricsWith({ [M.proposals]: { eligibleHiredBy: '2026-08-31' } }) }),
    )
    expect(m.cycle.calendar).toMatchObject({ cutoff: '2026-08-31', cutoffInferred: false })
    expect(m.cycle.progress.rows.find((r) => r.group === 'Corporate')!.missing).toBe(7)
  })
})

describe('on the sample company', () => {
  let data: Datasets
  let ctx: AnalyticsContext
  let items: ActionItem[]
  const sampleContext = (showPay = false, access?: AccessInput) =>
    buildContext({
      data,
      sources: Object.fromEntries(
        DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
      ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay,
      access,
    })
  beforeAll(() => {
    data = generateSample()
    ctx = sampleContext()
    items = compActions(ctx)
  })

  it('summary: in healthy band, below minimum and merit spend, with the readout', () => {
    const s = compSummary(ctx)
    expect(s.kpis.map((k) => k.id)).toEqual([...SUMMARY_KPIS])
    expect(s.kpis.map((k) => k.metricId)).toEqual([M.inBand, M.belowMin, M.spend])
    // Story 2: 78 of 1,450 below minimum.
    expect(s.kpis[1].value).toBeCloseTo(78 / 1450, 6)
    expect(ctx.metrics.target(M.inBand)).toEqual({ value: 0.8, comparator: '>=' })
    expect(ctx.metrics.target(M.belowMin)).toEqual({ value: 0.02, comparator: '<=' })
    for (const k of s.kpis) expect(k.uses?.length, k.id).toBeGreaterThan(0)
    expect(s.findings).toBe(compModel(ctx).findings)
  })

  it('story 2: the 78 people below range minimum are one item, 41 of them in Bengaluru', () => {
    const below = items.filter((i) => i.id.startsWith('comp:below-minimum:'))
    expect(below.map((i) => i.id)).toEqual(['comp:below-minimum:all'])
    expect(below[0].what).toMatch(/^78 people are paid below their range minimum/)
    const people = rows(below[0]) as { employeeId: string }[]
    expect(people).toHaveLength(78)
    expect(people.filter((r) => ctx.org.byId.get(r.employeeId)?.location === 'Bengaluru')).toHaveLength(41)
    expect(below[0].fingerprint).toMatch(/^78:/)
    expect(below[0].amount?.usd).toBeGreaterThan(0)
  })

  it('in an HRBP region scope, one below-minimum item per business unit, ratios only', () => {
    const r = compActions(sampleContext(false, { mode: 'hrbp-region', picks: { region: 'APAC' } }))
    const below = r.filter((i) => i.id.startsWith('comp:below-minimum:'))
    expect(below.length).toBeGreaterThan(1)
    for (const i of below) {
      expect(i.place?.businessUnit, i.id).toBeTruthy()
      expect(i.amount, i.id).toBeUndefined()
    }
    expect(below.reduce((a, i) => a + rows(i).length, 0)).toBe(
      compModel(sampleContext(false, { mode: 'hrbp-region', picks: { region: 'APAC' } })).ranges.below.length,
    )
  })

  it('Go-to-Market over budget, high performers paid low in five units, and every rule-breaking exception', () => {
    expect(items.filter((i) => i.id.startsWith('comp:over-budget:')).map((i) => i.id)).toEqual([
      'comp:over-budget:Go-to-Market',
    ])
    const high = items.filter((i) => i.id.startsWith('comp:high-rated-low-compa:'))
    expect(high.map((i) => i.place?.businessUnit).sort()).toEqual(
      ['Corporate', 'Go-to-Market', 'Operations', 'Silicon Engineering', 'Systems & Software'].sort(),
    )
    // Every proposal is in on the sample (everyone hired by 30 Mar 2026 has one).
    expect(items.some((i) => i.id.startsWith('comp:no-proposal:'))).toBe(false)
    // One roll-up per business unit with a rule-breaking proposal, holding every one of them.
    const exceptions = items.filter((i) => i.id.startsWith('comp:guideline-exception:'))
    const rows = ruleExceptions(compModel(ctx).cycle.exceptions)
    expect(rows).toHaveLength(11)
    expect(exceptions.map((i) => i.place?.businessUnit).sort()).toEqual(
      [...new Set(rows.map((r) => r.person.businessUnit))].sort(),
    )
    const counted = exceptions.reduce((n, i) => n + Number(/^(\d+) merit/.exec(i.what)?.[1] ?? 0), 0)
    expect(counted).toBe(rows.length)
  })

  it('never writes a money amount into an item, in any mode, switch on or off', () => {
    const modes: AccessInput[] = [
      { mode: 'hr' },
      { mode: 'compensation' },
      { mode: 'finance' },
      { mode: 'chro' },
      { mode: 'hrbp-unit', picks: { unit: 'Silicon Engineering' } },
    ]
    for (const access of modes)
      for (const showPay of [false, true])
        for (const x of compActions(sampleContext(showPay, access)))
          expect(`${x.what} ${x.note}`, `${access.mode} ${x.id}`).not.toMatch(AMOUNT)
  })

  it('keeps ids unique and stable, roll-ups fingerprinted, and words polite', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(compActions(sampleContext()).map((i) => i.id)).toEqual(items.map((i) => i.id))
    for (const x of items) {
      expect(ACTION_OWNER_ROLES, x.id).toContain(x.ownerRole)
      expect(x.uses?.length, x.id).toBeGreaterThan(0)
      expect(x.kind, x.id).toBeTruthy()
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(NAGGING)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(/—|!/)
      expect(x.what, x.id).not.toMatch(/\.$/)
      expect(rows(x).length, x.id).toBeGreaterThan(0)
      if (x.subject.kind === 'none') expect(x.fingerprint, x.id).toBeTruthy()
      else expect(rows(x), x.id).toHaveLength(1)
    }
  })
})
