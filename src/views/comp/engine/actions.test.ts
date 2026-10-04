/**
 * Compensation for the Scorecard and the Action center: the summary's measures and the open
 * items for Total rewards (people below range minimum, guideline exceptions), with pay amounts
 * only while they are switched on.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { generateSample } from '@/data/sample'
import { DATASET_KEYS, type Datasets } from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveDrill } from '@/drill/Drill'
import { ACTION_OWNER_ROLES, type ActionItem } from '../../types'
import { M } from '../metrics'
import { compActions, compSummary, SUMMARY_KPIS, TOTAL_REWARDS } from './actions'
import { ruleExceptions } from './drill'
import { compModel } from './model'
import { comp, context, dataset, emp, review } from './test-fixtures'

const NAGGING = /\b(chas\w*|push\w*|nag\w*|ping\w*|hound\w*|remind\w*)\b/i
/** A currency amount in any form: "$5,000", "5,000 USD", "$1.2M". */
const AMOUNT = /\$|\bUSD\b/

const byId = (items: readonly ActionItem[], id: string) => {
  const x = items.find((i) => i.id === id)
  if (!x) throw new Error(`no item ${id}: ${items.map((i) => i.id).join(', ')}`)
  return x
}

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

  it('lists below-minimum people for Total rewards, as a share of base without pay amounts', () => {
    const items = compActions(context(data))
    const x = byId(items, 'comp:below-minimum:LOW')
    expect(x).toMatchObject({
      ownerRole: 'total-rewards',
      ownerName: TOTAL_REWARDS,
      ownerId: null,
      severity: 'warning',
      view: 'comp',
      tab: 'ranges',
      subject: { kind: 'comp', id: 'LOW', label: 'Lee Low' },
    })
    expect(x.what).toBe('Base salary is below the range minimum; it takes an increase of 6.7% to reach it')
    expect(x.note).toBe(
      "Could we plan Lee's move to the range minimum in the next cycle, or confirm why it waits?",
    )
    expect(x.uses).not.toContain('comp.fxToUsd')
    for (const i of items) expect(`${i.what} ${i.note}`, i.id).not.toMatch(AMOUNT)
    expect(resolveDrill(x.drill)!.rows).toHaveLength(1)
  })

  it('adds the amount only while pay amounts are shown', () => {
    const x = byId(compActions(context(data, { showPay: true })), 'comp:below-minimum:LOW')
    expect(x.what).toMatch(
      /^Base salary is below the range minimum; it takes an increase of 6\.7% to reach it, \$5,000 a year in USD$/,
    )
    expect(x.uses).toContain('comp.fxToUsd')
  })

  it('lists guideline exceptions with the manager to confirm with', () => {
    const items = compActions(context(data))
    const t = byId(items, 'comp:guideline-exception:TOP')
    expect(t).toMatchObject({
      ownerRole: 'total-rewards',
      tab: 'cycle',
      subject: { kind: 'comp', id: 'TOP' },
    })
    expect(t.what).toBe(
      'Rated 5 with a 1.0% merit proposal, below the 2.0% floor for a 5; the guideline is 6.0%',
    )
    expect(t.note).toBe(
      'Could we confirm the merit proposal for Tia Top with Bea Boss before the cycle closes?',
    )
    const w = byId(items, 'comp:guideline-exception:WEAK')
    expect(w.what).toBe(
      'Rated 2 with a 5.0% merit proposal, above the 3.0% cap for a 1 or 2; the guideline is 1.0%',
    )
    expect(items.some((i) => i.subject.id === 'FINE')).toBe(false)
  })

  it('is empty without comp data', () => {
    expect(compActions(context(dataset({ employees })))).toEqual([])
  })
})

describe('on the sample company', () => {
  let data: Datasets
  let ctx: AnalyticsContext
  let items: ActionItem[]
  const sampleContext = (showPay = false) =>
    buildContext({
      data,
      sources: Object.fromEntries(
        DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }]),
      ) as Record<(typeof DATASET_KEYS)[number], SourceMeta>,
      filters: DEFAULT_FILTERS,
      asOfOverride: null,
      showPay,
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

  it('story 2: the 78 people below range minimum, 41 in Bengaluru, largest gap first', () => {
    const below = items.filter((i) => i.id.startsWith('comp:below-minimum:'))
    expect(below).toHaveLength(78)
    const inBengaluru = below.filter((i) => ctx.org.byId.get(i.subject.id!)?.location === 'Bengaluru')
    expect(inBengaluru).toHaveLength(41)
    const gaps = compModel(ctx)
      .ranges.below.map((r) => r.gapPct)
      .sort((a, b) => b - a)
    expect(below[0].what).toContain(`an increase of ${(gaps[0] * 100).toFixed(1)}%`)
  })

  it('every rule-breaking guideline exception, and no pay amount unless switched on', () => {
    const exceptions = items.filter((i) => i.id.startsWith('comp:guideline-exception:'))
    expect(exceptions).toHaveLength(ruleExceptions(compModel(ctx).cycle.exceptions).length)
    for (const x of items) expect(`${x.what} ${x.note}`, x.id).not.toMatch(AMOUNT)
    const paid = compActions(sampleContext(true)).filter((i) => i.id.startsWith('comp:below-minimum:'))
    expect(paid.every((i) => AMOUNT.test(i.what))).toBe(true)
  })

  it('keeps ids unique and stable and words polite', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    expect(compActions(sampleContext()).map((i) => i.id)).toEqual(items.map((i) => i.id))
    for (const x of items) {
      expect(ACTION_OWNER_ROLES, x.id).toContain(x.ownerRole)
      expect(x.uses?.length, x.id).toBeGreaterThan(0)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(NAGGING)
      expect(`${x.what} ${x.note}`, x.id).not.toMatch(/—|!/)
      expect(resolveDrill(x.drill)?.rows.length, x.id).toBe(1)
    }
  })
})
