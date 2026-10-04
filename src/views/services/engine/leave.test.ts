/**
 * Leave & return: exact definitions on hand-built rows (pairing, on leave now, return rate,
 * retention after return, exits around leave, the LV-03 check), the privacy rules (groups under
 * the minimum, reasons never beside a name) and the settings that govern them.
 */
import { describe, expect, it } from 'vitest'
import { invalidRefs } from '@/data/quality'
import type { Employee, HrTransaction, LeaveReason } from '@/data/schema'
import { resolveDrill } from '@/drill/Drill'
import { buildDrillTable, PERSON_KEY } from '@/drill/records'
import { drillDataset } from '@/drill/types'
import { metricsWith, metricsWithEdits } from '@/metrics/testing'
import { M } from '../metrics'
import { compute } from './index'
import {
  exitCluster,
  exitsAround,
  groupCount,
  isOnLeave,
  leaveFacts,
  NO_REASON,
  OTHER_REASONS,
  onLeaveAt,
  onLeaveByReason,
  onLeaveByUnit,
  pairLeaves,
  retention,
  returnRate,
  upcomingReturns,
} from './leave'
import { groupRow, leaveGroupsDrill } from './leaveDrills'
import { emp, fixtureContext, tx } from './testkit'

const AS_OF = '2026-09-30'

function leave(employeeId: string, start: string, o: Partial<HrTransaction> = {}): HrTransaction {
  return tx({
    type: 'Leave start',
    employeeId,
    submittedDate: start,
    effectiveDate: start,
    dueDate: start,
    completedDate: start,
    leaveReason: 'Medical',
    ...o,
  })
}

function back(employeeId: string, date: string, o: Partial<HrTransaction> = {}): HrTransaction {
  return tx({
    type: 'Return from leave',
    employeeId,
    submittedDate: date,
    effectiveDate: date,
    dueDate: date,
    completedDate: date,
    ...o,
  })
}

const staff = (n: number, o: (i: number) => Partial<Employee> = () => ({})): Employee[] =>
  Array.from({ length: n }, (_, i) => emp({ employeeId: `E${i}`, name: `Person ${i}`, ...o(i) }))
const index = (people: readonly Employee[]) => new Map(people.map((e) => [e.employeeId, e]))

describe('pairing leaves with returns', () => {
  it('pairs each leave start with the next return of the same person on or after it', () => {
    const rows = [
      leave('A', '2026-01-10'),
      back('A', '2026-02-01'),
      leave('A', '2026-05-01'),
      back('A', '2026-06-15'),
      back('B', '2026-03-01'),
      leave('B', '2026-04-01'),
    ]
    const pairs = pairLeaves(rows)
    expect(pairs.map((p) => [p.start.effectiveDate, p.ret?.effectiveDate ?? null])).toEqual([
      ['2026-01-10', '2026-02-01'],
      ['2026-04-01', null],
      ['2026-05-01', '2026-06-15'],
    ])
  })

  it('keeps a leave open when the return is entered ahead for a later date', () => {
    const people = index(staff(1, () => ({ employeeId: 'A' })))
    const [f] = leaveFacts(
      [leave('A', '2026-08-01'), back('A', '2026-10-12', { completedDate: '2026-09-20' })],
      AS_OF,
      people,
    )
    expect(f.end).toBeNull()
    expect(f.returned).toBeNull()
    expect(isOnLeave(f, AS_OF)).toBe(true)
    expect(f.ret?.effectiveDate).toBe('2026-10-12')
    expect(f.retProcessed).toBe('2026-09-20')
  })

  it('ends a leave with an exit before the return, and drops a leave that starts after the exit', () => {
    const people = index([
      emp({ employeeId: 'A', terminationDate: '2026-03-01', terminationType: 'Voluntary' }),
      emp({ employeeId: 'B', terminationDate: '2026-01-01', terminationType: 'Voluntary' }),
    ])
    const facts = leaveFacts([leave('A', '2026-02-01'), leave('B', '2026-02-01')], AS_OF, people)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ employeeId: 'A', end: 'left', endDate: '2026-03-01', days: null })
    expect(isOnLeave(facts[0], '2026-02-15')).toBe(true)
    expect(isOnLeave(facts[0], AS_OF)).toBe(false)
  })

  it('leaves out leave starts after the as-of date', () => {
    expect(leaveFacts([leave('A', '2026-10-05')], AS_OF, new Map())).toEqual([])
  })
})

