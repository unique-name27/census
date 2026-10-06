/**
 * "Filter to this" on the People scorecard (docs/FILTERS.md, part 4). The scorecard builds no
 * drill of its own: each value, change and note opens its practice's records, and each top finding
 * its practice's, so the filters are the practices'. The scorecard's part is that a measure's
 * value and change are the scope's own (no filter), that what it shows carries the practice's
 * filter unchanged, and that every filter it shows names only the scope's filters with values in
 * the loaded data.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { FILTER_DIMENSIONS } from '@/data/scope'
import { vocabularyOf } from '@/data/urlScope'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { applyDrillFilter } from '@/drill/testing'
import type { DrillFilter } from '@/drill/types'
import { VIEWS } from '@/views/registry'
import type { ScorecardModel } from './model'
import { computeScorecard } from './schedule'
import { sampleContext } from './testkit'

const filterOf = (src: DrillSource): DrillFilter | undefined => resolveDrill(src)?.filter

let ctx: AnalyticsContext
let m: ScorecardModel
beforeAll(() => {
  ctx = sampleContext()
  m = computeScorecard(ctx, VIEWS)
}, 60_000)

describe('Filter to on the People scorecard', () => {
  it('a measure’s value and change are the scope’s own, so they set no filter', () => {
    expect(m.rows.length).toBeGreaterThan(10)
    for (const r of m.rows) {
      expect(filterOf(r.kpi.drill), `${r.id} value`).toBeUndefined()
      expect(filterOf(r.kpi.deltaDrill), `${r.id} change`).toBeUndefined()
    }
  })

  it('shows each practice’s finding with the practice’s own filter, unchanged', () => {
    const byView = new Map(VIEWS.map((v) => [v.key, v]))
    let compared = 0
    for (const s of m.findings.all) {
      const view = byView.get(s.view)
      if (!view?.summary) continue
      const own = view.summary(ctx).findings.find((f) => `${s.view}:${f.id}` === s.finding.id)
      expect(own, s.finding.id).toBeDefined()
      expect(filterOf(s.finding.drill), s.finding.id).toEqual(filterOf(own?.drill))
      if (filterOf(own?.drill)) compared++
    }
    expect(compared).toBeGreaterThan(0)
  })

  it('every filter it shows names only the scope’s filters, with values in the loaded data', () => {
    const allowed = new Set<string>([...FILTER_DIMENSIONS, 'modes', 'period', 'customStart', 'customEnd'])
    const vocab = vocabularyOf(ctx)
    const sources: DrillSource[] = [
      ...m.rows.map((r) => r.kpi.noteDrill),
      ...[...m.findings.top, ...m.findings.hidden].map((s) => s.finding.drill),
    ]
    for (const src of sources) {
      const f = filterOf(src)
      if (!f) continue
      for (const k of Object.keys(f)) expect(allowed.has(k), k).toBe(true)
      for (const d of FILTER_DIMENSIONS)
        if (d !== 'leaderId') for (const v of f[d] ?? []) expect(vocab.hasValue(d, v), `${d} ${v}`).toBe(true)
      if (f.leaderId) expect(vocab.hasLeader(f.leaderId)).toBe(true)
    }
  })

  it('a hiring plan finding keeps its number after Filter to its business unit', () => {
    const plan = m.findings.all.filter(
      (s) => s.view === 'onboarding' && /^onboarding:onboarding-plan-/.test(s.finding.id),
    )
    expect(plan.length).toBeGreaterThan(0)
    for (const s of plan) {
      const filter = filterOf(s.finding.drill) as DrillFilter
      expect(Object.keys(filter).filter((k) => k !== 'modes')).toEqual(['businessUnit'])
      const after = computeScorecard(applyDrillFilter(ctx, filter), VIEWS)
      const same = after.findings.all.find((x) => x.finding.id === s.finding.id)
      expect(same?.finding.title, s.finding.id).toBe(s.finding.title)
    }
  })
})
