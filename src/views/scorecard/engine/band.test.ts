/**
 * The Scorecard's chart band: the status split and the bullets read the model's own judgements,
 * the gap to target is signed and in the measure's unit, "furthest from target" ranks share
 * measures by their points (other units go to the table), and the attrition figures recount from
 * the roster.
 */
import { describe, expect, it } from 'vitest'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Employee } from '@/data/schema'
import { isActiveAt, isEmployee } from '@/data/scope'
import { snapshotDates } from '@/lib/people'
import { hrbpModel } from '@/views/hrbp/engine'
import { VIEWS } from '@/views/registry'
import {
  attritionByQuarter,
  gapRows,
  gapText,
  measureRows,
  otherUnitText,
  practiceStanding,
  REGRETTED,
  signedGap,
  standingCounts,
  VOLUNTARY,
  voluntaryByUnit,
} from './band'
import { buildScorecard } from './model'
import { computeScorecard } from './schedule'
import { kpi, practice, sampleContext } from './testkit'

const target = (comparator: '>=' | '<=' | '<', value: number) => ({ comparator, value })

describe('gap to target', () => {
  it('is signed so that below zero misses, in the measure’s own unit', () => {
    const row = (value: number, t: ReturnType<typeof target>) => ({
      target: t as never,
      kpi: kpi({ id: 'x', value }),
      shown: true,
    })
    expect(signedGap(row(0.78, target('>=', 0.85)))).toBeCloseTo(-0.07, 12)
    expect(signedGap(row(0.9, target('>=', 0.85)))).toBeCloseTo(0.05, 12)
    expect(signedGap(row(52, target('<=', 45)))).toBe(-7)
    expect(signedGap(row(40, target('<=', 45)))).toBe(5)
    expect(signedGap({ ...row(0.5, target('>=', 0.6)), shown: false })).toBeNull()
    expect(signedGap({ target: null, kpi: kpi({ id: 'x' }), shown: true })).toBeNull()
    expect(gapText(-0.07, 'pct')).toBe('−7.0 pts')
    expect(gapText(-7, 'days')).toBe('−7 d')
    expect(gapText(3, 'int')).toBe('+3')
    expect(gapText(null, 'pct')).toBe('')
  })
})

describe('measures against target', () => {
  // Two practices: days far over target, a share just under, a share far over, and no target.
  const ctx = sampleContext()
  const HIRE: readonly FieldRef[] = ['employees.hireDate']
  const recruiting = [
    kpi({ id: 'ttf', metricId: 'recruiting.reqs.timeToFill', value: 60, format: 'days', uses: HIRE }),
    kpi({ id: 'acc', metricId: 'recruiting.offers.acceptance', value: 0.84, format: 'pct', uses: HIRE }),
  ]
  const hrbp = [
    kpi({ id: 'vol', metricId: 'hrbp.attrition.voluntary', value: 0.25, format: 'pct', uses: HIRE }),
    kpi({ id: 'none', value: 3, format: 'int', uses: HIRE }),
  ]
  const model = buildScorecard(ctx, [
    { view: practice('recruiting', { kpis: [], findings: [] }), summary: { kpis: recruiting, findings: [] } },
    { view: practice('hrbp', { kpis: [], findings: [] }), summary: { kpis: hrbp, findings: [] } },
  ])

  it('keeps the scorecard order by practice and puts the furthest miss first by gap', () => {
    const byPractice = measureRows(model).map((r) => r.id)
    expect(byPractice).toEqual(model.rows.map((r) => r.id))
    const byGap = measureRows(model, 'gap')
    const g = gapRows(model)
    // Share measures by their points, lowest first; days after them; no target last.
    expect(g.shares.map((r) => r.id)).toEqual(['hrbp:vol', 'recruiting:acc'])
    for (let i = 1; i < g.shares.length; i++)
      expect(g.shares[i - 1].gap ?? 0).toBeLessThanOrEqual(g.shares[i].gap ?? 0)
    expect(g.otherUnits.map((r) => r.id)).toEqual(['recruiting:ttf'])
    expect(g.rest.map((r) => r.id)).toEqual(['hrbp:none'])
    expect(byGap.map((r) => r.id)).toEqual([...g.shares, ...g.otherUnits, ...g.rest].map((r) => r.id))
    expect(byGap.find((r) => r.id === 'recruiting:ttf')?.gapText).toBe('−15 d')
    // The note names a measure in another unit with its value and target.
    const ttf = g.otherUnits[0]
    expect(otherUnitText(ttf)).toBe(
      `${ttf.measure}, 60 d against ${ttf.targetText.charAt(0).toLowerCase()}${ttf.targetText.slice(1)}`,
    )
  })

  it('splits the measures by the same statuses the counts use', () => {
    const split = standingCounts(model.counts)
    expect(split.met + split.watch + split.missed + split.none + split.hidden).toBe(model.counts.measures)
    expect(split.none).toBe(model.counts.noTarget)
    const byPractice = practiceStanding(model)
    expect(byPractice.map((p) => p.practice)).toEqual(model.practices.map((p) => p.label))
    expect(byPractice.reduce((n, p) => n + p.met, 0)).toBe(model.counts.met)
    expect(byPractice.reduce((n, p) => n + p.missed, 0)).toBe(model.counts.missed)
  })
})