describe('the measures', () => {
  it('counts the return rate over leaves that ended in the window', () => {
    const people = index([
      ...staff(6),
      emp({ employeeId: 'L', terminationDate: '2026-06-01', terminationType: 'Voluntary' }),
    ])
    const rows = [
      ...staff(6).map((e, i) => leave(e.employeeId, `2026-0${i + 1}-02`)),
      ...staff(6).map((e, i) => back(e.employeeId, `2026-0${i + 2}-01`)),
      leave('L', '2026-04-01'),
    ]
    const facts = leaveFacts(rows, AS_OF, people)
    const r = returnRate(facts, { start: '2025-10-01', end: AS_OF })
    expect(r).toMatchObject({ hits: 6, n: 7, people: 7 })
    expect(r.rate).toBeCloseTo(6 / 7)
    // Under the minimum the rate is hidden, not zero.
    expect(returnRate(facts, { start: '2026-01-01', end: '2026-03-31' }).rate).toBeNull()
  })

  it('judges retention on returns 12 to 24 months back, by reason', () => {
    const people = index([
      ...staff(10, (i) => ({
        terminationDate: i < 2 ? '2025-12-01' : i === 2 ? '2026-08-01' : null,
        terminationType: i < 3 ? 'Voluntary' : null,
      })),
      // Returned before the cohort window and after it: left out.
      emp({ employeeId: 'X' }),
      emp({ employeeId: 'Y' }),
    ])
    const reason = (i: number): LeaveReason => (i < 6 ? 'Parental' : 'Medical')
    const rows = [
      ...staff(10).flatMap((e, i) => [
        leave(e.employeeId, '2025-01-06', { leaveReason: reason(i) }),
        back(e.employeeId, '2025-04-01'),
      ]),
      leave('X', '2024-06-01'),
      back('X', '2024-09-30'),
      leave('Y', '2025-09-01'),
      back('Y', '2025-10-01'),
    ]
    const facts = leaveFacts(rows, AS_OF, people)
    const r = retention(facts, AS_OF, 12, true)
    expect(r.from).toBe('2024-10-01')
    expect(r.to).toBe('2025-09-30')
    // Two left within 12 months of returning (Dec 2025); one left after them (Aug 2026), so stayed.
    expect(r.overall).toMatchObject({ returners: 10, retained: 8, left: 2 })
    expect(r.parental).toMatchObject({ returners: 6, retained: 4 })
    expect(r.parental?.rate).toBeCloseTo(4 / 6)
    expect(r.others).toMatchObject({ returners: 4, retained: 4 })
    // Medical has 4 people: folded into Other with nothing else, and its rate hidden.
    expect(r.byReason.map((g) => [g.group, g.rate == null])).toEqual([
      ['Parental', false],
      ['Other (1)', true],
    ])
    // A shorter horizon moves the cohort.
    expect(retention(facts, AS_OF, 6, true).from).toBe('2025-10-01')
  })

  it('finds people who left soon after returning, and during a leave', () => {
    const people = index([
      ...staff(6),
      emp({
        employeeId: 'S',
        department: 'Digital Design',
        terminationDate: '2026-03-01',
        terminationType: 'Voluntary',
      }),
      emp({ employeeId: 'T', terminationDate: '2026-09-01', terminationType: 'Involuntary' }),
      emp({ employeeId: 'D', terminationDate: '2026-02-01', terminationType: 'Voluntary' }),
    ])
    const rows = [
      ...staff(6).flatMap((e) => [leave(e.employeeId, '2025-09-01'), back(e.employeeId, '2025-11-03')]),
      leave('S', '2025-08-01'),
      back('S', '2025-12-01'),
      // Seven months after returning: not soon.
      leave('T', '2025-11-01'),
      back('T', '2026-02-01'),
      leave('D', '2026-01-05'),
    ]
    const facts = leaveFacts(rows, AS_OF, people)
    const e = exitsAround(facts, { start: '2025-10-01', end: AS_OF }, 6)
    expect(e.soon.map((x) => [x.fact.employeeId, x.exit, x.daysAfter])).toEqual([['S', '2026-03-01', 90]])
    expect(e.during.map((f) => f.employeeId)).toEqual(['D'])
    expect(exitsAround(facts, { start: '2025-10-01', end: AS_OF }, 8).soon).toHaveLength(2)
  })

  it('checks upcoming returns against LV-03, not ready first', () => {
    const people = index(staff(3))
    const rows = [
      leave('E0', '2026-08-01', { expectedReturnDate: '2026-10-05' }),
      back('E0', '2026-10-05', { completedDate: '2026-09-25' }),
      leave('E1', '2026-08-01', { expectedReturnDate: '2026-10-20' }),
      back('E1', '2026-10-20', { completedDate: null }),
      leave('E2', '2026-08-01', { expectedReturnDate: '2026-10-03' }),
      // Planned beyond the look-ahead.
      leave('E3', '2026-08-01', { expectedReturnDate: '2026-12-01' }),
    ]
    const up = upcomingReturns(leaveFacts(rows, AS_OF, people), AS_OF, 30, 7)
    expect(up.map((u) => [u.fact.employeeId, u.status, u.daysAway, u.urgent])).toEqual([
      ['E2', 'Not entered', 3, true],
      ['E1', 'Entered, not processed', 20, false],
      ['E0', 'Ready', 5, false],
    ])
    expect(upcomingReturns(leaveFacts(rows, AS_OF, people), AS_OF, 90, 7)).toHaveLength(4)
  })
})

