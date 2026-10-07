/**
 * Cases per 100 employees by business unit (engine/rates.ts): each rate recounts from the raw
 * cases and the roster, small units fold into Other with their numbers hidden, the drill lists the
 * unit's cases, and "Filter to" the unit keeps its rate.
 */
import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { resolveDrill } from '@/drill/Drill'
import { expectFilterTo } from '@/drill/testing'
import { dateOf } from '@/lib/dates'
import { avgHeadcount } from '@/lib/people'
import { unitCasesDrill } from '../ui/drill'
import { computeCached } from '.'
import { per100 } from './rates'
import { emp, fixtureContext, kase, sampleContext } from './testkit'

describe('cases per 100 employees', () => {
  it('annualizes cases over the average headcount, hiding a unit behind too few requesters', () => {
    expect(per100(10, 50, 12)).toBeCloseTo(20, 10)
    expect(per100(10, 50, 6)).toBeCloseTo(40, 10)
    expect(per100(10, 4, 12)).toBeNull()
    const a = Array.from({ length: 6 }, (_, i) => emp({ employeeId: `A${i}`, businessUnit: 'Operations' }))
    const b = Array.from({ length: 6 }, (_, i) => emp({ employeeId: `B${i}`, businessUnit: 'Sales' }))
    const cases = [
      ...a.map((e) => kase({ requesterId: e.employeeId, openedAt: '2026-05-04T09:00' })),
      ...a.map((e) => kase({ requesterId: e.employeeId, openedAt: '2026-06-04T09:00' })),
      kase({ requesterId: 'B0', openedAt: '2026-05-04T09:00' }),
      kase({ requesterId: 'B1', openedAt: '2026-05-04T09:00' }),
      kase({ requesterId: null, openedAt: '2026-05-04T09:00' }),
    ]
    const m = computeCached(fixtureContext({ employees: [...a, ...b], cases }))
    const rows = m.per100.rows
    expect(rows.map((r) => [r.unit, r.cases])).toEqual([
      ['Operations', 12],
      ['Other (1)', null],
    ])
    expect(rows[0].rate).toBeCloseTo(200, 10)
    expect(rows[1].rate).toBeNull()
    expect(m.per100.unplaced).toBe(1)
  })

  it('recounts the sample from the raw cases and roster', () => {
    const ctx = sampleContext()
    const m = computeCached(ctx)
    const w = ctx.window
    const opened = ctx.data.cases.filter((c) => {
      const d = dateOf(c.openedAt)
      return d >= w.start && d <= w.end
    })
    const shown = m.per100.rows.filter((r) => r.rate != null && !r.unit.startsWith('Other'))
    expect(shown.length).toBeGreaterThan(2)
    for (const r of shown) {
      const mine = opened.filter(
        (c) => c.requesterId && ctx.org.byId.get(c.requesterId)?.businessUnit === r.unit,
      )
      expect(r.cases, r.unit).toBe(mine.length)
      const hc = avgHeadcount(
        ctx.data.employees.filter((e) => e.businessUnit === r.unit),
        w,
      )
      expect(r.rate).toBeCloseTo((mine.length / hc) * 100 * (12 / w.months), 8)
      // Listed plus employee relations counted in the note: the number clicked.
      const spec = resolveDrill(unitCasesDrill(m.scope)(r))
      const withheld = Number(/^(\d+) employee relations/.exec(spec?.note ?? '')?.[1] ?? 0)
      expect((spec?.rows.length ?? 0) + withheld, r.unit).toBe(r.cases)
      expect(spec?.filter?.businessUnit).toEqual([r.unit])
    }
    expect(m.per100.company).not.toBeNull()
  })

  it('keeps a unit’s rate after Filter to the unit', () => {
    expectFilterTo(
      sampleContext(),
      {
        name: 'cases per 100 employees by business unit',
        rows: (c: AnalyticsContext) => computeCached(c).per100.rows,
        key: (r) => r.unit,
        value: (r) => r.rate,
        drill: (r, c) => unitCasesDrill(computeCached(c).scope)(r),
        kind: 'rate',
      },
      { sample: 3 },
    )
  }, 60_000)
})
