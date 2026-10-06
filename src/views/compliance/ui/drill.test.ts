/**
 * "Filter to this" on Compliance (docs/FILTERS.md, part 4): I-9 Section 2 by site and the
 * jurisdictions reproduce their number after "Filter to", "Leave out" removes the group, and no
 * drill in the view sets a filter on anything but the sites it groups by.
 */
import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { vocabularyOf } from '@/data/urlScope'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { filterDimensions, filterInData } from '@/drill/filter'
import { applyDrillFilter, expectFilterTo, expectLeaveOut } from '@/drill/testing'
import type { DrillFilter } from '@/drill/types'
import { actions, compute } from '../engine'
import type { JurisdictionRow } from '../engine/deadlines'
import type { SiteRow } from '../engine/i9'
import { USES } from '../engine/lineage'
import { sampleContext } from '../engine/testkit'
import { deadlineDrill, i9SiteCells, jurisdictionDrill } from './drill'

const ctx = sampleContext()
const filterOf = (src: DrillSource): DrillFilter | undefined => resolveDrill(src)?.filter

describe('Compliance: Filter to and Leave out', () => {
  it('I-9 Section 2 by site filters to the site and keeps its starts and on-time share', () => {
    const judged = {
      name: 'US starts judged by site',
      rows: (c: AnalyticsContext) => compute(c).i9.bySite,
      key: (r: SiteRow) => r.site,
      value: (r: SiteRow) => r.judged,
      drill: (r: SiteRow, c: AnalyticsContext) => i9SiteCells(compute(c).scope, USES.i9).all(r),
    }
    expectFilterTo(ctx, judged, { sample: 4, variants: true })
    expectLeaveOut(ctx, judged, { sample: 2, variants: true })
    expectFilterTo(ctx, {
      ...judged,
      name: 'I-9 Section 2 on time by site',
      value: (r) => r.rate,
      kind: 'rate',
    })
    const late = compute(ctx).i9.bySite.find((r) => r.late > 0)
    expect(late && filterOf(i9SiteCells(compute(ctx).scope, USES.i9).late(late))).toEqual({
      location: [late?.site],
      modes: {},
    })
  }, 60_000)

  it('a jurisdiction filters to its sites: the same people, and everyone left is covered by it', () => {
    const people = {
      name: 'employees covered by jurisdiction',
      rows: (c: AnalyticsContext) => compute(c).deadlines.jurisdictions,
      key: (r: JurisdictionRow) => r.jurisdiction.id,
      value: (r: JurisdictionRow) => r.people.length,
      drill: (r: JurisdictionRow, c: AnalyticsContext) =>
        jurisdictionDrill(compute(c).scope, USES.deadlines)(r),
      // US federal law covers every US state's people, so the rows overlap: compare the group itself.
      kind: 'rate' as const,
    }
    expectFilterTo(ctx, people, { sample: 6 })
    const rows = compute(ctx).deadlines.jurisdictions
    expect(rows.length).toBeGreaterThan(3)
    for (const j of rows) {
      const filter = filterOf(jurisdictionDrill(compute(ctx).scope, USES.deadlines)(j)) as DrillFilter
      expect(filterDimensions(filter), j.jurisdiction.id).toEqual(['location'])
      // The actions name the jurisdiction ("Filter to US Federal"), not its sites.
      expect(resolveDrill(jurisdictionDrill(compute(ctx).scope, USES.deadlines)(j))?.filterLabel).toBe(
        j.jurisdiction.shortName,
      )
      const covered = new Set(j.people.map((e) => e.employeeId))
      for (const x of compute(applyDrillFilter(ctx, filter)).deadlines.jurisdictions)
        for (const e of x.people)
          expect(covered.has(e.employeeId), `${j.jurisdiction.id}: ${x.jurisdiction.id}`).toBe(true)
      const out = compute(applyDrillFilter(ctx, filter, 'exclude')).deadlines.jurisdictions
      expect(
        out.find((x) => x.jurisdiction.id === j.jurisdiction.id),
        `${j.jurisdiction.id} left out`,
      ).toBeUndefined()
    }
  }, 60_000)

  it('a calendar entry filters to the sites of its jurisdiction', () => {
    const m = compute(ctx)
    expect(m.deadlines.upcoming.length).toBeGreaterThan(0)
    for (const d of m.deadlines.upcoming) {
      const j = m.deadlines.jurisdictions.find(
        (x) => x.jurisdiction.id === d.jurisdiction.id,
      ) as JurisdictionRow
      expect(filterOf(deadlineDrill(m.scope, USES.deadlines)(d))).toEqual(
        filterOf(jurisdictionDrill(m.scope, USES.deadlines)(j)),
      )
    }
  })
})

describe('Compliance: no drill sets a filter the view does not group by', () => {
  it('only sites, always ones in the data; tiles, findings and items set none', () => {
    const m = compute(ctx)
    const whole: DrillSource[] = [
      ...m.kpis.map((k) => k.drill),
      ...m.findings.map((f) => f.drill),
      ...actions(ctx).map((a) => a.drill),
    ]
    for (const src of whole) expect(filterOf(src)).toBeUndefined()
    const sites = i9SiteCells(m.scope, USES.i9)
    const grouped: DrillSource[] = [
      ...m.i9.bySite.flatMap((r) => [sites.all(r), sites.late(r)]),
      ...m.deadlines.jurisdictions.map((r) => jurisdictionDrill(m.scope, USES.deadlines)(r)),
      ...m.deadlines.upcoming.map((d) => deadlineDrill(m.scope, USES.deadlines)(d)),
    ]
    const vocab = vocabularyOf(ctx)
    let n = 0
    for (const src of grouped) {
      const filter = filterOf(src)
      if (!filter) continue
      n++
      expect(filterDimensions(filter)).toEqual(['location'])
      expect(filter.period).toBeUndefined()
      expect(filterInData(filter, vocab), JSON.stringify(filter)).toBe(true)
    }
    expect(n).toBeGreaterThan(5)
  }, 60_000)
})