describe('privacy', () => {
  it('hides a count of people under the anonymity minimum', () => {
    const facts = leaveFacts(
      staff(4).map((e) => leave(e.employeeId, '2026-09-01')),
      AS_OF,
      index(staff(4)),
    )
    expect(groupCount(onLeaveAt(facts, AS_OF))).toBeNull()
    expect(groupCount([])).toBe(0)
    expect(groupCount(onLeaveAt(facts, AS_OF), 3)).toBe(4)
  })

  it('names a reason only when 5 or more share it and not everyone does', () => {
    const people = staff(12, (i) => ({ businessUnit: i < 7 ? 'Silicon Engineering' : 'Operations' }))
    const reasons: LeaveReason[] = [
      'Parental',
      'Parental',
      'Parental',
      'Parental',
      'Parental',
      'Medical',
      'Medical',
    ]
    const rows = [
      ...people.slice(0, 7).map((e, i) => leave(e.employeeId, '2026-09-01', { leaveReason: reasons[i] })),
      // Operations: five people, all on medical leave.
      ...people.slice(7).map((e) => leave(e.employeeId, '2026-09-01', { leaveReason: 'Medical' })),
    ]
    const now = onLeaveAt(leaveFacts(rows, AS_OF, index(people)), AS_OF)
    expect(onLeaveByUnit(now, true).map((r) => [r.unit, r.reason, r.people])).toEqual([
      ['Silicon Engineering', 'Parental', 5],
      ['Silicon Engineering', OTHER_REASONS, 2],
      // Naming "Medical" here would say what every person in the unit is on leave for.
      ['Operations', OTHER_REASONS, 5],
    ])
    expect(onLeaveByReason(now).map((r) => [r.reason, r.people])).toEqual([
      ['Medical', 7],
      ['Parental', 5],
    ])
    const noReason = rows.map((t) => ({ ...t, leaveReason: null }))
    const now2 = onLeaveAt(leaveFacts(noReason, AS_OF, index(people)), AS_OF)
    expect(onLeaveByReason(now2)).toEqual([expect.objectContaining({ reason: OTHER_REASONS, people: 12 })])
    expect(NO_REASON).toBe('Not recorded')
  })

  it('opens reason cuts as groups that open no person and hide small groups', () => {
    const ctx = fixtureContext({})
    const rows = [
      groupRow({
        groupBy: 'Leave reason',
        group: 'Whole company',
        reason: 'Parental',
        measure: 'Median days',
        value: 40,
        format: 'days',
        rows: staff(6).map((e) => ({ person: e.employeeId })),
        min: 5,
      }),
      groupRow({
        groupBy: 'Business unit',
        group: 'Operations',
        reason: 'Parental',
        measure: 'Median days',
        value: 12,
        format: 'days',
        rows: staff(2).map((e) => ({ person: e.employeeId })),
        min: 5,
      }),
    ]
    expect(rows[1]).toMatchObject({ suppressed: true, people: null, leaves: null, value: null })
    const spec = leaveGroupsDrill(
      {
        on: true,
        per: 'last 12 months',
        window: ctx.window,
        asOf: AS_OF,
        scope: 'Whole company',
        caseCols: { firstResponseAt: true, resolvedAt: true },
      },
      rows,
      'On leave now, parental',
    )
    const table = buildDrillTable(spec!, { org: ctx.org, asOf: AS_OF, all: ctx.all, showPay: false })
    expect(table.rows.map((r) => [r.group, r.people, r.value, r.shown])).toEqual([
      ['Whole company', 6, 40, 'Yes'],
      ['Operations', null, null, 'Hidden to protect anonymity'],
    ])
    expect(table.rows.every((r) => r[PERSON_KEY] == null)).toBe(true)
    expect(table.columns.find((c) => c.key === 'value')?.format).toBeTypeOf('function')
    expect(drillDataset('leaveGroups')).toBe('transactions')
  })

  it('never puts a leave reason beside a name in a drill', () => {
    const people = staff(8, (i) => ({ businessUnit: i < 4 ? 'Silicon Engineering' : 'Operations' }))
    const rows = people.map((e, i) =>
      leave(e.employeeId, '2026-09-01', {
        leaveReason: i % 2 ? 'Parental' : 'Medical',
        expectedReturnDate: '2026-10-08',
      }),
    )
    const ctx = fixtureContext({ employees: people, transactions: rows })
    const m = compute(ctx)
    const kpi = m.leave.kpis.find((k) => k.id === 'leave-on-leave')
    expect(kpi?.value).toBe(8)
    const spec = resolveDrill(kpi?.drill)
    expect(spec?.kind).toBe('transactions')
    const table = buildDrillTable(spec!, { org: ctx.org, asOf: ctx.asOf, all: ctx.all, showPay: false })
    const text = JSON.stringify(table)
    expect(text).not.toMatch(/Parental|Medical|leaveReason/)
    expect(table.rows).toHaveLength(8)
    // Reason cuts open groups with no person in them.
    const groups = m.leave.findings.length ? m.leave.findings : []
    for (const f of groups) {
      const s = resolveDrill(f.drill)
      if (s?.kind === 'leaveGroups')
        for (const r of s.rows) expect(Object.keys(r)).not.toContain('employeeId')
    }
  })
})

