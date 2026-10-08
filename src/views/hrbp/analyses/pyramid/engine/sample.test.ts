/**
 * The Level pyramid on the sample company (docs/ANALYSES.md, 5.2, 5.6 and 7.2): every measured
 * number recounted from the raw rows, the flow reconciling at every level, the findings that fire
 * (an L3 bulge, a thin L1) and the ones that do not, drills that hold the number clicked, finite
 * or null values only, and Manager mode kept inside the manager's org.
 */
import { describe, expect, it } from 'vitest'
import { leaderOptions } from '@/app/filterOptions'
import { sampleCtx as askCtx } from '@/ask/engine/testkit'
import type { Employee, Level } from '@/data/schema'
import { LEVELS } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { isActiveAt } from '@/lib/people'
import { metricsWith } from '@/metrics/testing'
import { sampleCtx } from '../../../engine/fixtures'
import { analysisModel } from '../../registry'
import { flowSpec, mixSpec, ratioSpec, rowSpec, segmentSpec, spanSpec } from './drill'
import { type PyramidModel, pyramidModel } from './index'
import { PYRAMID_METRIC } from './metrics'
import { BANDS, type PyramidData } from './model'

const ctx = sampleCtx()
const m = pyramidModel(ctx)
const d = m.data
const raw = ctx.all.employees
const AS_OF = ctx.asOf
const YEAR_AGO = '2025-09-30'
const count = (src: unknown) => resolveDrill(src as Parameters<typeof resolveDrill>[0])?.rows.length ?? 0

/** The level a person held on a date, rebuilt here from the raw job changes on its own. */
function levelOn(e: Employee, date: string): string | null {
  const steps = ctx.all.jobChanges
    .filter(
      (c) =>
        c.employeeId === e.employeeId && c.effectiveDate > date && c.toLevel && c.fromLevel !== c.toLevel,
    )
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
  return steps.length ? (steps[0].fromLevel ?? null) : e.level
}