describe('on the sample', () => {
  const ctx = sampleContext()
  const m = hrbpModel(ctx)
  const emps = ctx.all.employees.filter(isEmployee)
  const w = ctx.window
  const avgOf = (people: readonly Employee[], pts: readonly string[]) =>
    pts.reduce((n, d) => n + people.filter((e) => isActiveAt(e, d)).length, 0) / pts.length

  it('recounts voluntary attrition by business unit from the roster, against the company', () => {
    const { rows, company } = voluntaryByUnit(m)
    expect(rows.length).toBeGreaterThan(2)
    expect(company).toBeCloseTo(m.kpi.vol.rate ?? Number.NaN, 12)
    const pts = snapshotDates(w)
    for (const u of rows) {
      const unit = emps.filter((e) => (e.businessUnit || 'Not recorded') === u.group)
      const exits = unit.filter(
        (e) =>
          e.terminationType === 'Voluntary' &&
          !!e.terminationDate &&
          e.terminationDate >= w.start &&
          e.terminationDate <= w.end,
      )
      const avg = avgOf(unit, pts)
      expect(u.voluntary, u.group).toBe(exits.length)
      expect(u.avgHeadcount, u.group).toBeCloseTo(avg, 9)
      if (avg >= 5) {
        expect(u.rate, u.group).toBeCloseTo((exits.length / avg) * (12 / w.months), 12)
        expect(u.leavers.map((e) => e.employeeId).sort()).toEqual(exits.map((e) => e.employeeId).sort())
      } else {
        expect(u.rate, u.group).toBeNull()
        expect(u.leavers).toEqual([])
      }
    }
    // The planted story: at least one unit is marked above the company.
    expect(rows.some((u) => u.above)).toBe(true)
    for (const u of rows.filter((x) => x.above))
      expect((u.rate ?? 0) - (company ?? 0)).toBeGreaterThanOrEqual(0.03 - 1e-12)
  })

  it('recounts each quarter’s voluntary exits from the roster', () => {
    const rows = attritionByQuarter(m)
    expect(rows.filter((r) => r.series === VOLUNTARY)).toHaveLength(8)
    expect(rows.filter((r) => r.series === REGRETTED)).toHaveLength(8)
    for (const r of rows.filter((x) => x.series === VOLUNTARY)) {
      const q = m.attrition.quarters.find((x) => x.end === r.quarterEnd && x.type === 'Voluntary')!
      const exits = emps.filter(
        (e) =>
          e.terminationType === 'Voluntary' &&
          !!e.terminationDate &&
          e.terminationDate >= q.start &&
          e.terminationDate <= q.end,
      )
      expect(r.exits, r.quarter).toBe(exits.length)
      expect(r.rate == null || Number.isFinite(r.rate)).toBe(true)
    }
  })

  it('judges the same model the page and the folder tab read', () => {
    const model = computeScorecard(ctx, VIEWS)
    const rows = measureRows(model)
    expect(rows).toHaveLength(model.rows.length)
    for (const r of rows) {
      expect(r.value == null || Number.isFinite(r.value), r.id).toBe(true)
      if (r.value != null) expect(r.row.kpi.drill, r.id).toBeTruthy()
    }
    expect(model.headline.value).toBe(`${model.counts.met} of ${model.counts.judged}`)
  })
})
