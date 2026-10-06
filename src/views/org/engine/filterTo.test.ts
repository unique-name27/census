/**
 * "Filter to this" on the Org chart (docs/FILTERS.md, part 4): a person's org count (card, people
 * and flags tables, detail panel) sets their org as the filter. After "Filter to", the chart starts
 * at that person, their card keeps its count, and the org holds exactly them and that count. The
 * sandbox's what-if orgs and every other count set nothing.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { FILTER_DIMENSIONS } from '@/data/scope'
import { resolveDrill } from '@/drill/Drill'
import { applyDrillFilter, expectFilterTo, expectLeaveOut, offeredScope } from '@/drill/testing'
import {
  COMPANY_ROOT,
  type DrillScope,
  directsDrill,
  keyFigureDrills,
  orgDrill,
  orgKeyFigures,
  orgModel,
  subtreeOf,
} from '.'
import { sampleCtx } from './fixtures'

const chartScope = (x: AnalyticsContext): DrillScope => ({ label: 'Whole company', asOf: x.asOf })

/** The people on the chart under its root, with the "org" count their card shows. */
const cards = (x: AnalyticsContext) => {
  const m = orgModel(x)
  return subtreeOf(m.tree, m.rootId).map((id) => ({ id, org: m.tree.total.get(id) ?? 0 }))
}

let ctx: AnalyticsContext
beforeAll(() => {
  ctx = sampleCtx()
}, 60_000)

describe('Filter to on the Org chart', () => {
  it('a card’s org count: the chart starts at the person and their card keeps the count', () => {
    const m = orgModel(ctx)
    // Managers with an org, largest first, so the sample takes real orgs.
    const managers = (x: AnalyticsContext) =>
      cards(x)
        .filter((c) => c.org > 0)
        .sort((a, b) => b.org - a.org || a.id.localeCompare(b.id))
    expectFilterTo(
      ctx,
      {
        name: 'card org count',
        rows: managers,
        key: (r) => r.id,
        value: (r) => r.org,
        drill: (r, x) => () => orgDrill(orgModel(x).tree, r.id, chartScope(x)),
        // Orgs nest, so the column has no total; the person's own card is what must hold.
        kind: 'rate',
      },
      // Also from inside a leader's org (a sub-org narrows it) and without one (an org apart).
      { sample: 5, variants: true },
    )
    // The top leader's org is the whole company: neither action is offered (Filter to would
    // change no one, Leave out would leave no one).
    const [top, ...rest] = managers(ctx)
    const topFilter = orgDrill(m.tree, top.id, chartScope(ctx))?.filter ?? {}
    expect(topFilter).toEqual({ leaderId: top.id })
    expect(offeredScope(ctx, topFilter, 'include')).toBeNull()
    expect(offeredScope(ctx, topFilter, 'exclude')).toBeNull()
    for (const c of rest.slice(0, 6)) {
      const spec = orgDrill(m.tree, c.id, chartScope(ctx))
      expect(spec?.filter).toEqual({ leaderId: c.id })
      const next = applyDrillFilter(ctx, spec?.filter ?? {})
      const after = orgModel(next)
      expect(after.rootId).toBe(c.id)
      // The org is the person and everyone counted on their card.
      expect(orgKeyFigures(after, after.rootId, null).people.length).toBe(c.org + 1)
      expect(spec?.rows.length).toBe(c.org)
    }
  })

  it('Leave out an org: the company’s people drop by the org and its leader', () => {
    expectLeaveOut(
      ctx,
      {
        name: 'people on the chart by top leader’s org',
        // The top leader's direct reports' orgs split the company (plus the top leader).
        rows: (x) => {
          const m = orgModel(x)
          const people = orgKeyFigures(m, m.tree.rootId, m.dims ? m.matches : null).people
          const inScope = new Set(people)
          const top = m.tree.rootId
          return (m.tree.children.get(top) ?? []).map((id) => ({
            id,
            n: subtreeOf(m.tree, id).filter((x) => inScope.has(x)).length,
          }))
        },
        key: (r) => r.id,
        value: (r) => r.n,
        drill: (r, x) => () => orgDrill(orgModel(x).tree, r.id, chartScope(x)),
      },
      { sample: 2, variants: true },
    )
  })

  it('sets nothing for direct reports, the company root, key figures or the sandbox', () => {
    const m = orgModel(ctx)
    const top = m.tree.rootId
    expect(directsDrill(m.tree, top, chartScope(ctx))?.filter).toBeUndefined()
    expect(orgDrill(m.tree, COMPANY_ROOT, chartScope(ctx))?.filter).toBeUndefined()
    expect(orgDrill(m.tree, top, { ...chartScope(ctx), scenario: true })?.filter).toBeUndefined()
    const key = orgKeyFigures(m, top, null)
    for (const spec of Object.values(
      keyFigureDrills(m.tree, top, key, chartScope(ctx), m.flags, m.reqRecords),
    ))
      expect(spec?.filter).toBeUndefined()
  })

  it('only ever sets a leader on the roster', () => {
    const allowed = new Set<string>([...FILTER_DIMENSIONS, 'modes'])
    const m = orgModel(ctx)
    let n = 0
    for (const id of subtreeOf(m.tree, m.rootId).slice(0, 400)) {
      const filter = resolveDrill(() => orgDrill(m.tree, id, chartScope(ctx)))?.filter
      if (!filter) continue
      n++
      for (const k of Object.keys(filter)) expect(allowed.has(k), `filter key ${k}`).toBe(true)
      expect(Object.keys(filter)).toEqual(['leaderId'])
      expect(ctx.org.byId.has(filter.leaderId as string)).toBe(true)
    }
    expect(n).toBeGreaterThan(20)
  })
})