describe('the sample shape, recounted from the raw rows', () => {
  const employees = raw.filter((e) => e.employmentType === 'Employee')

  it('today: L1 65, L2 191, L3 314, L4 293, L5 219, L6 105, M1 200, M2 43, E1 12, E2 4, E3 4', () => {
    const recount = Object.fromEntries(
      LEVELS.map((l) => [l, employees.filter((e) => isActiveAt(e, AS_OF) && e.level === l).length]),
    )
    expect(Object.fromEntries(d.main.rows.map((r) => [r.level, r.today]))).toEqual(recount)
    expect(recount).toEqual({
      L1: 65,
      L2: 191,
      L3: 314,
      L4: 293,
      L5: 219,
      L6: 105,
      M1: 200,
      M2: 43,
      E1: 12,
      E2: 4,
      E3: 4,
    })
    expect(d.main.total).toBe(1450)
    expect(m.kpis[0]).toMatchObject({ value: 1450, delta: 103, metricId: 'hrbp.headcount.employees' })
  })

  it('a year ago: L1 73, L2 186, L3 240, L4 264, L5 228, L6 98, M1 198, M2 40 (1,347, +7.6%)', () => {
    const recount = Object.fromEntries(
      LEVELS.map((l) => [
        l,
        employees.filter((e) => isActiveAt(e, YEAR_AGO) && levelOn(e, YEAR_AGO) === l).length,
      ]),
    )
    expect(Object.fromEntries(d.main.rows.map((r) => [r.level, r.yearAgo]))).toEqual(recount)
    expect(recount).toMatchObject({ L1: 73, L2: 186, L3: 240, L4: 264, L5: 228, L6: 98, M1: 198, M2: 40 })
    expect(d.main.yearAgoTotal).toBe(1347)
    expect(d.workforceGrowth).toBeCloseTo(103 / 1347, 12)
  })

  it('L3 grew 30.8%: 240 + 108 hired + 47 promoted in − 31 promoted out − 50 left = 314', () => {
    const l3 = d.flow.find((r) => r.level === 'L3')!
    expect(l3).toMatchObject({
      yearAgo: 240,
      hired: 108,
      promotedIn: 47,
      promotedOut: 31,
      left: 50,
      other: 0,
      today: 314,
    })
    expect(l3.growth).toBeCloseTo(74 / 240, 12)
    // Hires and promotions recounted from the raw rows.
    const hired = raw.filter(
      (e) =>
        e.employmentType === 'Employee' &&
        e.hireDate > YEAR_AGO &&
        e.hireDate <= AS_OF &&
        levelOn(e, e.hireDate) === 'L3',
    )
    expect(hired).toHaveLength(108)
    const promotedIn = ctx.all.jobChanges.filter(
      (c) =>
        c.changeType === 'Promotion' &&
        c.toLevel === 'L3' &&
        c.effectiveDate > YEAR_AGO &&
        c.effectiveDate <= AS_OF &&
        raw.some((e) => e.employeeId === c.employeeId && e.employmentType === 'Employee'),
    )
    expect(promotedIn).toHaveLength(47)
  })

  it('L1: 73 + 28 hired − 30 promoted to L2 − 6 left = 65', () => {
    expect(d.flow.find((r) => r.level === 'L1')).toMatchObject({
      yearAgo: 73,
      hired: 28,
      promotedIn: 0,
      promotedOut: 30,
      left: 6,
      other: 0,
      today: 65,
    })
  })

  it('reconciles at every level', () => {
    for (const r of d.flow)
      expect(r.yearAgo + r.hired + r.promotedIn - r.promotedOut - r.left + r.other, r.level).toBe(r.today)
  })

  it('entry 17.7%, senior individual 22.3%, management and executive 18.1%', () => {
    const tile = (id: string) => m.kpis.find((k) => k.id === id)!
    expect(tile('pyramid-entry').value).toBeCloseTo(256 / 1450, 12)
    expect(tile('pyramid-senior').value).toBeCloseTo(324 / 1450, 12)
    expect(tile('pyramid-management').value).toBeCloseTo(263 / 1450, 12)
    expect(tile('pyramid-entry').delta).toBeCloseTo(256 / 1450 - 259 / 1347, 12)
    for (const id of ['pyramid-entry', 'pyramid-senior', 'pyramid-management'])
      expect(tile(id).metricId).toBe(PYRAMID_METRIC.levelMix)
    expect(tile('pyramid-manager-ratio').metricId).toBe('hrbp.org.managerRatio')
  })

  it('size against the level below: 2.94, 1.64, 0.93, 0.75, 0.48', () => {
    const r = Object.fromEntries(d.ratios.map((x) => [x.key, x.ratio]))
    expect(r['L2/L1']).toBeCloseTo(191 / 65, 12)
    expect(r['L3/L2']).toBeCloseTo(314 / 191, 12)
    expect(r['L4/L3']).toBeCloseTo(293 / 314, 12)
    expect(r['L5/L4']).toBeCloseTo(219 / 293, 12)
    expect(r['L6/L5']).toBeCloseTo(105 / 219, 12)
    expect(r['M2/M1']).toBeCloseTo(43 / 200, 12)
    expect(r['E1-E3/M2']).toBeCloseTo(20 / 43, 12)
  })

  it('median span M1 6, M2 6; E2 and E3 too few managers to show', () => {
    const s = Object.fromEntries(d.spans.map((x) => [x.key, x]))
    expect(s.M1).toMatchObject({ managers: 200, median: 6 })
    expect(s.M2).toMatchObject({ managers: 43, median: 6 })
    expect(s.E1.managers).toBe(12)
    expect(s.E2).toMatchObject({ managers: 4, median: null })
    expect(s.E3).toMatchObject({ managers: 4, median: null })
  })
})