describe('the Leave & return tab on fixtures', () => {
  const people = staff(30, (i) => ({
    department: i < 10 ? 'Digital Design' : 'Analog Design',
    terminationDate: i < 6 ? '2026-03-02' : null,
    terminationType: i < 6 ? 'Voluntary' : null,
  }))
  // Twelve came back from parental leave on 15 Sep 2025 (the retention cohort) and the first six
  // of them, all in Digital Design, left five and a half months later. Eighteen came back from
  // medical leave on 1 Oct 2025, inside the period.
  const rows = people.flatMap((e, i) => [
    leave(e.employeeId, '2025-07-01', { leaveReason: i < 12 ? 'Parental' : 'Medical' }),
    back(e.employeeId, i < 12 ? '2025-09-15' : '2025-10-01'),
  ])
  // Six people due back within the look-ahead, two without a return entered.
  const upcoming = staff(6, (i) => ({ employeeId: `U${i}`, name: `Upcoming ${i}` }))
  const upRows = upcoming.flatMap((e, i) => [
    leave(e.employeeId, '2026-09-01', { expectedReturnDate: i < 2 ? '2026-10-03' : '2026-10-15' }),
    ...(i < 2 ? [] : [back(e.employeeId, '2026-10-15', { completedDate: '2026-09-28' })]),
  ])
  const ctx = fixtureContext({ employees: [...people, ...upcoming], transactions: [...rows, ...upRows] })
  const m = compute(ctx)

  it('fills five KPIs, each linked to its metric with valid fields', () => {
    expect(m.leave.kpis.map((k) => k.id)).toEqual([
      'leave-on-leave',
      'leave-length',
      'leave-returns-soon',
      'leave-return-rate',
      'leave-retention',
    ])
    for (const k of m.leave.kpis) {
      expect(k.metricId?.startsWith('services.leave.'), k.id).toBe(true)
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      expect(invalidRefs(k.uses ?? []), k.id).toEqual([])
      expect(k.value === null || Number.isFinite(k.value), k.id).toBe(true)
    }
    const kpi = (id: string) => m.leave.kpis.find((k) => k.id === id)
    expect(kpi('leave-on-leave')?.value).toBe(6)
    expect(kpi('leave-returns-soon')?.value).toBe(6)
    expect(kpi('leave-returns-soon')?.note).toBe('2 without systems ready (LV-03)')
    expect(kpi('leave-length')?.value).toBe(92)
  })

  it('raises returns without systems ready, critical within the urgent window', () => {
    const f = m.leave.findings.find((x) => x.id === 'services-leave-returns-not-ready')
    expect(f?.severity).toBe('critical')
    expect(f?.title).toBe(
      '2 of the 6 people due back from leave in the next 30 days do not have systems ready.',
    )
    expect(f?.metricId).toBe(M.returnsNotReady)
    expect(f?.people?.map((p) => p.name)).toEqual(['Upcoming 0', 'Upcoming 1'])
    // Nothing about why anyone is on leave.
    expect(JSON.stringify(f)).not.toMatch(/Parental|Medical/)
  })

  it('raises the department where exits after a return concentrate, as a count only', () => {
    const f = m.leave.findings.find((x) => x.id === 'services-leave-exit-cluster')
    expect(f?.title).toBe(
      '6 of the 6 people who left within 6 months of returning from leave were in Digital Design.',
    )
    expect(f?.people).toBeUndefined()
    expect(resolveDrill(f?.drill)?.kind).toBe('leaveGroups')
  })

  it('reads its thresholds from the dictionary', () => {
    const later = compute(
      fixtureContext(
        { employees: [...people, ...upcoming], transactions: [...rows, ...upRows] },
        AS_OF,
        metricsWith({ [M.returnsSoon]: { aheadDays: 2 } }),
      ),
    )
    expect(later.leave.upcoming).toHaveLength(0)
    const shorter = compute(
      fixtureContext(
        { employees: [...people, ...upcoming], transactions: [...rows, ...upRows] },
        AS_OF,
        metricsWith({ [M.exitsAfterReturn]: { months: 4 } }),
      ),
    )
    expect(shorter.leave.exits.soon).toHaveLength(0)
    expect(shorter.leave.findings.some((x) => x.id === 'services-leave-exit-cluster')).toBe(false)
    const lower = compute(
      fixtureContext(
        { employees: [...people, ...upcoming], transactions: [...rows, ...upRows] },
        AS_OF,
        metricsWithEdits([
          { metricId: M.retention, field: 'target', value: { value: 0.5, comparator: '>=' } },
        ]),
      ),
    )
    expect(m.leave.findings.some((x) => x.id === 'services-leave-retention-parental')).toBe(true)
    expect(lower.leave.findings.some((x) => x.id === 'services-leave-retention-parental')).toBe(false)
  })

  it('names no one in the exit cluster and finds the count only with enough leavers', () => {
    expect(exitCluster(m.leave.exits.soon, { minShare: 0.5, minLeavers: 5 })?.count).toBe(6)
    expect(exitCluster(m.leave.exits.soon.slice(0, 4), { minShare: 0.5, minLeavers: 3 })).toBeNull()
  })

  it('says why when nothing is loaded', () => {
    const none = compute(fixtureContext({}))
    expect(none.leave.hasLeave).toBe(false)
    expect(none.leave.findings).toEqual([])
    for (const k of none.leave.kpis) expect(k.value, k.id).toBeNull()
  })
})
