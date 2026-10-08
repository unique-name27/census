/**
 * Every quality of hire number opens exactly the hires it is computed over (docs/ANALYSES.md,
 * 2.6 and 7.4): range rows, the parts figure, the heatmap, the tiles and the findings. The
 * business unit and site rows of the parts figure "Filter to" their group and the numbers hold;
 * education, source, Other and Company rows set no filter.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { type DrillSource, resolveDrill } from '@/drill/Drill'
import { expectFilterTo, expectLeaveOut } from '@/drill/testing'
import type { DrillSpec } from '@/drill/types'
import { sampleCtx } from '@/views/hrbp/engine/fixtures'
import { analysisModel } from '../../registry'
import type { Hire } from './cohort'
import {
  cellDrill,
  cellRows,
  groupDrill,
  type PartCut,
  type PartsRow,
  partsBars,
  partsDrill,
  partsRows,
  rangeRows,
  ratedDrill,
  retainedDrill,
} from './figures'
import type { QualityModel } from './model'

let ctx: AnalyticsContext
let m: QualityModel
beforeAll(() => {
  ctx = sampleCtx()
  m = analysisModel<QualityModel>(ctx, 'quality')
}, 60_000)

const model = (c: AnalyticsContext) => analysisModel<QualityModel>(c, 'quality')
const spec = (src: DrillSource): DrillSpec | null => resolveDrill(src)
const meanQ = (mm: QualityModel, s: DrillSpec | null) => {
  const byEmp = new Map(mm.hires.map((h) => [h.e, h]))
  const qs = (s?.rows ?? []).map((e) => byEmp.get(e as Hire['e'])?.Q as number)
  return qs.reduce((a, b) => a + b, 0) / qs.length
}

describe('drills equal the number clicked', () => {
  it('range rows: scored hires behind the mean, rated behind the first review, retained behind stayed a year', () => {
    for (const rows of [m.cuts.university, m.cuts.degree, m.cuts.field, m.cuts.source]) {
      for (const r of rangeRows(rows)) {
        const s = groupDrill(m.drill, r.group, r.g)
        if (r.q == null) {
          expect(s, r.group).toBeNull()
          continue
        }
        expect(s?.rows.length, r.group).toBe(r.hires)
        expect(meanQ(m, s)).toBeCloseTo(r.q, 9)
        expect(s?.filter, r.group).toBeUndefined()
        if (r.p != null) expect(ratedDrill(m.drill, r.group, r.g)?.rows.length).toBe(r.g.rated.length)
        const ret = retainedDrill(m.drill, r.group, r.g)
        if (r.r != null) {
          const stayed = (ret?.rows ?? []).filter((e) => m.hires.find((h) => h.e === e)?.R === 100).length
          expect(stayed / (ret?.rows.length ?? 1)).toBeCloseTo(r.r, 12)
        }
      }
    }
  })

  it('the parts figure, the heatmap, the tiles and the findings', () => {
    for (const r of partsRows(m)) {
      if (r.g.q != null) expect(spec(partsDrill(m, 'scored')(r))?.rows.length, r.group).toBe(r.hires)
      if (r.p != null) expect(spec(partsDrill(m, 'rated')(r))?.rows.length, r.group).toBe(r.rated)
      if (r.r != null) expect(spec(partsDrill(m, 'retained')(r))?.rows.length, r.group).toBe(r.retained)
    }
    for (const c of cellRows(m.cells)) {
      const s = cellDrill(m.drill, c)
      if (c.q == null) expect(s).toBeNull()
      else {
        expect(s?.rows.length).toBe(c.hires)
        expect(meanQ(m, s)).toBeCloseTo(c.q, 9)
      }
    }
    const tile = (id: string) => spec(m.kpis.find((k) => k.id === id)?.drill)
    expect(tile('quality-score')?.rows.length).toBe(m.scope.n)
    expect(meanQ(m, tile('quality-score'))).toBeCloseTo(m.scope.q as number, 9)
    expect(tile('quality-retention')?.rows.length).toBe(m.counts.retained)
    expect(tile('quality-performance')?.rows.length).toBe(m.counts.rated)
    expect(tile('quality-cohort')?.rows.length).toBe(m.counts.cohort)
    expect(tile('quality-education')?.rows.length).toBe(m.counts.cohort - m.counts.recorded)
    // Stayed a year lists those who did not stay first.
    const ret = tile('quality-retention')?.rows ?? []
    const firstStayer = ret.findIndex((e) => m.hires.find((h) => h.e === e)?.R === 100)
    expect(ret.slice(0, firstStayer).every((e) => m.hires.find((h) => h.e === e)?.R === 0)).toBe(true)
    const coyote = m.findings.find((f) => f.title.includes('Coyote Valley'))
    expect(spec(coyote?.drill)?.rows.length).toBe(38)
    // Every drill carries the number's fields, for its tier.
    for (const k of m.kpis) expect(spec(k.drill)?.uses?.length, k.id).toBeGreaterThan(0)
  })
})

describe('Filter to this', () => {
  const rowsOf = (cut: PartCut, measure: 'p' | 'r' | 'hires') => (c: AnalyticsContext) =>
    partsRows(model(c)).filter(
      (r) => r.cut === cut && r.kind !== 'company' && (measure === 'hires' || r[measure] != null),
    )

  for (const cut of ['businessUnit', 'location'] as const) {
    it(`reproduces each ${cut} row's first review score and stayed a year`, () => {
      for (const [measure, which] of [
        ['p', 'rated'],
        ['r', 'retained'],
      ] as const)
        expectFilterTo(
          ctx,
          {
            name: `quality parts ${cut} ${measure}`,
            rows: rowsOf(cut, measure),
            key: (r: PartsRow) => r.group,
            value: (r: PartsRow) => r[measure],
            drill: (r: PartsRow, c) => partsDrill(model(c), which)(r),
            kind: 'rate',
          },
          { variants: true },
        )
    })

    it(`keeps each ${cut} row's scored hires, and Leave out takes them away`, () => {
      const c = {
        name: `quality parts ${cut} hires`,
        rows: rowsOf(cut, 'hires'),
        key: (r: PartsRow) => r.group,
        value: (r: PartsRow) => r.hires,
        drill: (r: PartsRow, cc: AnalyticsContext) => partsDrill(model(cc), 'scored')(r),
      }
      expectFilterTo(ctx, c)
      expectLeaveOut(ctx, c)
    })
  }

  it('sets no filter on education, source, Other or Company rows', () => {
    for (const r of partsRows(m)) {
      const f = spec(partsDrill(m, 'scored')(r))?.filter
      if (r.kind === 'value' && (r.cut === 'businessUnit' || r.cut === 'location'))
        expect(f, r.group).toBeTruthy()
      else expect(f, `${r.cut} ${r.group}`).toBeUndefined()
    }
  })

  it('draws two bars per group on one 0 to 100 axis, the company first', () => {
    const bars = partsBars(partsRows(m), 'degree')
    expect(bars[0]).toMatchObject({ group: 'Company', measure: 'First review score' })
    expect(bars[1].value).toBeCloseTo((m.company.r as number) * 100, 12)
    for (const b of bars) expect(b.value == null || (b.value >= 0 && b.value <= 100)).toBe(true)
  })
})