describe('the readout on the sample', () => {
  it('finds the L3 bulge and the thin L1, and nothing else', () => {
    expect(m.findings.map((f) => f.id)).toEqual(['hrbp-pyramid-bulge-L3', 'hrbp-pyramid-thin'])
    const [bulge, thin] = m.findings
    expect(bulge).toMatchObject({
      severity: 'warning',
      metricId: PYRAMID_METRIC.findings,
      title: 'L3 grew 31% in 12 months, from 240 to 314, while the workforce grew 8%.',
      detail: '108 people were hired at L3 and 47 promoted into it; 31 were promoted to L4 and 50 left.',
      action: 'Plan L4 promotion capacity for 2027 with the business units that hired at L3.',
      filter: { level: ['L3'] },
    })
    expect(thin).toMatchObject({
      severity: 'info',
      title: 'L1 is the thinnest individual level: 65 people, a third of L2 (191).',
      detail: 'Entry levels are 17.7% of employees, and L1 shrank by 8 in a year.',
      action: 'Check that entry-level hiring matches the plan for growing future senior engineers.',
    })
    expect(count(bulge.drill)).toBe(314)
    expect(count(thin.drill)).toBe(65)
    for (const f of m.findings) expect(f.uses?.length, f.id).toBeGreaterThan(0)
    expect(m.notes).toEqual([
      { at: 'L3', text: '+31% in a year' },
      { at: 'L1', text: 'a third of L2' },
    ])
  })

  it('does not fire an inverted step above L3, a span outside the band or a top-heavy unit', () => {
    expect(m.findings.some((f) => f.id.startsWith('hrbp-pyramid-inverted'))).toBe(false)
    expect(m.findings.some((f) => f.id.startsWith('hrbp-pyramid-span'))).toBe(false)
    expect(m.findings.some((f) => f.id.startsWith('hrbp-pyramid-top-heavy'))).toBe(false)
  })

  it('follows each setting', () => {
    const run = (params: Parameters<typeof metricsWith>[0]) =>
      pyramidModel(sampleCtx({}, metricsWith(params))).findings
    const ids = (params: Parameters<typeof metricsWith>[0]) => run(params).map((f) => f.id)
    // L3 grew 23.2 pts faster than the workforce; L1 is 0.34 of L2.
    expect(ids({ [PYRAMID_METRIC.findings]: { bulgeGap: 0.25 } })).not.toContain('hrbp-pyramid-bulge-L3')
    expect(ids({ [PYRAMID_METRIC.findings]: { minLevel: 400 } })).not.toContain('hrbp-pyramid-bulge-L3')
    expect(ids({ [PYRAMID_METRIC.findings]: { thinRatio: 0.3 } })).not.toContain('hrbp-pyramid-thin')
    // Silicon Engineering sits 3.9 pts above the company's senior and up share.
    const heavy = run({ [PYRAMID_METRIC.findings]: { topHeavyGap: 0.03 } }).find((f) =>
      f.id.startsWith('hrbp-pyramid-top-heavy'),
    )
    expect(heavy?.title).toMatch(
      /^44\.4% of Silicon Engineering is at senior, management or executive levels/,
    )
    expect(heavy?.detail).toMatch(
      /^The company's own mix for the same job functions would put it at \d+\.\d%/,
    )
    expect(
      ids({ [PYRAMID_METRIC.findings]: { topHeavyGap: 0.03, minUnit: 600 } }).some((id) =>
        id.includes('top-heavy'),
      ),
    ).toBe(false)
    // A looser tolerance clears the warning marks on L2 and L3.
    const loose = pyramidModel(
      sampleCtx({}, metricsWith({ [PYRAMID_METRIC.ratioBelow]: { tolerance: 0.7 } })),
    )
    expect(loose.data.ratios.filter((r) => r.inverted).map((r) => r.key)).toEqual(['L2/L1'])
    expect(d.ratios.filter((r) => r.inverted).map((r) => r.key)).toEqual(['L2/L1', 'L3/L2'])
  })
})

