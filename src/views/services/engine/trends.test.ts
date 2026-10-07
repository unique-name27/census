/**
 * The HR ops trends (engine/trends.ts): each point recounts from the raw rows, each drill lists
 * exactly the number it was opened from, small groups are hidden, and the on-time heatmap's
 * quarter cell reproduces its rate after "Filter to".
 */
import { describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { CASE_OPEN_STATUSES } from '@/data/schema'
import { subtreeIds } from '@/data/scope'
import { expectFilterTo } from '@/drill/testing'
import { dateOf, daysBetween } from '@/lib/dates'
import { computeCached } from '.'
import { drillScope } from './drills'
import { caseColumns, caseFacts, txFacts } from './facts'
import { leaveFacts, onLeaveAt } from './leave'
import { emp, fixtureContext, kase, sampleContext, tx } from './testkit'
import { backlogPointDrill, onLeavePointDrill, typeQuarterDrill } from './trendDrills'
import { backlogByMonth, lastQuarters, leaveCoverage, onLeaveByMonth, onTimeByTypeQuarter } from './trends'

const OPEN = new Set<string>(CASE_OPEN_STATUSES)

describe('open cases at each month end', () => {
  const cases = [
    kase({ openedAt: '2026-06-02T09:00', resolvedAt: '2026-08-10T09:00', status: 'Resolved' }),
    kase({ openedAt: '2026-07-20T09:00', resolvedAt: '2026-08-02T09:00', status: 'Resolved' }),
    kase({ openedAt: '2026-08-25T09:00', resolvedAt: null, status: 'In progress' }),
  ]
  const facts = caseFacts(cases, '2026-09-30', caseColumns(cases))

  it('counts the cases open at the end of each date, and those past the age limit', () => {
    const pts = backlogByMonth(facts, ['2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30'], 14)
    expect(pts.map((p) => p.open)).toEqual([1, 2, 1, 1])
    // 30 Jun: opened 2 Jun (28 d). 31 Jul: 2 Jun (59 d) and 20 Jul (11 d). 31 Aug: 25 Aug (6 d).
    expect(pts.map((p) => p.aged)).toEqual([1, 1, 0, 1])
  })

  it('opens exactly the cases it counts, and nothing for a group under the minimum', () => {
    const ctx = fixtureContext({ cases })
    const s = drillScope(ctx, caseColumns(cases), false)
    const [p] = backlogByMonth(facts, ['2026-07-31'], 14)
    // Two cases from two unknown requesters: under the anonymity minimum.
    expect(backlogPointDrill(s, p, false)).toBeNull()
    expect(backlogPointDrill({ ...s, minGroup: 1 }, p, false)?.rows).toHaveLength(2)
    expect(backlogPointDrill({ ...s, minGroup: 1 }, p, 14)?.rows).toHaveLength(1)
  })
})

describe('on time by type and quarter', () => {
  it('lists the last calendar quarters, the last ending at the as-of date', () => {
    expect(lastQuarters('2026-08-15', 3)).toEqual([
      { key: '2026 Q1', start: '2026-01-01', end: '2026-03-31' },
      { key: '2026 Q2', start: '2026-04-01', end: '2026-06-30' },
      { key: '2026 Q3', start: '2026-07-01', end: '2026-08-15' },
    ])
  })

  it('shares on time by due quarter, with small cells hidden', () => {
    const rows = [
      // Q3: 5 new hires for 5 people, 4 on time.
      ...[1, 2, 3, 4].map(() => tx({ dueDate: '2026-08-03', completedDate: '2026-08-01' })),
      tx({ dueDate: '2026-08-03', completedDate: '2026-08-05' }),
      // Q2: 2 terminations, under the minimum.
      tx({ type: 'Termination', dueDate: '2026-05-01', completedDate: '2026-05-01' }),
      tx({ type: 'Termination', dueDate: '2026-05-01', completedDate: '2026-05-01' }),
      // Not yet due: left out.
      tx({ dueDate: '2026-10-05', completedDate: null }),
    ]
    const facts = txFacts(rows, '2026-09-30', new Map())
    const cells = onTimeByTypeQuarter(facts, lastQuarters('2026-09-30', 2), 5, 0.98)
    expect(cells.find((c) => c.rate != null)?.gap).toBeCloseTo(-0.18, 10)
    expect(cells.map((c) => [c.type, c.quarter, c.due, c.onTime, c.rate])).toEqual([
      ['New hire', '2026 Q2', 0, null, null],
      ['New hire', '2026 Q3', 5, 4, 0.8],
      ['Termination', '2026 Q2', 2, null, null],
      ['Termination', '2026 Q3', 0, null, null],
    ])
  })
})

describe('people on leave at each month end', () => {
  it('counts people on leave at each date, hidden under the minimum', () => {
    const people = new Map(['A', 'B'].map((id) => [id, emp({ employeeId: id })]))
    const rows = [
      tx({ type: 'Leave start', employeeId: 'A', effectiveDate: '2026-06-10' }),
      tx({ type: 'Return from leave', employeeId: 'A', effectiveDate: '2026-08-20' }),
      tx({ type: 'Leave start', employeeId: 'B', effectiveDate: '2026-07-05' }),
    ]
    const facts = leaveFacts(rows, '2026-09-30', people)
    const dates = ['2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31']
    expect(onLeaveByMonth(facts, dates, 1).map((p) => p.people)).toEqual([0, 1, 2, 1])
    expect(onLeaveByMonth(facts, dates, 5).map((p) => p.people)).toEqual([0, null, null, null])
  })

  it('counts a person with two overlapping leaves once, and lists them once', () => {
    // E11174 in the sample: two starts (2 Apr and 21 May), then two returns.
    const people = new Map(['A', 'B'].map((id) => [id, emp({ employeeId: id })]))
    const rows = [
      tx({ type: 'Leave start', employeeId: 'A', effectiveDate: '2026-04-02' }),
      tx({ type: 'Leave start', employeeId: 'A', effectiveDate: '2026-05-21' }),
      tx({ type: 'Return from leave', employeeId: 'A', effectiveDate: '2026-07-01' }),
      tx({ type: 'Return from leave', employeeId: 'A', effectiveDate: '2026-07-15' }),
      tx({ type: 'Leave start', employeeId: 'B', effectiveDate: '2026-05-01' }),
    ]
    const facts = leaveFacts(rows, '2026-09-30', people)
    const [may, jun] = onLeaveByMonth(facts, ['2026-05-31', '2026-06-30'], 1)
    expect(onLeaveAt(facts, '2026-05-31')).toHaveLength(3)
    expect(may.people).toBe(2)
    expect(may.records.map((f) => [f.employeeId, f.start]).sort()).toEqual([
      ['A', '2026-05-21'],
      ['B', '2026-05-01'],
    ])
    expect(jun.people).toBe(2)
  })

  it('starts the line once the leave history covers a whole leave', () => {
    const people = new Map(['A', 'B'].map((id) => [id, emp({ employeeId: id })]))
    const rows = [
      tx({ type: 'Leave start', employeeId: 'A', effectiveDate: '2025-01-10' }),
      tx({ type: 'Return from leave', employeeId: 'A', effectiveDate: '2025-03-11' }),
      tx({ type: 'Leave start', employeeId: 'B', effectiveDate: '2025-06-01' }),
      tx({ type: 'Return from leave', employeeId: 'B', effectiveDate: '2025-07-01' }),
    ]
    const facts = leaveFacts(rows, '2026-09-30', people)
    const c = leaveCoverage(['2025-06-01', '2025-01-10'], facts)
    expect(c.since).toBe('2025-01-10')
    // Leaves of 60 and 30 days: nine in ten finish within 57 days.
    expect(c.from).toBe('2025-03-08')
    const pts = onLeaveByMonth(facts, ['2025-02-28', '2025-03-31'], 1, c.from)
    expect(pts.map((p) => p.covered)).toEqual([false, true])
    expect(leaveCoverage([], [])).toEqual({ since: null, from: null })
  })
})

describe('the HR ops trends on the sample company', () => {
  const ctx = sampleContext()
  const m = computeCached(ctx)

  it('recounts every backlog point from the raw cases and ends at the open backlog', () => {
    expect(m.backlogTrend).toHaveLength(24)
    expect(m.backlogTrend.at(-1)?.open).toBe(m.backlogTotal)
    const days = m.settings.agedDays
    for (const p of m.backlogTrend) {
      const open = ctx.data.cases.filter((c) => {
        const opened = dateOf(c.openedAt)
        if (opened > p.date || opened > ctx.asOf) return false
        const resolved = c.resolvedAt && dateOf(c.resolvedAt) <= ctx.asOf ? dateOf(c.resolvedAt) : null
        return resolved ? resolved > p.date : OPEN.has(c.status)
      })
      expect(p.open, p.date).toBe(open.length)
      expect(p.aged, p.date).toBe(open.filter((c) => daysBetween(dateOf(c.openedAt), p.date) > days).length)
    }
    expect(Math.max(...m.backlogTrend.map((p) => p.open))).toBeGreaterThan(0)
  })

  it('opens the cases of a point: listed plus employee relations counted equals the number', () => {
    for (const p of m.backlogTrend.slice(-6)) {
      for (const aged of [false, m.settings.agedDays] as const) {
        const spec = backlogPointDrill(m.scope, p, aged)
        const n = aged === false ? p.open : p.aged
        if (!spec) continue
        const withheld = Number(/^(\d+) employee relations/.exec(spec.note ?? '')?.[1] ?? 0)
        expect(spec.rows.length + withheld, p.date).toBe(n)
        expect(spec.filter).toBeUndefined()
      }
    }
  })

  it('recounts every on-time cell from the raw transactions', () => {
    expect(m.quarters).toHaveLength(8)
    const shown = m.txQuarters.filter((c) => c.rate != null)
    expect(shown.length).toBeGreaterThan(10)
    for (const c of m.txQuarters) {
      const due = ctx.data.transactions.filter((t) => {
        if (t.type !== c.type || !t.dueDate) return false
        const d = dateOf(t.dueDate)
        if (d < c.start || d > c.end) return false
        const done = t.completedDate && dateOf(t.completedDate) <= ctx.asOf ? dateOf(t.completedDate) : null
        return done != null || d < ctx.asOf
      })
      const onTime = due.filter(
        (t) => t.completedDate && dateOf(t.completedDate) <= dateOf(t.dueDate as string),
      )
      expect(c.due, `${c.type} ${c.quarter}`).toBe(due.length)
      const people = new Set(due.map((t) => t.employeeId)).size
      if (due.length < 5 || people < 5) expect(c.rate).toBeNull()
      else expect(c.rate).toBeCloseTo(onTime.length / due.length, 10)
      expect(c.onTime).toBe(c.rate == null ? null : onTime.length)
    }
  })

  it('opens the transactions of a cell with its quarter as the period', () => {
    const c = m.txQuarters.find((x) => x.rate != null)
    const spec = c && typeQuarterDrill(m.scope, c)
    expect(spec?.rows).toHaveLength(c?.due ?? -1)
    expect(spec?.filter).toMatchObject({ period: 'custom', customStart: c?.start, customEnd: c?.end })
    expect(spec?.filterLabel).toBe(c?.quarter)
    const hidden = m.txQuarters.find((x) => x.rate == null && x.due > 0)
    if (hidden) expect(typeQuarterDrill(m.scope, hidden)).toBeNull()
  })

  it('keeps a cell rate after Filter to its quarter', () => {
    expectFilterTo(
      ctx,
      {
        name: 'on time by type and quarter',
        rows: (c: AnalyticsContext) => computeCached(c).txQuarters,
        key: (r) => `${r.type} ${r.quarter}`,
        value: (r) => r.rate,
        drill: (r, c) => typeQuarterDrill(computeCached(c).scope, r),
        kind: 'rate',
      },
      { sample: 3 },
    )
  }, 60_000)

  it('recounts people on leave at each month end and opens exactly them', () => {
    const l = m.leave
    expect(m.leaveTrend).toHaveLength(24)
    expect(m.leaveTrend.at(-1)?.people).toBe(new Set(l.now.map((f) => f.employeeId)).size)
    for (const p of m.leaveTrend) {
      // A count of people, as the On leave now tile counts them, one row per person.
      const ids = new Set(p.records.map((f) => f.employeeId))
      expect(ids.size).toBe(p.records.length)
      expect(ids.size).toBe(new Set(onLeaveAt(l.facts, p.date).map((f) => f.employeeId)).size)
      if (p.people == null) {
        expect(ids.size).toBeLessThan(m.settings.minGroup)
        expect(onLeavePointDrill(m.scope, p)).toBeNull()
        continue
      }
      expect(p.people).toBe(p.records.length)
      const spec = onLeavePointDrill(m.scope, p)
      expect(spec?.rows).toHaveLength(p.people)
      // The leave reason never reaches the list.
      expect(spec?.extra?.columns.some((col) => /reason/i.test(col.label))).toBe(false)
    }
    expect(m.leaveTrend.some((p) => (p.people ?? 0) > 0)).toBe(true)
  })

  it('hides every point and opens nothing in a scope under the minimum', () => {
    const sm = smallScopeModel(ctx)
    for (const p of sm.leaveTrend) {
      expect(p.people == null || p.people === 0).toBe(true)
      expect(onLeavePointDrill(sm.scope, p)).toBeNull()
    }
    for (const c of sm.txQuarters) expect(c.rate).toBeNull()
    for (const p of sm.backlogTrend) expect(backlogPointDrill(sm.scope, p, false)).toBeNull()
  })
})

/** The model for a manager's small team: a scope under the anonymity minimum. */
function smallScopeModel(ctx: AnalyticsContext) {
  const leaders = ctx.all.employees.filter((e) => {
    const n = subtreeIds(ctx.org, e.employeeId).size
    return !e.terminationDate && n >= 2 && n <= 4
  })
  for (const e of leaders.slice(0, 20)) {
    const m = computeCached(sampleContext({ leaderId: e.employeeId }))
    if (m.small) return m
  }
  throw new Error('no small team in the sample')
}
