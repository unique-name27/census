/**
 * The dictionary against what the screens show, on the sample company:
 *
 * - every KPI and finding's fields are registered on its metric (with the settings in force), so
 *   the tier the dictionary shows is never above the tier of the same number on screen;
 * - a changed setting marks every number it changes ("Definition changed"), wherever the setting
 *   is registered.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultMetrics } from '@/metrics/api'
import { metricsWith } from '@/metrics/testing'
import type { MetricsApi } from '@/metrics/types'
import { allNumbers, type ShownNumber, sampleContext } from './numbers.testkit'

/** Settings that change what a number reads or how it is counted, each away from its default. */
const CHANGED: readonly Parameters<typeof metricsWith>[0][] = [
  { 'recruiting.reqs.timeToFill': { endEvent: 'start' } },
  { 'hrbp.headcount.employees': { countContractors: true }, 'hrbp.attrition.all': { annualize: false } },
  { 'hrbp.attrition.regretted': { rule: 'anyFlagged' } },
  { 'talent.performance.highPerformers': { minRating: 5 } },
]

const key = (n: ShownNumber) => `${n.view} ${n.kind} ${n.id}`

let base: ShownNumber[]
beforeAll(() => {
  base = allNumbers(sampleContext())
})

function unregistered(nums: readonly ShownNumber[], m: MetricsApi): string[] {
  const out: string[] = []
  for (const n of nums) {
    if (!n.metricId || !n.uses) continue
    const registered = new Set(m.usesOf(n.metricId))
    const extra = n.uses.filter((u) => !registered.has(u))
    if (extra.length) out.push(`${key(n)} (${n.metricId}): ${extra.join(', ')}`)
  }
  return out
}

describe('every number on screen', () => {
  it('names a registered metric', () => {
    expect(base.length).toBeGreaterThan(80)
    const m = defaultMetrics()
    expect(base.filter((n) => !n.metricId || !m.def(n.metricId)).map(key)).toEqual([])
  })

  it('reads only fields registered on its metric, at the defaults', () => {
    expect(unregistered(base, defaultMetrics())).toEqual([])
  })

  it('reads only fields registered on its metric, with settings changed', () => {
    for (const settings of CHANGED) {
      const m = metricsWith(settings)
      expect(unregistered(allNumbers(sampleContext(m)), m), JSON.stringify(settings)).toEqual([])
    }
  })

  it('takes the start-date fields into time to fill only while the clock stops there', () => {
    const at = (endEvent: string) => metricsWith({ 'recruiting.reqs.timeToFill': { endEvent } })
    expect(at('start').usesOf('recruiting.reqs.timeToFill')).toContain('employees.hireDate')
    expect(at('accepted').usesOf('recruiting.reqs.timeToFill')).not.toContain('employees.hireDate')
    // The dictionary page, its tier and the metric impact ranking read the merged definition.
    expect(at('start').def('recruiting.reqs.timeToFill')?.uses).toContain('candidates.candidateName')
    expect(at('start').defaultDef('recruiting.reqs.timeToFill')?.uses).not.toContain(
      'candidates.candidateName',
    )
  })
})

describe('a changed setting', () => {
  /** Settings registered on one metric that change numbers of others (the review's cases). */
  const CASES: readonly Parameters<typeof metricsWith>[0][] = [
    { 'hrbp.headcount.employees': { countContractors: true } },
    { 'hrbp.attrition.firstYear': { days: 180 } },
    { 'services.cases.aged': { days: 7 } },
    { 'org.flags.wideSpan': { minDirects: 10 }, 'org.flags.narrowSpan': { maxDirects: 2 } },
    { 'talent.performance.highPerformers': { minRating: 5 } },
    { 'talent.retention.riskBands': { highShare: 0.2 } },
    { 'comp.compa.inBand': { healthyBand: [0.95, 1.05] } },
    { 'privacy.anonymity': { minGroup: 8 } },
  ]

  it('marks every number it changes', () => {
    const before = new Map(base.map((n) => [key(n), n.shown]))
    for (const settings of CASES) {
      const m = metricsWith(settings)
      const after = allNumbers(sampleContext(m))
      const changed = after.filter((n) => before.has(key(n)) && before.get(key(n)) !== n.shown)
      expect(changed.length, JSON.stringify(settings)).toBeGreaterThan(0)
      const unmarked = changed
        .filter((n) => !n.metricId || m.changesBehind(n.metricId).length === 0)
        .map((n) => `${key(n)}: ${before.get(key(n))} => ${n.shown}`)
      expect(unmarked, JSON.stringify(settings)).toEqual([])
    }
  })

  it('marks nothing at the defaults', () => {
    const m = defaultMetrics()
    expect(base.filter((n) => n.metricId && m.changesBehind(n.metricId).length > 0).map(key)).toEqual([])
  })
})