describe('every number on the sample', () => {
  const finiteOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v))

  it('is finite or null, and nothing under the minimum carries a rate', () => {
    const min = d.prep.set.minGroup
    for (const r of [...d.main.rows, ...d.workers.rows]) {
      for (const v of [r.today, r.yearAgo, r.change, r.growth, r.share, r.company])
        expect(finiteOrNull(v)).toBe(true)
      if (r.yearAgo != null && r.yearAgo < min) expect(r.growth).toBeNull()
    }
    for (const s of Object.values(d.segments).flat()) {
      expect(finiteOrNull(s.shareOfLevel)).toBe(true)
      const level = (s.split === 'workerType' ? d.workers : d.main).rows.find((r) => r.level === s.level)!
      if (level.today < min) expect(s.shareOfLevel).toBeNull()
    }
    for (const s of d.spans)
      if (s.managers < min)
        expect([s.min, s.q1, s.median, s.q3, s.max]).toEqual([null, null, null, null, null])
    for (const r of d.mix) {
      expect(finiteOrNull(r.share)).toBe(true)
      if (r.groupTotal < min) expect(r.share).toBeNull()
    }
    for (const k of m.kpis) expect(finiteOrNull(k.value), k.id).toBe(true)
  })

  it('opens exactly the records behind it', () => {
    for (const r of d.main.rows) expect(count(rowSpec(d, r)), r.level).toBe(r.today)
    for (const s of Object.values(d.segments).flat())
      expect(count(segmentSpec(d, s)), `${s.split} ${s.segment}`).toBe(s.today)
    for (const q of d.ratios) expect(count(ratioSpec(d, q)), q.key).toBe(q.upperCount + q.lowerCount)
    for (const s of d.spans) if (s.median != null) expect(count(spanSpec(d, s)), s.key).toBe(s.managers)
    for (const f of d.flow)
      for (const cell of ['yearAgo', 'hired', 'promotedIn', 'promotedOut', 'left', 'today'] as const)
        expect(count(flowSpec(d, f, cell)), `${f.level} ${cell}`).toBe(f[cell])
    for (const r of d.mix) {
      const band = BANDS.find((b) => b.key === r.band)!
      expect(count(mixSpec(d, r, band)), `${r.group} ${r.band}`).toBe(r.people)
    }
    for (const k of m.kpis.slice(0, 4)) {
      const n =
        k.id === 'pyramid-employees' ? (k.value as number) : Math.round((k.value as number) * d.main.total)
      expect(count(k.drill), k.id).toBe(n)
    }
    expect(count(m.kpis[0].deltaDrill)).toBe(1347)
  })

  it('holds no protected field or proxy in what it groups by', () => {
    const splits = Object.keys(d.segments)
    expect(splits).toEqual(['businessUnit', 'tenure', 'workerType'])
  })
})

describe('Manager mode', () => {
  const hr = askCtx()
  const leaders = leaderOptions(hr.org, hr.asOf, 3)
  const mid = leaders.find((l) => l.size >= 60 && l.size <= 200 && hr.org.byId.get(l.id)?.managerId)!
  const mgr = askCtx({ access: { mode: 'manager', managerId: mid.id } })
  const mm = analysisModel<PyramidModel>(mgr, 'pyramid')
  const md: PyramidData = mm.data

  it('counts only people in the org, and draws the company only as an aggregate', () => {
    const org = mgr.access.lock!.orgIds
    const people: Employee[] = [
      ...md.main.rows.flatMap((r) => [...r.records, ...r.yearAgoRecords]),
      ...md.workers.rows.flatMap((r) => r.records),
      ...md.flow.flatMap((f) => [...f.records.hired, ...f.records.left, ...f.records.other]),
      ...md.spans.flatMap((s) => s.records.map((x) => x.employee)),
    ]
    expect(people.length).toBeGreaterThan(0)
    for (const e of people) expect(org.has(e.employeeId), e.employeeId).toBe(true)
    expect(md.scoped).toBe(true)
    expect(md.main.rows.some((r) => (r.company ?? 0) > 0)).toBe(true)
    // The company's mix row opens no records there.
    const companyRow = md.mix.find((r) => r.company && r.people > 0)!
    expect(mixSpec(md, companyRow, BANDS.find((b) => b.key === companyRow.band)!)).toBeNull()
    expect(mm.kpis.length).toBe(5)
  })

  it('shows a level under five people by its count, without a span', () => {
    const levels = md.main.rows.filter((r) => r.today > 0 && r.today < 5).map((r) => r.level as Level)
    for (const l of levels) expect(md.main.rows.find((r) => r.level === l)!.today).toBeGreaterThan(0)
    for (const s of md.spans) if (s.managers < 5) expect(s.median).toBeNull()
  })
})
