/**
 * "Filter to this" on the Level pyramid (docs/ANALYSES.md, 7.4; docs/FILTERS.md, part 4): after
 * Filter to from a number, the same figure shows the same number for that group, and nothing else
 * is left in scope. Levels, two levels, a level in a business unit and a band in a business unit
 * are groups; tenure bands, worker types, Other and the company row are not.
 */
import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { resolveDrill } from '@/drill/Drill'
import { expectFilterTo, expectLeaveOut } from '@/drill/testing'
import { sampleCtx } from '../../../engine/fixtures'
import { mixSpec, ratioSpec, rowSpec, segmentSpec } from './drill'
import { pyramidKpis } from './kpis'
import { BANDS, pyramidData } from './model'

const base = sampleCtx()
const data = (c: AnalyticsContext) => pyramidData(c)

describe('Filter to on the pyramid', () => {
  it('every level row', () => {
    const c = {
      name: 'pyramid rows',
      rows: (x: AnalyticsContext) => data(x).main.rows,
      key: (r: { level: string }) => r.level,
      value: (r: { today: number }) => r.today,
      drill: (r: Parameters<typeof rowSpec>[1], x: AnalyticsContext) => () => rowSpec(data(x), r),
    }
    expectFilterTo(base, c, { variants: true, sample: 11 })
    expectLeaveOut(base, c, { sample: 4 })
  })

  it('every business unit segment: the level in the unit', () => {
    expectFilterTo(
      base,
      {
        name: 'pyramid business unit segments',
        rows: (x) => data(x).segments.businessUnit,
        key: (s) => `${s.level}|${s.segment}`,
        value: (s) => s.today,
        drill: (s, x) => () => segmentSpec(data(x), s),
      },
      { sample: 8 },
    )
  })

  it('no filter on tenure bands, worker types or Other', () => {
    const d = data(base)
    for (const s of [...d.segments.tenure, ...d.segments.workerType])
      expect(resolveDrill(segmentSpec(d, s))?.filter, `${s.split} ${s.segment}`).toBeUndefined()
    for (const s of d.segments.businessUnit.filter((x) => x.segment === 'Other'))
      expect(resolveDrill(segmentSpec(d, s))?.filter).toBeUndefined()
  })

  it('size against the level below: both levels, the same ratio', () => {
    expectFilterTo(
      base,
      {
        name: 'size against the level below',
        rows: (x) => data(x).ratios,
        key: (r) => r.key,
        value: (r) => r.ratio,
        drill: (r, x) => () => ratioSpec(data(x), r),
        kind: 'rate',
      },
      { sample: 7 },
    )
  })

  it('the level mix tiles: the levels become the whole scope', () => {
    expectFilterTo(base, {
      name: 'level mix tiles',
      rows: (x) => pyramidKpis(data(x)).filter((k) => k.metricId === 'hrbp.pyramid.levelMix'),
      key: (k) => k.id,
      value: (k) => k.value,
      drill: (k) => k.drill,
      kind: 'share',
    })
  })

  it('the level mix by business unit: a band in a unit', () => {
    const band = (key: string) => BANDS.find((b) => b.key === key)!
    expectFilterTo(
      base,
      {
        name: 'level mix segments',
        // The company row is a benchmark from the whole company, so it is not part of the scope's total.
        rows: (x) => data(x).mix.filter((r) => !r.company),
        key: (r) => `${r.group}|${r.band}`,
        value: (r) => r.people,
        drill: (r, x) => () => mixSpec(data(x), r, band(r.band)),
      },
      { sample: 10 },
    )
  })
})
